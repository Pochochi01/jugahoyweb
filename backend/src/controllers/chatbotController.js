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

/** ID compacto para WhatsApp: "20260617_1_0800_60" (fecha_cancha_hora_duración) */
function buildSlotId(fecha, fieldId, hora, duracion = 60) {
  return `${fecha.replace(/-/g, '')}_${fieldId}_${hora.replace(':', '')}_${duracion}`;
}

/** Descompone el ID compacto → { fecha, fieldId, hora, duracion } */
function parseSlotId(raw) {
  const [fc, fid, hc, dur] = raw.split('_');
  return {
    fecha:    `${fc.slice(0,4)}-${fc.slice(4,6)}-${fc.slice(6,8)}`,
    fieldId:  parseInt(fid),
    hora:     `${hc.slice(0,2)}:${hc.slice(2)}`,
    duracion: dur ? parseInt(dur) : 60,
  };
}

// Duraciones ofrecidas y sus etiquetas
const DURACIONES = [
  { min: 60,  label: '1 hora' },
  { min: 90,  label: '1 h 30 min' },
  { min: 120, label: '2 horas' },
];
const duracionLabel = (min) => (DURACIONES.find(d => d.min === min)?.label || `${min} min`);

// Estado en memoria: número → { slotRaw, name } mientras se pide el nombre.
// (PM2 fork = 1 instancia; si se reinicia mid-flujo, el usuario reintenta.)
const pendingName = new Map();
function setPending(from, data) {
  pendingName.set(from, { ...data, ts: Date.now() });
  // limpieza simple de entradas viejas (> 15 min)
  for (const [k, v] of pendingName) if (Date.now() - v.ts > 15 * 60 * 1000) pendingName.delete(k);
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
//  Nuevo flujo: franja horaria → horas (con canchas) → cancha
// ─────────────────────────────────────────────────────────────

const FRANJAS = {
  manana: { label: '🌅 Mañana (09–13 hs)', test: h => h >= 9  && h <= 13 },
  tarde:  { label: '☀️ Tarde (14–18 hs)',  test: h => h >= 14 && h <= 18 },
  noche:  { label: '🌙 Noche (19–02 hs)',  test: h => h >= 19 || h <= 2  },
};

const fechaCompact     = (fecha) => fecha.replace(/-/g, '');
const fechaFromCompact = (fc)    => `${fc.slice(0, 4)}-${fc.slice(4, 6)}-${fc.slice(6, 8)}`;
// Ordena horas con la madrugada (00–02) después de las 23
const horaSortKey      = (hora)  => { const h = parseInt(hora); return h <= 3 ? h + 24 : h; };

/** "Cancha 1, Cancha 2 y Cancha 3" (o "N canchas" si excede el límite) */
function formatCanchas(names) {
  if (!names.length) return '';
  const joined = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return joined.length <= 72 ? joined : `${names.length} canchas`;
}

/**
 * Horarios en punto con al menos una cancha libre para reservar `duracion` minutos.
 * Solo incluye la hora si TODOS los slots del turno están libres, dentro del
 * horario de la cancha, no pasados, y la cancha permite esa duración.
 * @returns {Object} { '09:00': [{ fieldId, nombre, deporte, precio }], ... }
 */
async function getAvailableByHour(fecha, complexId, duracion = 60) {
  const fields = await Field.findAll({
    where: { complex_id: complexId, activa: true },
    order: [['nombre', 'ASC']],
  });

  const slotsNecesarios = Math.max(1, Math.ceil(duracion / 30));
  const byHour = {};

  for (const field of fields) {
    // La cancha debe permitir esta duración
    const permitidas = field.duraciones_permitidas?.length ? field.duraciones_permitidas : [60];
    if (!permitidas.includes(duracion)) continue;

    const apertura = field.hora_apertura || '08:00';
    const cierre   = field.hora_cierre   || '22:00';
    const allHoras = generateSlots(apertura, cierre);
    const horasSet = new Set(allHoras);

    const ocupados = await TimeSlot.findAll({
      where: { field_id: field.id, fecha, estado: 'ocupado' },
      attributes: ['hora'],
    });
    const ocupadosSet = new Set(ocupados.map(s => s.hora));

    for (const hora of allHoras) {
      if (!hora.endsWith(':00')) continue;
      // Todos los slots de 30' que ocupa el turno
      const chunk = Array.from({ length: slotsNecesarios }, (_, i) => addMinutes(hora, i * 30));
      const cabe   = chunk.every(h => horasSet.has(h));       // dentro del horario
      const libre  = chunk.every(h => !ocupadosSet.has(h));   // sin ocupar
      if (!cabe || !libre || isPast(fecha, hora, apertura)) continue;
      (byHour[hora] ??= []).push({
        fieldId: field.id, nombre: field.nombre, deporte: field.deporte, precio: field.precio_base,
      });
    }
  }
  return byHour;
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
    // Meta también envía webhooks de "statuses" (entregado/leído) sin `messages`.
    if (!msg) {
      if (entry?.statuses) console.log('[WhatsApp] ← status:', entry.statuses[0]?.status);
      return;
    }

    const from    = msg.from;   // número WhatsApp del remitente
    const msgType = msg.type;
    const complexId = getChatbotComplexId();

    console.log(`[WhatsApp] ← mensaje de ${from} · tipo=${msgType}` +
      (msgType === 'text' ? ` · texto="${msg.text?.body}"` : ''));

    // ── Mensaje de texto ───────────────────────────────────────
    if (msgType === 'text') {
      const raw  = msg.text?.body || '';
      const text = raw.toLowerCase().trim();

      // Cancelar reserva por texto: "cancelar #123"
      const cancelMatch = text.match(/^cancelar\s+#(\d+)$/i);
      if (cancelMatch) {
        pendingName.delete(from);
        await _handleTextCancel(from, parseInt(cancelMatch[1]));
        return;
      }

      // Palabras que reinician el flujo
      const resetWords = ['hola', 'hi', 'buenas', 'reservar', 'turno', '1', 'inicio', 'menu', 'menú'];
      if (resetWords.includes(text)) {
        pendingName.delete(from);
        await _sendDaysMenu(from);
        return;
      }

      // ¿Estábamos esperando el nombre del titular? → armar la confirmación
      if (pendingName.has(from)) {
        const nombre = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
        if (nombre.length < 2) {
          await wa.sendMessage({ to: from, type: 'text', text: { body: '⚠️ Escribí un nombre válido (nombre y apellido).' } });
          return;
        }
        const pend = pendingName.get(from);
        pend.name = nombre;
        pendingName.set(from, pend);

        const { fecha, fieldId, hora, duracion } = parseSlotId(pend.slotRaw);
        const field = await Field.findByPk(fieldId);
        await wa.sendMessage(wa.buildConfirmMessage(from, {
          slotId:        pend.slotRaw,
          fechaLabel:    formatFechaLabel(fecha),
          hora,
          cancha:        field?.nombre || `Cancha ${fieldId}`,
          nombre,
          duracionLabel: duracionLabel(duracion),
        }));
        return;
      }

      // Fallback
      await wa.sendMessage({
        to:   from,
        type: 'text',
        text: { body: '👋 ¡Hola! Escribí *hola* o *reservar* para elegir tu turno.' },
      });
      return;
    }

    // ── Respuesta de lista (eligió día o slot) ─────────────────
    if (msgType === 'interactive' && msg.interactive?.type === 'list_reply') {
      const replyId = msg.interactive.list_reply.id;

      if (replyId.startsWith('day_')) {
        // Eligió un día → mostrar las franjas horarias (mañana/tarde/noche)
        const fecha = replyId.replace('day_', '');
        await _sendGroupsMenu(from, fecha);
        return;
      }

      if (replyId.startsWith('grp_')) {
        // Eligió una franja → mostrar el menú de duración
        const [fc, group] = replyId.replace('grp_', '').split('_');
        await _sendDurationMenu(from, fechaFromCompact(fc), group);
        return;
      }

      if (replyId.startsWith('dur_')) {
        // Eligió la duración → mostrar horas libres (franja + duración) con sus canchas
        const [fc, group, dur] = replyId.replace('dur_', '').split('_');
        await _sendHoursMenu(from, fechaFromCompact(fc), group, parseInt(dur), complexId);
        return;
      }

      if (replyId.startsWith('hr_')) {
        // Eligió una hora → mostrar las canchas disponibles para esa hora + duración
        const [fc, dur, hc] = replyId.replace('hr_', '').split('_');
        const hora = `${hc.slice(0, 2)}:${hc.slice(2)}`;
        await _sendCourtsMenu(from, fechaFromCompact(fc), hora, parseInt(dur), complexId);
        return;
      }

      if (replyId.startsWith('slot_')) {
        // Eligió la cancha → pedir el nombre del titular antes de confirmar
        const slotRaw = replyId.replace('slot_', '');
        setPending(from, { slotRaw });
        await wa.sendMessage({
          to: from, type: 'text',
          text: { body: '✍️ ¿A nombre de quién ponemos el turno?\nEscribí el *nombre y apellido* del titular.' },
        });
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
        pendingName.delete(from);
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

/** Menú de franjas horarias (mañana / tarde / noche) para una fecha */
async function _sendGroupsMenu(to, fecha) {
  await wa.sendMessage(wa.buildGroupsListMessage(to, formatFechaLabel(fecha), fechaCompact(fecha)));
}

/** Menú de duración del turno (1 h / 1½ h / 2 h) para una franja */
async function _sendDurationMenu(to, fecha, group) {
  const franja = FRANJAS[group];
  const fc = fechaCompact(fecha);
  const rows = DURACIONES.map(d => ({
    id:          `dur_${fc}_${group}_${d.min}`,
    title:       d.label,
    description: `${d.min} minutos`,
  }));
  await wa.sendMessage(wa.buildRowsListMessage(to, {
    headerText:   `⏱️ ${formatFechaLabel(fecha)} · ${franja?.label || ''}`,
    bodyText:     '¿Cuánto tiempo querés jugar?',
    footerText:   'Elegí la duración del turno',
    button:       'Ver duraciones',
    sectionTitle: 'Duración del turno',
    rows,
  }));
}

/** Menú de horas libres dentro de una franja+duración, indicando las canchas de cada hora */
async function _sendHoursMenu(to, fecha, group, duracion, complexId) {
  const franja = FRANJAS[group];
  if (!franja) return _sendGroupsMenu(to, fecha);

  const byHour = await getAvailableByHour(fecha, complexId, duracion);
  const horas  = Object.keys(byHour)
    .filter(h => franja.test(parseInt(h)))
    .sort((a, b) => horaSortKey(a) - horaSortKey(b));

  if (!horas.length) {
    await wa.sendMessage({
      to, type: 'text',
      text: { body: `😔 No hay horarios de ${duracionLabel(duracion)} libres en la franja ${franja.label} para el ${formatFechaLabel(fecha)}.\nProbá con otra duración:` },
    });
    await _sendDurationMenu(to, fecha, group);
    return;
  }

  const fc = fechaCompact(fecha);
  const rows = horas.map(hora => ({
    id:          `hr_${fc}_${duracion}_${hora.replace(':', '')}`,
    title:       `${hora} hs`,
    description: formatCanchas(byHour[hora].map(f => f.nombre)),
  }));

  await wa.sendMessage(wa.buildRowsListMessage(to, {
    headerText:   `⏰ ${formatFechaLabel(fecha)} · ${franja.label}`,
    bodyText:     `Turnos de ${duracionLabel(duracion)}. Elegí un horario (se indican las canchas libres):`,
    footerText:   `Duración: ${duracionLabel(duracion)}`,
    button:       'Ver horarios',
    sectionTitle: 'Horarios disponibles',
    rows,
  }));
}

/** Menú de canchas disponibles para una hora + duración concretas */
async function _sendCourtsMenu(to, fecha, hora, duracion, complexId) {
  const byHour = await getAvailableByHour(fecha, complexId, duracion);
  const courts = byHour[hora] || [];

  if (!courts.length) {
    await wa.sendMessage({
      to, type: 'text',
      text: { body: `⚠️ El horario ${hora} hs ya no tiene canchas libres para ${duracionLabel(duracion)}. Elegí otro:` },
    });
    await _sendGroupsMenu(to, fecha);
    return;
  }

  const rows = courts.map(c => ({
    id:          `slot_${buildSlotId(fecha, c.fieldId, hora, duracion)}`,
    title:       c.nombre,
    description: `$${Number(c.precio || 0).toLocaleString('es-AR')}/hr · ${c.deporte || ''}`,
  }));

  await wa.sendMessage(wa.buildRowsListMessage(to, {
    headerText:   `🏟️ ${formatFechaLabel(fecha)} · ${hora} hs (${duracionLabel(duracion)})`,
    bodyText:     'Elegí la cancha para tu turno:',
    footerText:   'Después te pido el nombre',
    button:       'Ver canchas',
    sectionTitle: 'Canchas disponibles',
    rows,
  }));
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
  const { fecha, fieldId, hora, duracion } = parseSlotId(slotRaw);
  // Nombre del titular ingresado por el usuario (fallback si se perdió el estado)
  const pend = pendingName.get(from);
  const nombreTitular = pend?.name || `WhatsApp ${from.slice(-4)}`;

  const t = await sequelize.transaction();
  try {
    const field = await Field.findByPk(fieldId, { transaction: t });
    if (!field) {
      await t.rollback();
      await wa.sendMessage({ to: from, type: 'text', text: { body: '⚠️ Cancha no encontrada.' } });
      return;
    }

    // Slots que ocupa la reserva (duracion / 30 min)
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
      await _sendGroupsMenu(from, fecha);
      return;
    }

    // Monto según duración: precios_por_duracion o precio_base proporcional
    const precios = field.precios_por_duracion || {};
    const monto = precios[String(duracion)] != null
      ? parseFloat(precios[String(duracion)])
      : parseFloat(field.precio_base || 0) * (duracion / 60);

    const booking = await Booking.create({
      field_id:         fieldId,
      fecha,
      hora_inicio:      hora,
      hora_fin,
      duracion,
      nombre_cliente:   nombreTitular,
      telefono_cliente: from,
      metodo_pago:      'efectivo',
      monto,
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
    pendingName.delete(from);   // limpiar el estado de "esperando nombre"

    await wa.sendMessage({
      to: from, type: 'text',
      text: {
        body: `✅ ¡Turno confirmado!\n\n` +
              `📅 ${formatFechaLabel(fecha)}\n` +
              `⏰ ${hora} hs (${duracionLabel(duracion)})\n` +
              `🏟️ ${field.nombre}\n` +
              `👤 ${nombreTitular}\n\n` +
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
