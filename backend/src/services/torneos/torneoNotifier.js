'use strict';
/**
 * services/torneos/torneoNotifier.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mensajes automáticos de torneos por WhatsApp.
 *
 * El canal lo define el superadmin por club (club_integrations.wa_provider):
 *   - 'meta'    → Cloud API. Respeta la ventana de 24 h: fuera de ella usa la
 *                 plantilla tipo 'torneo' (una variable {{1}} con el texto).
 *   - 'baileys' → sesión de WhatsApp Web del club (texto libre + imágenes).
 *
 * Nunca lanza: un fallo de WhatsApp no debe romper la inscripción, el pago
 * ni la carga de resultados. Devuelve { ok, via | error } por destinatario.
 */
const integrations = require('../integrations.service');
const waWindow     = require('../whatsappWindowService');
const baileys      = require('../baileysService');
const { frontendUrl } = require('../../config/urls');

const digitos = (t) => String(t || '').replace(/\D/g, '');

async function proveedor(clubId) {
  const integ = await integrations.getIntegration(clubId);
  return integ?.wa_provider || 'meta';
}

/**
 * Envía un texto a un teléfono por el canal del club.
 * @returns {Promise<{ok:boolean, via?:string, error?:string}>}
 */
async function enviar(clubId, telefono, texto, { imagen } = {}) {
  const tel = digitos(telefono);
  if (!tel) return { ok: false, error: 'sin teléfono' };
  try {
    if (await proveedor(clubId) === 'baileys') {
      if (imagen) await baileys.enviarImagen(clubId, tel, imagen, texto);
      else await baileys.enviarTexto(clubId, tel, texto);
      return { ok: true, via: 'baileys' };
    }
    const creds = await integrations.getMetaCredentials(clubId);
    // Los parámetros de plantilla de Meta no admiten saltos de línea
    const plano = texto.replace(/\*/g, '').replace(/\s*\n+\s*/g, ' · ').slice(0, 1000);
    const r = await waWindow.enviarConVentana(clubId, tel, {
      tipo: 'torneo',
      freeText: { type: 'text', text: { body: texto, preview_url: true } },
      templateParams: [plano],
      creds,
      etiqueta: 'torneo',
    });
    return { ok: true, via: `meta:${r.via}` };
  } catch (err) {
    console.error(`[torneos][wa] club ${clubId} → ****${tel.slice(-4)}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/** Envía el mismo texto a los dos jugadores de una pareja. */
async function aPareja(clubId, pareja, texto, opts) {
  const jugadores = pareja?.jugadores || [];
  return Promise.all(jugadores.map(j => enviar(clubId, j.whatsapp, texto, opts)));
}

// ── Formateo ──────────────────────────────────────────────────
const nombrePareja = (p) => [...(p?.jugadores || [])].sort((a, b) => a.id - b.id).map(j => j.nombre).join(' / ') || 'A definir';
function fechaLarga(fecha) {
  if (!fecha) return '';
  const d = new Date(`${fecha}T12:00:00Z`);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
const RONDA_LABEL = { zona: 'Fase de zonas', octavos: 'Octavos de final', cuartos: 'Cuartos de final', semifinal: 'Semifinal', final: 'FINAL' };
const setsTxt = (sets) => (sets || []).map(([a, b]) => `${a}-${b}`).join(' ');
const linkTorneo = (t) => frontendUrl(`/torneos/${t.id}`);

// ── Catálogo de mensajes ──────────────────────────────────────
const mensajes = {
  inscripcion(torneo, pareja) {
    const pago = pareja.estado_pago === 'pagado'
      ? '✅ Inscripción confirmada.'
      : `💳 Para confirmar tu lugar aboná la inscripción ($${Number(torneo.precio_inscripcion).toLocaleString('es-AR')}) desde:\n${linkTorneo(torneo)}?pareja=${pareja.id}`;
    return `🎾 *${torneo.nombre}*\n\n¡Hola! Recibimos la inscripción de la pareja *${nombrePareja(pareja)}* ` +
      `(${torneo.categoria}ª ${torneo.genero}).\n\n${pago}`;
  },
  pagoConfirmado(torneo, pareja, jugador, ticketUrl) {
    return `✅ *Pago confirmado — ${torneo.nombre}*\n\n${jugador.nombre}, tu inscripción con *${nombrePareja(pareja)}* está confirmada.\n\n` +
      `🎟️ Tu ticket QR: ${ticketUrl}\n\nTe avisamos por acá cuando esté el fixture.`;
  },
  proximoPartido(torneo, partido, cancha) {
    return `📅 *Próximo partido — ${torneo.nombre}*\n\n${RONDA_LABEL[partido.ronda]}${partido.zona ? ` · ${partido.zona.nombre}` : ''}\n` +
      `🆚 ${nombrePareja(partido.pareja1)} vs ${nombrePareja(partido.pareja2)}\n` +
      `🗓️ ${fechaLarga(partido.fecha)}\n⏰ ${partido.hora} hs\n🏟️ ${cancha || 'Cancha a confirmar'}\n\n` +
      `Fixture completo: ${linkTorneo(torneo)}`;
  },
  resultado(torneo, partido, resultado, ganador) {
    return `📊 *Resultado — ${torneo.nombre}*\n\n${RONDA_LABEL[partido.ronda]}\n` +
      `${nombrePareja(partido.pareja1)} vs ${nombrePareja(partido.pareja2)}\n` +
      `${partido.estado === 'walkover' ? 'W.O.' : setsTxt(resultado.sets)}\n🏆 Ganó: *${nombrePareja(ganador)}*\n\n` +
      `Posiciones: ${linkTorneo(torneo)}`;
  },
  finalistas(torneo, pareja) {
    return `🔥 *¡Felicitaciones, ${nombrePareja(pareja)}!*\n\nSon finalistas de *${torneo.nombre}*. ` +
      `¡Mucha suerte en la final! Te avisamos día, hora y cancha.`;
  },
  campeon(torneo, pareja) {
    return `🏆 *¡CAMPEONES!* 🏆\n\n${nombrePareja(pareja)}, ganaron *${torneo.nombre}* ` +
      `(${torneo.categoria}ª ${torneo.genero}). ¡Felicitaciones de todo el club!`;
  },
  subcampeon(torneo, pareja) {
    return `🥈 *¡Felicitaciones, ${nombrePareja(pareja)}!*\n\nSon subcampeones de *${torneo.nombre}*. ` +
      `¡Gran torneo! Gracias por participar.`;
  },
  eliminados(torneo, pareja) {
    return `🙌 *Gracias por participar, ${nombrePareja(pareja)}*\n\nTu recorrido en *${torneo.nombre}* terminó acá. ` +
      `¡Gracias por sumarte y te esperamos en el próximo torneo!\n\nSeguí el cuadro: ${linkTorneo(torneo)}`;
  },
};

module.exports = { enviar, aPareja, proveedor, mensajes, nombrePareja, RONDA_LABEL };
