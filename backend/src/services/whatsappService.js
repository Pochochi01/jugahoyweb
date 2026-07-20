/**
 * src/services/whatsappService.js
 *
 * Cliente para la WhatsApp Business Cloud API de Meta.
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Nota: Meta no publica un SDK oficial para Node.js.
 * La integración se hace mediante HTTP a la Graph API v20.0.
 *
 * Variables de entorno requeridas (.env):
 *   META_PHONE_NUMBER_ID      → ID del número WhatsApp Business
 *   META_ACCESS_TOKEN         → System User Token de Meta Business Suite
 *   META_WEBHOOK_VERIFY_TOKEN → Token propio para verificar el webhook
 *
 * En desarrollo (variables vacías): el payload se imprime en consola
 * en lugar de enviarse, facilitando testing sin cuenta activa de Meta.
 */
const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

/** Devuelve true si las credenciales de Meta están configuradas */
function isConfigured() {
  return Boolean(
    process.env.META_PHONE_NUMBER_ID &&
    process.env.META_ACCESS_TOKEN   &&
    process.env.META_PHONE_NUMBER_ID !== '' &&
    process.env.META_ACCESS_TOKEN   !== ''
  );
}

/**
 * Envía cualquier payload de mensaje a la Cloud API.
 * @param {object} payload — cuerpo del mensaje (sin messaging_product)
 */
async function sendMessage(payload) {
  const body = { messaging_product: 'whatsapp', ...payload };

  if (!isConfigured()) {
    console.log('[WhatsApp DEV] Faltan credenciales — mensaje NO enviado. Payload que se enviaría:');
    console.log(JSON.stringify(body, null, 2));
    return { ok: true, dev: true };
  }

  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/${process.env.META_PHONE_NUMBER_ID}/messages`,
      body,
      {
        headers: {
          Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[WhatsApp] → enviado a ${payload.to} (id: ${data?.messages?.[0]?.id || '?'})`);
    return data;
  } catch (err) {
    // Meta devuelve el motivo EXACTO del fallo en err.response.data.error
    const metaErr = err.response?.data?.error;
    console.error('[WhatsApp] ✗ Error al enviar a', payload.to, '→ HTTP', err.response?.status,
      '·', JSON.stringify(metaErr || err.message));
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
//  Constructores de mensajes interactivos
// ─────────────────────────────────────────────────────────────

/**
 * List message con los próximos 8 días.
 * @param {string} to   — número destino (ej. "5491100000000")
 * @param {Array}  days — [{ value: 'YYYY-MM-DD', label: 'Hoy 17 jun' }]
 */
function buildDaysListMessage(to, days) {
  return {
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type:   'list',
      header: { type: 'text', text: '📅 ¿Qué día querés jugar?' },
      body:   { text: 'Elegí uno de los próximos 8 días disponibles y pulsá "Ver días".' },
      footer: { text: 'JugaHoy — Reservas deportivas' },
      action: {
        button: 'Ver días',
        sections: [{
          title: 'Días disponibles',
          rows: days.map(d => ({
            id:          `day_${d.value}`,
            title:       d.label.substring(0, 24), // límite WhatsApp: 24 chars
            description: 'Toca para elegir',
          })),
        }],
      },
    },
  };
}

/**
 * List message con horarios disponibles agrupados por cancha.
 * Cada Field es una sección; máx. 10 slots por sección (límite WhatsApp).
 *
 * @param {string} to         — número destino
 * @param {string} fechaLabel — "Sábado 20 jun"
 * @param {Array}  sections   — [{ title, rows: [{ id, hora, precio }] }]
 */
function buildSchedulesListMessage(to, fechaLabel, sections) {
  return {
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type:   'list',
      header: { type: 'text', text: `⏰ Horarios — ${fechaLabel}` },
      body:   { text: 'Elegí una cancha y horario disponibles:' },
      footer: { text: 'Turnos de 1 hora · Confirmación inmediata' },
      action: {
        button: 'Ver horarios',
        sections: sections.map(sec => ({
          title: sec.title.substring(0, 24),
          rows:  sec.rows.slice(0, 10).map(r => ({
            id:          `slot_${r.id}`,
            title:       `${r.hora} hs`.substring(0, 24),
            description: `$${Number(r.precio || 0).toLocaleString('es-AR')}/hr · ${r.tipo || ''}`.substring(0, 72),
          })),
        })),
      },
    },
  };
}

