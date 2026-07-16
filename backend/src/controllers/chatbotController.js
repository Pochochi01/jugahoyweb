/**
 * src/controllers/chatbotController.js
 *
 * chatbotSkill: lógica del chatbot de reservas para JugaHoyWeb.
 *
 * Usa los modelos Sequelize existentes del proyecto:
 *   - Field    → canchas del complejo (tabla `fields`)
 *   - TimeSlot → slots libre/ocupado  (tabla `time_slots`)
 *   - Booking  → reservas confirmadas (tabla `bookings`)
 *
 * No crea ni modifica ninguna tabla existente.
 *
 * Flujo de conversación WhatsApp:
 *   1. Texto libre ("hola", "reservar") → menú de días (list message)
 *   2. Elige día        → horarios disponibles por cancha (list message, 1 sección por cancha)
 *   3. Elige slot       → confirmación (reply buttons)
 *   4. Confirma         → booking creado + extras CTA
 *   5. "cancelar #ID"   → cancela la reserva
 *
 * Variable de entorno extra requerida:
 *   CHATBOT_COMPLEX_ID  → ID del complejo que atiende este chatbot
 *
 * Endpoints REST (para cualquier frontend):
 *   GET  /api/chatbot/days
 *   GET  /api/chatbot/schedules/:day
 *   POST /api/chatbot/confirm
 *   POST /api/chatbot/cancel
 *   GET  /api/chatbot/extras
 *   GET  /api/chatbot/webhook   ← verificación Meta
 *   POST /api/chatbot/webhook   ← mensajes entrantes WhatsApp
 */
const crypto       = require('crypto');
const { Op }       = require('sequelize');
const { Field, TimeSlot, Booking, sequelize } = require('../models');
const wa           = require('../services/whatsappService');
const { todayAR }  = require('../utils/time');

// ─────────────────────────────────────────────────────────────
//  Helpers de fecha/hora
//  (misma lógica que agendaController — duplicada intencionalmente
//   para no crear dependencia circular entre controladores)
// ─────────────────────────────────────────────────────────────

const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

/** 'YYYY-MM-DD' → Date local (sin desfase de zona horaria) */
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' desde las partes locales (ART con TZ forzado), sin desfase UTC */
function ymd(date) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Devuelve "Hoy 17 jun" / "Mañana 18 jun" / "Sábado 20 jun" */
function formatFechaLabel(dateOrStr) {
  const d = typeof dateOrStr === 'string' ? parseLocalDate(dateOrStr) : dateOrStr;
  // "Hoy" anclado a la fecha de Argentina (no a la UTC del proceso)
  const [ty, tm, td] = todayAR().split('-').map(Number);
  const hoy = new Date(ty, tm - 1, td);
  const tgt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((tgt - hoy) / 86_400_000);
  const prefix = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : DIAS[d.getDay()];
  return `${prefix} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** Genera los próximos 8 días { value: 'YYYY-MM-DD', label } — en hora Argentina */
function getNext8Days() {
  const [y, m, d] = todayAR().split('-').map(Number);
  return Array.from({ length: 8 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);   // fecha local (Argentina)
    return { value: ymd(dt), label: formatFechaLabel(dt) };
  });
}

/**
 * Genera slots de 30 min entre apertura y cierre.
 * Soporta cierre después de medianoche (ej. cierre '02:00').
 */
function generateSlots(apertura = '08:00', cierre = '22:00') {
  const startH = parseInt(apertura.split(':')[0]);
  const closeH = parseInt(cierre.split(':')[0]);
  const endH   = closeH <= startH ? closeH + 24 : closeH;
  const slots  = [];
  for (let h = startH; h < endH; h++) {
    const d = h % 24;
    slots.push(`${String(d).padStart(2, '0')}:00`);
    slots.push(`${String(d).padStart(2, '0')}:30`);
  }
  return slots;
}

/** Suma `min` minutos a 'HH:MM', wrap a medianoche */
function addMinutes(hora, min) {
  const [h, m] = hora.split(':').map(Number);
  const total  = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Devuelve true si el slot ya pasó (slots de madrugada se tratan como día siguiente) */
function isPast(fecha, hora, apertura = '08:00') {
  const startH = parseInt(apertura.split(':')[0]);
  const [h]    = hora.split(':').map(Number);
  const dt     = new Date(`${fecha}T${hora}:00`);
  if (h < startH) dt.setDate(dt.getDate() + 1);
  return dt < new Date();
}

/** ID compacto para WhatsApp (sin guiones): "20260617_1_0800" */
function buildSlotId(fecha, fieldId, hora) {
  return `${fecha.replace(/-/g, '')}_${fieldId}_${hora.replace(':', '')}`;
}

/** Descompone el ID compacto → { fecha, fieldId, hora } */
function parseSlotId(raw) {
  const [fc, fid, hc] = raw.split('_');
  return {
    fecha:   `${fc.slice(0,4)}-${fc.slice(4,6)}-${fc.slice(6,8)}`,
    fieldId: parseInt(fid),
    hora:    `${hc.slice(0,2)}:${hc.slice(2)}`,
  };
}

/** Obtiene el complex_id configurado para este chatbot */
function getChatbotComplexId() {
  return parseInt(process.env.CHATBOT_COMPLEX_ID || '1');
}

// ─────────────────────────────────────────────────────────────
//  Lógica compartida: slots disponibles para una fecha
// ─────────────────────────────────────────────────────────────

/**
 * Devuelve slots disponibles agrupados por cancha.
 * @returns {Array<{ field, slots: Array }>}
 */
async function getAvailableSlotsGrouped(fecha, complexId) {
  const fields = await Field.findAll({
    where: { complex_id: complexId, activa: true },
    order: [['nombre', 'ASC']],
  });

  const result = [];

  for (const field of fields) {
    const apertura = field.hora_apertura || '08:00';
    const cierre   = field.hora_cierre   || '22:00';
    const allHoras = generateSlots(apertura, cierre);

    // Slots ya ocupados en esta cancha para la fecha
    const ocupados = await TimeSlot.findAll({
      where: { field_id: field.id, fecha, estado: 'ocupado' },
      attributes: ['hora'],
    });
    const ocupadosSet = new Set(ocupados.map(s => s.hora));

    // Solo mostrar slots en punto (HH:00) para no saturar la lista
    const libres = allHoras
      .filter(h => h.endsWith(':00') && !ocupadosSet.has(h) && !isPast(fecha, h, apertura))
      .map(hora => ({
        id:      buildSlotId(fecha, field.id, hora),
        hora,
        tipo:    field.deporte,
        precio:  field.precio_base,
        fieldId: field.id,
      }));

    if (libres.length) {
      result.push({ field, slots: libres });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
//  REST API handlers
// ─────────────────────────────────────────────────────────────

/** GET /api/chatbot/days */
async function getDays(_req, res) {
  return res.json({ ok: true, days: getNext8Days() });
}

/**
 * GET /api/chatbot/schedules/:day
 * :day = YYYY-MM-DD
 */
async function getSchedules(req, res) {
  try {
    const { day } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ message: 'Formato de fecha inválido (usar YYYY-MM-DD).' });
    }

    const complexId = req.query.complex_id
      ? parseInt(req.query.complex_id)
      : getChatbotComplexId();

    const groups = await getAvailableSlotsGrouped(day, complexId);

    return res.json({
      ok:     true,
      fecha:  day,
      label:  formatFechaLabel(day),
      canchas: groups.map(g => ({
        field_id: g.field.id,
        nombre:   g.field.nombre,
        deporte:  g.field.deporte,
        slots:    g.slots,
      })),
    });
  } catch (err) {
    console.error('[chatbot.getSchedules]', err);
    return res.status(500).json({ message: 'Error al consultar horarios.' });
  }
}

/**
 * POST /api/chatbot/confirm
 * Body: { field_id, fecha, hora_inicio, nombre_cliente?, telefono_whatsapp? }
 * Crea Booking + actualiza TimeSlots en una transacción.
 */
async function confirmBooking(req, res) {
  const t = await sequelize.transaction();
  try {
    const {
      field_id,
      fecha,
      hora_inicio,
      duracion         = 60,
      nombre_cliente,
      telefono_whatsapp,
      metodo_pago      = 'efectivo',
      monto,
    } = req.body;

    if (!field_id || !fecha || !hora_inicio) {
      await t.rollback();
      return res.status(400).json({ message: 'field_id, fecha y hora_inicio son requeridos.' });
    }

    const field = await Field.findByPk(field_id, { transaction: t });
    if (!field) {
      await t.rollback();
      return res.status(404).json({ message: 'Cancha no encontrada.' });
    }

    // Calcular todos los slots que ocupa la reserva (duracion / 30 min)
    const slotsNecesarios = Math.ceil(duracion / 30);
    const horasAReservar  = Array.from({ length: slotsNecesarios }, (_, i) =>
      addMinutes(hora_inicio, i * 30)
    );
    const hora_fin = addMinutes(hora_inicio, duracion);

    // Verificar disponibilidad (con lock para evitar race conditions)
    const ocupados = await TimeSlot.findAll({
      where: {
        field_id,
        fecha,
        hora:   { [Op.in]: horasAReservar },
        estado: 'ocupado',
      },
      transaction: t,
      lock: true,
    });

    if (ocupados.length > 0) {
      await t.rollback();
      const horas = ocupados.map(s => s.hora).join(', ');
      return res.status(409).json({
        message: `El horario ${horas} ya está ocupado. Elegí otro.`,
      });
    }

    // Crear booking
    const booking = await Booking.create({
      field_id,
      fecha,
      hora_inicio,
      hora_fin,
      duracion,
      nombre_cliente:   nombre_cliente || `WhatsApp ${(telefono_whatsapp || '').slice(-4)}`,
      telefono_cliente: telefono_whatsapp || null,
      metodo_pago,
      monto:            monto ?? field.precio_base,
      estado:           'confirmado',
      notas:            'Reserva realizada por WhatsApp',
      created_by:       null,
    }, { transaction: t });

    // Marcar slots como ocupados
    for (const hora of horasAReservar) {
      await TimeSlot.upsert(
        { field_id, fecha, hora, estado: 'ocupado', booking_id: booking.id },
        { transaction: t }
      );
    }

    await t.commit();
    return res.status(201).json({ ok: true, message: 'Turno confirmado.', booking_id: booking.id });

  } catch (err) {
    await t.rollback();
    console.error('[chatbot.confirmBooking]', err);
    return res.status(500).json({ message: 'Error al confirmar el turno.' });
  }
}

/**
 * POST /api/chatbot/cancel
 * Body: { booking_id, telefono_whatsapp? }
 * Libera los TimeSlots y marca el Booking como cancelado.
 */
async function cancelBooking(req, res) {
  const t = await sequelize.transaction();
  try {
    const { booking_id, telefono_whatsapp } = req.body;

    if (!booking_id) {
      await t.rollback();
      return res.status(400).json({ message: 'booking_id es requerido.' });
    }

    const booking = await Booking.findByPk(booking_id, {
      include: [{ model: TimeSlot, as: 'timeSlots' }],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }
    if (booking.estado === 'cancelado') {
      await t.rollback();
      return res.status(409).json({ message: 'La reserva ya estaba cancelada.' });
    }

    // Verificar que el número de WhatsApp coincida (solo si se proporciona)
    if (telefono_whatsapp && booking.telefono_cliente !== telefono_whatsapp) {
      await t.rollback();
      return res.status(403).json({ message: 'No podés cancelar una reserva de otro número.' });
    }

    // Liberar slots
    await Promise.all(
      booking.timeSlots.map(s =>
        s.update({ estado: 'libre', booking_id: null }, { transaction: t })
      )
    );

    await booking.update({ estado: 'cancelado' }, { transaction: t });
    await t.commit();

    return res.json({ ok: true, message: 'Reserva cancelada correctamente.' });

  } catch (err) {
    await t.rollback();
    console.error('[chatbot.cancelBooking]', err);
    return res.status(500).json({ message: 'Error al cancelar la reserva.' });
  }
}

/** GET /api/chatbot/extras — botones CTA para mostrar tras confirmar */
async function getExtras(_req, res) {
  return res.json({
    ok: true,
    extras: [
      { id: 'web',        label: 'Visitar la web del club',  url: process.env.CLUB_WEB_URL        || 'https://jugahoy.com.ar' },
      { id: 'reglamento', label: 'Ver reglamento de uso',    url: process.env.CLUB_REGLAMENTO_URL || 'https://jugahoy.com.ar/reglamento' },
      { id: 'pago',       label: 'Pagar online',              url: process.env.CLUB_PAGO_URL       || 'https://jugahoy.com.ar/pagar' },
    ],
  });
}

// ─────────────────────────────────────────────────────────────
//  WhatsApp Webhook
// ─────────────────────────────────────────────────────────────

/**
 * Valida la firma X-Hub-Signature-256 que Meta envía en cada POST.
 * Es un HMAC-SHA256 del cuerpo CRUDO usando el App Secret (META_APP_SECRET).
 * Requiere que express.json haya guardado el buffer en req.rawBody (ver app.js).
 *
 * Si META_APP_SECRET no está configurado (ej. desarrollo), no se valida.
 */
function isValidSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return true;                     // sin secret → no validar (dev)

  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody)
    .digest('hex');

  // Comparación en tiempo constante (evita timing attacks)
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * GET /api/chatbot/webhook
 * Meta envía una petición GET para verificar el endpoint antes de activarlo.
 */
function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado por Meta ✓');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

/**
 * POST /api/chatbot/webhook
 * Recibe mensajes entrantes de WhatsApp y responde con mensajes interactivos.
 * Responde 200 inmediatamente (Meta requiere respuesta en < 5 s).
 */
async function handleWebhook(req, res) {
  // Rechazar requests que no vengan realmente de Meta (firma inválida)
  if (!isValidSignature(req)) {
    console.warn('[WhatsApp] Webhook con firma inválida — rechazado.');
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0]?.changes?.[0]?.value;
    const msg   = entry?.messages?.[0];
    if (!msg) return;

    const from    = msg.from;   // número WhatsApp del remitente
    const msgType = msg.type;
    const complexId = getChatbotComplexId();

    // ── Mensaje de texto ───────────────────────────────────────
    if (msgType === 'text') {
      const text = (msg.text?.body || '').toLowerCase().trim();

      // Cancelar reserva por texto: "cancelar #123"
      const cancelMatch = text.match(/^cancelar\s+#(\d+)$/i);
      if (cancelMatch) {
        await _handleTextCancel(from, parseInt(cancelMatch[1]));
        return;
      }

      // Cualquier saludo o "reservar" → menú de días
      if (['hola', 'hi', 'buenas', 'reservar', 'turno', '1', 'inicio', 'menu', 'menú'].includes(text)) {
        await _sendDaysMenu(from);
      } else {
        await wa.sendMessage({
          to:   from,
          type: 'text',
          text: { body: '👋 ¡Hola! Escribí *hola* o *reservar* para elegir tu turno.' },
        });
      }
      return;
    }

    // ── Respuesta de lista (eligió día o slot) ─────────────────
    if (msgType === 'interactive' && msg.interactive?.type === 'list_reply') {
      const replyId = msg.interactive.list_reply.id;

      if (replyId.startsWith('day_')) {
        // Eligió un día → mostrar horarios agrupados por cancha
        const fecha = replyId.replace('day_', '');
        await _sendSchedulesMenu(from, fecha, complexId);
        return;
      }

      if (replyId.startsWith('slot_')) {
        // Eligió un slot → pedir confirmación
        const { fecha, fieldId, hora } = parseSlotId(replyId.replace('slot_', ''));
        const field = await Field.findByPk(fieldId);
        await wa.sendMessage(wa.buildConfirmMessage(from, {
          slotId:     replyId.replace('slot_', ''),
          fechaLabel: formatFechaLabel(fecha),
          hora,
          cancha:     field?.nombre || `Cancha ${fieldId}`,
        }));
        return;
      }
    }

    // ── Reply button (confirmar o descartar) ───────────────────
    if (msgType === 'interactive' && msg.interactive?.type === 'button_reply') {
      const btnId = msg.interactive.button_reply.id;

      if (btnId.startsWith('confirm_')) {
        await _handleConfirm(from, btnId.replace('confirm_', ''));
        return;
      }

      if (btnId.startsWith('discard_')) {
        await wa.sendMessage({
          to: from, type: 'text',
          text: { body: '❌ Reserva no realizada.\nEscribí *reservar* cuando quieras intentarlo de nuevo.' },
        });
        return;
      }
    }

  } catch (err) {
    console.error('[chatbot.webhook]', err);
  }
}

// ─────────────────────────────────────────────────────────────
//  Helpers internos del webhook
// ─────────────────────────────────────────────────────────────

async function _sendDaysMenu(to) {
  await wa.sendMessage(wa.buildDaysListMessage(to, getNext8Days()));
}

async function _sendSchedulesMenu(to, fecha, complexId) {
  const groups = await getAvailableSlotsGrouped(fecha, complexId);

  if (!groups.length) {
    await wa.sendMessage({
      to, type: 'text',
      text: { body: `😔 No hay horarios disponibles para el ${formatFechaLabel(fecha)}.\nElegí otro día:` },
    });
    await _sendDaysMenu(to);
    return;
  }

  const sections = groups.map(g => ({
    title: g.field.nombre,
    rows:  g.slots,
  }));

  await wa.sendMessage(wa.buildSchedulesListMessage(to, formatFechaLabel(fecha), sections));
}

async function _handleConfirm(from, slotRaw) {
  const { fecha, fieldId, hora } = parseSlotId(slotRaw);
  const duracion  = 60;

  const t = await sequelize.transaction();
  try {
    const field = await Field.findByPk(fieldId, { transaction: t });
    if (!field) {
      await t.rollback();
      await wa.sendMessage({ to: from, type: 'text', text: { body: '⚠️ Cancha no encontrada.' } });
      return;
    }

    // Slots que ocupa la reserva (duracion / 30 min = 2 slots)
    const slotsNecesarios = Math.ceil(duracion / 30);
    const horasAReservar  = Array.from({ length: slotsNecesarios }, (_, i) =>
      addMinutes(hora, i * 30)
    );
    const hora_fin = addMinutes(hora, duracion);

    // Verificar disponibilidad en tiempo real (con lock anti-race)
    const ocupados = await TimeSlot.findAll({
      where: {
        field_id: fieldId,
        fecha,
        hora:   { [Op.in]: horasAReservar },
        estado: 'ocupado',
      },
      transaction: t,
      lock: true,
    });

    if (ocupados.length > 0) {
      await t.rollback();
      await wa.sendMessage({
        to: from, type: 'text',
        text: { body: '⚠️ Ese horario acaba de ser reservado. Elegí otro:' },
      });
      await _sendSchedulesMenu(from, fecha, getChatbotComplexId());
      return;
    }

    const booking = await Booking.create({
      field_id:         fieldId,
      fecha,
      hora_inicio:      hora,
      hora_fin,
      duracion,
      nombre_cliente:   `WhatsApp ${from.slice(-4)}`,
      telefono_cliente: from,
      metodo_pago:      'efectivo',
      monto:            field.precio_base,
      estado:           'confirmado',
      notas:            'Reserva por WhatsApp',
      created_by:       null,
    }, { transaction: t });

    for (const h of horasAReservar) {
      await TimeSlot.upsert(
        { field_id: fieldId, fecha, hora: h, estado: 'ocupado', booking_id: booking.id },
        { transaction: t }
      );
    }

    await t.commit();

    await wa.sendMessage({
      to: from, type: 'text',
      text: {
        body: `✅ ¡Turno confirmado!\n\n` +
              `📅 ${formatFechaLabel(fecha)}\n` +
              `⏰ ${hora} hs\n` +
              `🏟️ ${field.nombre}\n\n` +
              `ID de reserva: *#${booking.id}*\n` +
              `Para cancelar escribí: *cancelar #${booking.id}*`,
      },
    });

    const extras = wa.buildExtrasMessages(from);
    for (const extra of extras) {
      await wa.sendMessage(extra);
    }

  } catch (err) {
    await t.rollback();
    console.error('[chatbot._handleConfirm]', err);
    await wa.sendMessage({
      to: from, type: 'text',
      text: { body: '⚠️ Hubo un error al confirmar. Intentalo de nuevo.' },
    });
  }
}