/**
 * List message con las 3 franjas horarias (mañana / tarde / noche).
 * @param {string} to           — número destino
 * @param {string} fechaLabel   — "Sábado 20 jul"
 * @param {string} fechaCompact — "20260720" (para armar los IDs)
 */
function buildGroupsListMessage(to, fechaLabel, fechaCompact) {
  return {
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type:   'list',
      header: { type: 'text', text: `🕐 ${fechaLabel}` },
      body:   { text: '¿En qué franja horaria querés jugar?' },
      footer: { text: 'JugaHoy — Reservas deportivas' },
      action: {
        button: 'Ver franjas',
        sections: [{
          title: 'Franjas horarias',
          rows: [
            { id: `grp_${fechaCompact}_manana`, title: '🌅 Mañana', description: '09 a 13 hs' },
            { id: `grp_${fechaCompact}_tarde`,  title: '☀️ Tarde',  description: '14 a 18 hs' },
            { id: `grp_${fechaCompact}_noche`,  title: '🌙 Noche',  description: '19 a 02 hs' },
          ],
        }],
      },
    },
  };
}

/**
 * List message genérico con filas ya armadas [{ id, title, description }].
 * Se usa para: horarios disponibles y canchas de un horario.
 */
function buildRowsListMessage(to, { headerText, bodyText, footerText, button, sectionTitle, rows }) {
  return {
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type:   'list',
      header: { type: 'text', text: headerText.substring(0, 60) },
      body:   { text: bodyText },
      footer: { text: footerText },
      action: {
        button,
        sections: [{
          title: (sectionTitle || '').substring(0, 24),
          rows: rows.slice(0, 10).map(r => ({
            id:          r.id,
            title:       String(r.title).substring(0, 24),
            description: String(r.description || '').substring(0, 72),
          })),
        }],
      },
    },
  };
}

/**
 * Reply-button message para confirmar o descartar la reserva.
 * @param {string} to      — número destino
 * @param {object} info    — { slotId, fechaLabel, hora, cancha }
 */
function buildConfirmMessage(to, { slotId, fechaLabel, hora, cancha }) {
  return {
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type:   'button',
      header: { type: 'text', text: '✅ Confirmar reserva' },
      body: {
        text: `¿Confirmamos este turno?\n\n📅 ${fechaLabel}\n⏰ ${hora} hs\n🏟️ ${cancha}`,
      },
      footer: { text: 'Esta acción reserva el turno de forma definitiva' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `confirm_${slotId}`, title: '✅ Confirmar'  } },
          { type: 'reply', reply: { id: `discard_${slotId}`, title: '❌ Cancelar'   } },
        ],
      },
    },
  };
}

/**
 * Tres mensajes CTA (Call-to-Action URL) para enviar tras confirmar.
 * WhatsApp solo permite 1 URL por mensaje interactivo → se envían 3 separados.
 * @param {string} to — número destino
 */
function buildExtrasMessages(to) {
  const entries = [
    {
      body:    '🌐 Visitá nuestra web para ver toda la info del club.',
      label:   'Visitar la web del club',
      urlEnv:  'CLUB_WEB_URL',
      urlFallback: 'https://jugahoy.com.ar',
    },
    {
      body:    '📋 Conocé las reglas antes de jugar.',
      label:   'Ver reglamento de uso',
      urlEnv:  'CLUB_REGLAMENTO_URL',
      urlFallback: 'https://jugahoy.com.ar/reglamento',
    },
    {
      body:    '💳 Pagá tu turno de forma segura online.',
      label:   'Pagar online',
      urlEnv:  'CLUB_PAGO_URL',
      urlFallback: 'https://jugahoy.com.ar/pagar',
    },
  ];

  return entries.map(e => ({
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: e.body },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: e.label,
          url: process.env[e.urlEnv] || e.urlFallback,
        },
      },
    },
  }));
}

module.exports = {
  sendMessage,
  buildDaysListMessage,
  buildSchedulesListMessage,
  buildGroupsListMessage,
  buildRowsListMessage,
  buildConfirmMessage,
  buildExtrasMessages,
};