async function _handleTextCancel(from, bookingId) {
  const t = await sequelize.transaction();
  try {
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: TimeSlot, as: 'timeSlots' }],
      transaction: t,
    });

    if (!booking || booking.telefono_cliente !== from) {
      await t.rollback();
      await wa.sendMessage({
        to: from, type: 'text',
        text: { body: `⚠️ No encontramos la reserva *#${bookingId}* asociada a tu número.` },
      });
      return;
    }

    if (booking.estado === 'cancelado') {
      await t.rollback();
      await wa.sendMessage({
        to: from, type: 'text',
        text: { body: `ℹ️ La reserva *#${bookingId}* ya estaba cancelada.` },
      });
      return;
    }

    await Promise.all(
      booking.timeSlots.map(s =>
        s.update({ estado: 'libre', booking_id: null }, { transaction: t })
      )
    );
    await booking.update({ estado: 'cancelado' }, { transaction: t });
    await t.commit();

    await wa.sendMessage({
      to: from, type: 'text',
      text: { body: `✅ Reserva *#${bookingId}* cancelada.\n\nEscribí *reservar* para hacer un nuevo turno.` },
    });

  } catch (err) {
    await t.rollback();
    console.error('[chatbot._handleTextCancel]', err);
  }
}

module.exports = {
  getDays,
  getSchedules,
  confirmBooking,
  cancelBooking,
  getExtras,
  verifyWebhook,
  handleWebhook,
};
