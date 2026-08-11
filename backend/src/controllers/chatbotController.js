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
 * MULTI-TENANT:
 *   El webhook entrante se enruta al club por `metadata.phone_number_id` (el número
 *   de WhatsApp que recibió el mensaje) usando la tabla `club_integrations`.
 *   Todas las respuestas se envían con las credenciales de ESE club.
 *   `CHATBOT_COMPLEX_ID` queda solo como fallback legacy de los endpoints REST.
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
const { Field, TimeSlot, Booking, Complex, Operation, Notification, User, ClubIntegration, sequelize } = require('../models');
const wa           = require('../services/whatsappService');
const integrations = require('../services/integrations.service');
const notifService = require('../services/notification.service');
const { todayAR }  = require('../utils/time');
const { frontendUrl } = require('../config/urls');
const { abbrDeporte, abbrSuperficie, nombreCancha, tipoCanchaCompleto } = require('../utils/canchas');
const { evaluarCancelacion, avisoAlReservar } = require('../utils/cancelPolicy');

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
 * Genera slots de 60 min (hora en punto) entre apertura y cierre.
 * Turnos de hora completa: 08:00, 09:00, 10:00... Soporta cierre después de
 * medianoche (ej. cierre '02:00').
 */
function generateSlots(apertura = '08:00', cierre = '22:00') {
  const startH = parseInt(apertura.split(':')[0]);
  const closeH = parseInt(cierre.split(':')[0]);
  const endH   = closeH <= startH ? closeH + 24 : closeH;
  const slots  = [];
  for (let h = startH; h < endH; h++) {
    const d = h % 24;
    slots.push(`${String(d).padStart(2, '0')}:00`);
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

// Duraciones ofrecidas y sus etiquetas.
// Solo turnos de hora completa: 1 h y 2 h (sin 30 min, sin 1½ h).
const DURACIONES = [
  { min: 60,  label: '1 hora' },
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

/** Solo dígitos de un teléfono (para comparar el WhatsApp con user.telefono) */
function soloDigitos(tel) {
  return String(tel || '').replace(/\D/g, '');
}

/** Busca la cuenta (User) cuyo teléfono coincide con el número de WhatsApp. */
async function cuentaPorTelefono(from, transaction) {
  const d = soloDigitos(from);
  if (!d) return null;
  return User.findOne({
    where: { telefono: { [Op.in]: [d, `+${d}`, from] } },
    attributes: ['id'],
    transaction,
  });
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
  manana: {
    title: '🌅 Mañana', rango: '09 a 13 hs', label: '🌅 Mañana (09–13 hs)',
    test: h => h >= 9 && h <= 13,
    horas: ['09:00', '10:00', '11:00', '12:00', '13:00'],
  },
  tarde: {
    title: '☀️ Tarde', rango: '14 a 18 hs', label: '☀️ Tarde (14–18 hs)',
    test: h => h >= 14 && h <= 18,
    horas: ['14:00', '15:00', '16:00', '17:00', '18:00'],
  },
  noche: {
    title: '🌙 Noche', rango: '19 a 02 hs', label: '🌙 Noche (19–02 hs)',
    test: h => h >= 19 || h <= 2,
    horas: ['19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00'],
  },
};

/**
 * Una franja sigue disponible si tiene al menos una hora de inicio que NO pasó.
 * Para un día futuro siempre da true; para HOY descarta las franjas ya vencidas
 * según la hora del sistema (isPast trata la madrugada 00–02 como día siguiente).
 */
function franjaTieneFuturo(fecha, franja) {
  return franja.horas.some(h => !isPast(fecha, h));
}

const fechaCompact     = (fecha) => fecha.replace(/-/g, '');
const fechaFromCompact = (fc)    => `${fc.slice(0, 4)}-${fc.slice(4, 6)}-${fc.slice(6, 8)}`;
// Ordena horas con la madrugada (00–02) después de las 23
const horaSortKey      = (hora)  => { const h = parseInt(hora); return h <= 3 ? h + 24 : h; };

/**
 * Abrevia el nombre de una cancha para que quepan todas en la fila de WhatsApp.
 * - "Cancha 3" → "C3", "Pista 12" → "P12", "Fútbol 5" → "F5"
 * - Sin número: primeras 4 letras sin espacios ("Central" → "Cent").
 */
function abreviarCancha(nombre) {
  const n = String(nombre).trim();
  const m = n.match(/^(.*?)(\d+)\s*$/);      // texto opcional + número al final
  if (m) {
    const prefix = m[1].trim();
    const inicial = prefix ? prefix[0].toUpperCase() : 'C';
    return `${inicial}${m[2]}`;
  }
  return n.replace(/\s+/g, '').slice(0, 4) || n;
}

/**
 * Lista de canchas para la descripción de la fila (máx. 72 chars en WhatsApp).
 * 1) Nombres completos si entran (legible cuando son pocas).
 * 2) Abreviadas separadas por coma → TODAS visibles ("C1, C2, C3, C4").
 * 3) Último recurso: "N canchas".
 */
function formatCanchas(names) {
  if (!names.length) return '';
  const full = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  if (full.length <= 72) return full;

  const abbr = names.map(abreviarCancha).join(', ');
  if (abbr.length <= 72) return abbr;

  return `${names.length} canchas`;
}

/**
 * Agrupa las canchas disponibles por Deporte + Superficie y lista sus
 * identificadores. Formato (una línea, máx. 72 chars):
 *   "Futb Sint C1 C3 C5, Futb Natu C2 C4, Pade Sint C1 C2"
 * Cada cancha ya viene filtrada por disponibilidad.
 * @param {Array<{deporte,superficie,identificador,nombre}>} courts
 */
function formatCanchasAgrupadas(courts) {
  if (!courts.length) return '';
  const grupos = new Map();  // "Futb Sint" → ['C1','C3']
  for (const c of courts) {
    const sup = abbrSuperficie(c.superficie);
    const key = `${abbrDeporte(c.deporte)}${sup ? ' ' + sup : ''}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(c.identificador || abreviarCancha(c.nombre));
  }
  const partes = [...grupos.entries()].map(([k, ids]) => `${k} ${ids.join(' ')}`);
  const joined = partes.join(', ');
  return joined.length <= 72 ? joined : `${courts.length} canchas`;
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

  const slotsNecesarios = Math.max(1, Math.ceil(duracion / 60));
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
      // Todos los slots de 60' (horas completas) que ocupa el turno
      const chunk = Array.from({ length: slotsNecesarios }, (_, i) => addMinutes(hora, i * 60));
      const cabe   = chunk.every(h => horasSet.has(h));       // dentro del horario
      const libre  = chunk.every(h => !ocupadosSet.has(h));   // sin ocupar
      if (!cabe || !libre || isPast(fecha, hora, apertura)) continue;
      (byHour[hora] ??= []).push({
        fieldId: field.id, nombre: field.nombre, deporte: field.deporte,
        superficie: field.superficie, identificador: field.identificador,
        precio: field.precio_base,
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

    // Calcular todos los slots que ocupa la reserva (duracion / 60 min)
    const slotsNecesarios = Math.ceil(duracion / 60);
    const horasAReservar  = Array.from({ length: slotsNecesarios }, (_, i) =>
      addMinutes(hora_inicio, i * 60)
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
function isValidSignature(req, appSecret) {
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
 *
 * MULTI-TENANT: acepta el verify token de PLATAFORMA (.env) o el de CUALQUIER
 * club, para que cada club pueda dar de alta el mismo webhook con su token propio.
 */
async function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) return res.sendStatus(403);

  // 1) Token de plataforma
  if (process.env.META_WEBHOOK_VERIFY_TOKEN && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado (token de plataforma) ✓');
    return res.status(200).send(challenge);
  }

  // 2) Token propio de algún club
  try {
    const row = await ClubIntegration.findOne({
      where: { meta_webhook_verify_token: token, activo: true },
      attributes: ['club_id'],
    });
    if (row) {
      console.log(`[WhatsApp] Webhook verificado (club ${row.club_id}) ✓`);
      return res.status(200).send(challenge);
    }
  } catch (err) {
    console.error('[WhatsApp] verifyWebhook:', err.message);
  }

  return res.sendStatus(403);
}

/**
 * POST /api/chatbot/webhook
 * Recibe mensajes entrantes de WhatsApp y responde con mensajes interactivos.
 * Responde 200 inmediatamente (Meta requiere respuesta en < 5 s).
 */
async function handleWebhook(req, res) {
  const body  = req.body;
  const value = body?.entry?.[0]?.changes?.[0]?.value;

  // ── MULTI-TENANT: el número destino identifica al club ──
  // Meta incluye metadata.phone_number_id = el número del CLUB que recibió el mensaje.
  const phoneNumberId = value?.metadata?.phone_number_id;
  const clubId = await integrations.findClubIdByPhoneNumberId(phoneNumberId);
  const creds  = await integrations.getMetaCredentials(clubId);

  // Firma validada con el App Secret del club (o el de plataforma como fallback)
  if (!isValidSignature(req, creds.appSecret)) {
    console.warn('[WhatsApp] Webhook con firma inválida — rechazado.');
    return res.sendStatus(403);
  }

  res.sendStatus(200);   // ACK inmediato (Meta exige < 5 s)

  try {
    if (body.object !== 'whatsapp_business_account') return;

    const entry = value;
    const msg   = entry?.messages?.[0];
    // Meta también envía webhooks de "statuses" (entregado/leído) sin `messages`.
    if (!msg) {
      if (entry?.statuses) console.log('[WhatsApp] ← status:', entry.statuses[0]?.status);
      return;
    }

    if (!clubId) {
      console.warn(`[WhatsApp] Mensaje de un número sin club asociado (phone_number_id=${phoneNumberId}). ` +
        'Cargá la integración en club_integrations.');
      return;
    }
    if (creds.expired) {
      console.warn(`[WhatsApp] Token vencido para el club ${clubId} — no se responde.`);
      return;
    }

    // Contexto del tenant que se pasa a todos los helpers
    const ctx = { clubId, creds };
    const send = p => wa.sendMessage(p, ctx.creds);

    const from    = msg.from;   // número WhatsApp del remitente
    const msgType = msg.type;

    console.log(`[WhatsApp] ← club ${clubId} · mensaje de ${from} · tipo=${msgType}` +
      (msgType === 'text' ? ` · texto="${msg.text?.body}"` : ''));

    // ── Mensaje de texto ───────────────────────────────────────
    if (msgType === 'text') {
      const raw  = msg.text?.body || '';
      const text = raw.toLowerCase().trim();

      // Cancelar reserva por texto: "cancelar #123"
      const cancelMatch = text.match(/^cancelar\s+#(\d+)$/i);
      if (cancelMatch) {
        pendingName.delete(from);
        await _handleTextCancel(ctx, from, parseInt(cancelMatch[1]));
        return;
      }

      // Selección numérica del menú principal (1 / 2 / 3 / 4), igual que tocar la lista.
      if (['1', '2', '3', '4'].includes(text)) {
        if (text === '1') { await _sendContactButton(ctx, from); return; }
        if (text === '2') { await _sendWebButton(ctx, from); return; }
        if (text === '4') { await _sendMisTurnos(ctx, from); return; }
        pendingName.delete(from);        // opción 3: arranca el flujo de turnos
        await _sendDaysMenu(ctx, from);
        return;
      }

      // Saludos / palabras de menú → mostrar el menú de bienvenida.
      // OJO: NO arranca el flujo de turnos (eso solo pasa con "Turnos por WhatsApp").
      const resetWords = [
        'hola', 'hi', 'hello', 'buenas', 'buen dia', 'buen día', 'buenos dias', 'buenos días',
        'buenas tardes', 'buenas noches', 'reservar', 'reserva', 'turno', 'turnos',
        'inicio', 'menu', 'menú', 'volver', 'ola',
      ];
      if (resetWords.includes(text)) {
        pendingName.delete(from);
        await _sendWelcome(ctx, from);
        return;
      }

      // ¿Estábamos esperando el nombre del titular? → armar la confirmación
      if (pendingName.has(from)) {
        const nombre = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
        if (nombre.length < 2) {
          await send({ to: from, type: 'text', text: { body: '⚠️ Escribí un nombre válido (nombre y apellido).' } });
          return;
        }
        const pend = pendingName.get(from);
        pend.name = nombre;
        pendingName.set(from, pend);

        const { fecha, fieldId, hora, duracion } = parseSlotId(pend.slotRaw);
        const field = await Field.findByPk(fieldId);
        const inicio = new Date(`${fecha}T${hora}:00`);
        await send(wa.buildConfirmMessage(from, {
          slotId:        pend.slotRaw,
          fechaLabel:    formatFechaLabel(fecha),
          hora,
          cancha:        nombreCancha(field?.identificador, field?.nombre) || `Cancha ${fieldId}`,
          nombre,
          duracionLabel: duracionLabel(duracion),
          aviso:         avisoAlReservar(inicio),   // política según cuánto falte
        }));
        return;
      }

      // Cualquier otro texto no relacionado con turnos → saludo + menú
      await _sendWelcome(ctx, from);
      return;
    }

    // ── Respuesta de lista (eligió día o slot) ─────────────────
    if (msgType === 'interactive' && msg.interactive?.type === 'list_reply') {
      const replyId = msg.interactive.list_reply.id;

      // ── Opciones del menú de bienvenida ──
      if (replyId === 'menu_turnos') {
        // Única vía para arrancar el flujo de turnos por WhatsApp
        pendingName.delete(from);
        await _sendDaysMenu(ctx, from);
        return;
      }
      if (replyId === 'menu_web') {
        await _sendWebButton(ctx, from);
        return;
      }
      if (replyId === 'menu_contacto') {
        await _sendContactButton(ctx, from);
        return;
      }
      if (replyId === 'menu_misturnos') {
        await _sendMisTurnos(ctx, from);
        return;
      }

      if (replyId.startsWith('day_')) {
        // Eligió un día → mostrar las franjas horarias (mañana/tarde/noche)
        const fecha = replyId.replace('day_', '');
        await _sendGroupsMenu(ctx, from, fecha);
        return;
      }

      if (replyId.startsWith('grp_')) {
        // Eligió una franja → mostrar el menú de duración
        const [fc, group] = replyId.replace('grp_', '').split('_');
        await _sendDurationMenu(ctx, from, fechaFromCompact(fc), group);
        return;
      }

      if (replyId.startsWith('dur_')) {
        // Eligió la duración → mostrar horas libres (franja + duración) con sus canchas
        const [fc, group, dur] = replyId.replace('dur_', '').split('_');
        await _sendHoursMenu(ctx, from, fechaFromCompact(fc), group, parseInt(dur));
        return;
      }

      if (replyId.startsWith('hr_')) {
        // Eligió una hora → mostrar las canchas disponibles para esa hora + duración
        const [fc, dur, hc] = replyId.replace('hr_', '').split('_');
        const hora = `${hc.slice(0, 2)}:${hc.slice(2)}`;
        await _sendCourtsMenu(ctx, from, fechaFromCompact(fc), hora, parseInt(dur));
        return;
      }

      if (replyId.startsWith('slot_')) {
        // Eligió la cancha → pedir el nombre del titular antes de confirmar
        const slotRaw = replyId.replace('slot_', '');
        setPending(from, { slotRaw });
        await send({
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
        await _handleConfirm(ctx, from, btnId.replace('confirm_', ''));
        return;
      }

      if (btnId.startsWith('discard_')) {
        pendingName.delete(from);
        await send({
          to: from, type: 'text',
          text: { body: '❌ Reserva no realizada.\nEscribí *hola* para volver al menú cuando quieras.' },
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

/** Saludo según la hora de Argentina (robusto ante la TZ del server). */
function saludoActual() {
  const h = parseInt(new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()), 10);
  if (h < 12) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Interacción inicial: saludo amigable con el nombre del club + menú de 3 opciones.
 * El flujo de turnos NO arranca acá: solo se activa al elegir "Turnos por WhatsApp".
 */
async function _sendWelcome(ctx, to) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const complex = await Complex.findByPk(ctx.clubId, { attributes: ['nombre'] });
  const nombre = complex?.nombre || 'nosotros';

  // Saludo + pregunta + menú numerado (el usuario puede RESPONDER con el número).
  await send({
    to, type: 'text',
    text: {
      body:
        `${saludoActual()}, gracias por comunicarte con *${nombre}* 👋\n\n` +
        `*¿En qué te podemos ayudar?*\n\n` +
        `1️⃣ Comunicarse con la cancha\n` +
        `2️⃣ Turnos por la Web\n` +
        `3️⃣ Turnos por WhatsApp\n` +
        `4️⃣ Ver mis turnos\n\n` +
        `_Respondé con el número (1, 2, 3 o 4) o tocá "Ver opciones"._`,
    },
  });

  // Lista interactiva con las mismas opciones numeradas (para tocar).
  await send(wa.buildRowsListMessage(to, {
    headerText:   'Menú principal',
    bodyText:     '¿En qué te podemos ayudar? Elegí una opción:',
    footerText:   nombre,
    button:       'Ver opciones',
    sectionTitle: 'Opciones',
    rows: [
      { id: 'menu_contacto',  title: '1. Comunicarse Cancha', description: 'Chateá directo con la cancha' },
      { id: 'menu_web',       title: '2. Turnos por la Web',  description: 'Reservá desde la web' },
      { id: 'menu_turnos',    title: '3. Turnos por WhatsApp', description: 'Sacá tu turno acá mismo' },
      { id: 'menu_misturnos', title: '4. Ver mis turnos',     description: 'Consultá tus turnos agendados' },
    ],
  }));
}

/**
 * "Ver mis turnos": lista los turnos del jugador unificando ambos canales
 * (web + WhatsApp), buscando por su número de WhatsApp y por su cuenta.
 * Muestra fecha/hora, cancha, complejo, estado y cómo cancelar cada uno.
 */
async function _sendMisTurnos(ctx, from) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const d = soloDigitos(from);
  const cuenta = await cuentaPorTelefono(from);

  const orConds = [{ telefono_cliente: { [Op.in]: [from, d, `+${d}`] } }];
  if (cuenta) orConds.push({ user_id: cuenta.id });

  const turnos = await Booking.findAll({
    where: {
      [Op.or]:  orConds,
      estado:   { [Op.notIn]: ['cancelado', 'rechazado'] },
      fecha:    { [Op.gte]: todayAR() },   // próximos (activos)
    },
    include: [{
      model: Field, as: 'field',
      attributes: ['nombre', 'identificador', 'deporte', 'superficie'],
      include: [{ model: Complex, as: 'complex', attributes: ['nombre'] }],
    }],
    order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
    limit: 10,
  });

  if (!turnos.length) {
    await send({
      to: from, type: 'text',
      text: { body: '📭 No tenés turnos próximos.\n\nEscribí *hola* para volver al menú y sacar uno nuevo.' },
    });
    return;
  }

  const ESTADO = {
    confirmado:     '🟢 Confirmado',
    pendiente:      '🟡 Pendiente',
    pendiente_pago: '🟠 Pendiente de pago',
    no_asistido:    '⚪ No asistió',
  };

  const bloques = turnos.map(t => {
    const cancha  = nombreCancha(t.field?.identificador, t.field?.nombre);
    const complejo = t.field?.complex?.nombre || '';
    return (
      `🗓️ *${formatFechaLabel(t.fecha)}* · ${t.hora_inicio}→${t.hora_fin}\n` +
      `🏟️ ${cancha}${complejo ? ` — ${complejo}` : ''}\n` +
      `${ESTADO[t.estado] || t.estado}\n` +
      `Para cancelar: *cancelar #${t.id}*`
    );
  });

  await send({
    to: from, type: 'text',
    text: {
      body:
        `📋 *Tus próximos turnos* (${turnos.length})\n\n` +
        bloques.join('\n\n────────\n\n') +
        `\n\nEscribí *hola* para volver al menú (comunicarte con la cancha o sacar otro turno).`,
    },
  });
}

/**
 * Payload de un link "web" como TEXTO (no como botón cta_url).
 *
 * Motivo: los botones cta_url de WhatsApp SIEMPRE abren el navegador interno
 * (WebView). Enviando el link como texto, WhatsApp respeta la preferencia del
 * usuario y abre el navegador EXTERNO del dispositivo (Safari/Chrome/Edge);
 * si igual se abre adentro, se le indica cómo abrirlo afuera.
 */
function webLinkText(to, webUrl, { titulo = '🌐 *Ver la web*', intro = 'Entrá desde acá:' } = {}) {
  return {
    to,
    type: 'text',
    text: {
      preview_url: true,   // muestra la vista previa del link
      body:
        `${titulo}\n\n` +
        `${intro}\n${webUrl}\n\n` +
        `_Consejo: si el link se abre dentro de WhatsApp, tocá el menú *⋮* (arriba a la derecha) y elegí *"Abrir en el navegador"*._`,
    },
  };
}

/**
 * "Turnos por la Web" (menú): envía el link como texto para abrir el navegador
 * externo. Destino: link de invitación del complejo (+ teléfono) o home.
 */
async function _sendWebButton(ctx, to) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const complex = await Complex.findByPk(ctx.clubId, { attributes: ['link_invitacion'] });
  const telParam = encodeURIComponent(to);
  const webUrl = complex?.link_invitacion
    ? `${complex.link_invitacion}${complex.link_invitacion.includes('?') ? '&' : '?'}tel=${telParam}`
    : 'https://www.jugahoyweb.com';

  await send(webLinkText(to, webUrl, { titulo: '🌐 *Turnos por la Web*', intro: 'Reservá desde acá:' }));
}

/** Botón "Comunicate con la cancha": chat con el número configurado (o aviso si no hay). */
async function _sendContactButton(ctx, to) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const complex = await Complex.findByPk(ctx.clubId, { attributes: ['whatsapp_contacto'] });
  if (complex?.whatsapp_contacto) {
    await send(wa.buildContactCanchaMessage(to, complex.whatsapp_contacto));
  } else {
    await send({
      to, type: 'text',
      text: { body: 'ℹ️ La cancha todavía no configuró un número de contacto directo.' },
    });
  }
}

async function _sendDaysMenu(ctx, to) {
  const send = p => wa.sendMessage(p, ctx.creds);
  await send(wa.buildDaysListMessage(to, getNext8Days()));
}

/**
 * Menú de franjas horarias (mañana / tarde / noche) para una fecha.
 * Si la fecha es HOY, se deshabilitan automáticamente las franjas ya pasadas
 * (solo se muestran las que todavía tienen horarios futuros).
 */
async function _sendGroupsMenu(ctx, to, fecha) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const fc = fechaCompact(fecha);

  const rows = Object.entries(FRANJAS)
    .filter(([, franja]) => franjaTieneFuturo(fecha, franja))
    .map(([key, franja]) => ({
      id:          `grp_${fc}_${key}`,
      title:       franja.title,
      description: franja.rango,
    }));

  // Todas las franjas del día ya pasaron → ofrecer elegir otro día.
  if (!rows.length) {
    await send({
      to, type: 'text',
      text: { body: `😔 Ya no quedan horarios disponibles para el ${formatFechaLabel(fecha)}.\nElegí otro día:` },
    });
    await _sendDaysMenu(ctx, to);
    return;
  }

  await send(wa.buildRowsListMessage(to, {
    headerText:   `🕐 ${formatFechaLabel(fecha)}`,
    bodyText:     '¿En qué franja horaria querés jugar?',
    footerText:   'JugaHoy — Reservas deportivas',
    button:       'Ver franjas',
    sectionTitle: 'Franjas horarias',
    rows,
  }));
}

/** Menú de duración del turno (1 h / 1½ h / 2 h) para una franja */
async function _sendDurationMenu(ctx, to, fecha, group) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const franja = FRANJAS[group];
  const fc = fechaCompact(fecha);
  const rows = DURACIONES.map(d => ({
    id:          `dur_${fc}_${group}_${d.min}`,
    title:       d.label,
    description: `${d.min} minutos`,
  }));
  await send(wa.buildRowsListMessage(to, {
    headerText:   `⏱️ ${formatFechaLabel(fecha)} · ${franja?.label || ''}`,
    bodyText:     '¿Cuánto tiempo querés jugar?',
    footerText:   'Elegí la duración del turno',
    button:       'Ver duraciones',
    sectionTitle: 'Duración del turno',
    rows,
  }));
}

/** Menú de horas libres dentro de una franja+duración, indicando las canchas de cada hora */
async function _sendHoursMenu(ctx, to, fecha, group, duracion) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const franja = FRANJAS[group];
  if (!franja) return _sendGroupsMenu(ctx, to, fecha);

  const byHour = await getAvailableByHour(fecha, ctx.clubId, duracion);
  const horas  = Object.keys(byHour)
    .filter(h => franja.test(parseInt(h)))
    .sort((a, b) => horaSortKey(a) - horaSortKey(b));

  if (!horas.length) {
    await send({
      to, type: 'text',
      text: { body: `😔 No hay horarios de ${duracionLabel(duracion)} libres en la franja ${franja.label} para el ${formatFechaLabel(fecha)}.\nProbá con otra duración:` },
    });
    await _sendDurationMenu(ctx, to, fecha, group);
    return;
  }

  const fc = fechaCompact(fecha);
  const rows = horas.map(hora => ({
    id:          `hr_${fc}_${duracion}_${hora.replace(':', '')}`,
    title:       `${hora} hs`,
    // Canchas libres agrupadas por deporte + superficie (ej. "Futb Sint C1 C3")
    description: formatCanchasAgrupadas(byHour[hora]),
  }));

  await send(wa.buildRowsListMessage(to, {
    headerText:   `⏰ ${formatFechaLabel(fecha)} · ${franja.label}`,
    bodyText:     `Turnos de ${duracionLabel(duracion)}. Elegí un horario (se indican las canchas libres):`,
    footerText:   `Duración: ${duracionLabel(duracion)}`,
    button:       'Ver horarios',
    sectionTitle: 'Horarios disponibles',
    rows,
  }));
}

/** Menú de canchas disponibles para una hora + duración concretas */
async function _sendCourtsMenu(ctx, to, fecha, hora, duracion) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const byHour = await getAvailableByHour(fecha, ctx.clubId, duracion);
  const courts = byHour[hora] || [];

  if (!courts.length) {
    await send({
      to, type: 'text',
      text: { body: `⚠️ El horario ${hora} hs ya no tiene canchas libres para ${duracionLabel(duracion)}. Elegí otro:` },
    });
    await _sendGroupsMenu(ctx, to, fecha);
    return;
  }

  const rows = courts.map(c => ({
    id:          `slot_${buildSlotId(fecha, c.fieldId, hora, duracion)}`,
    // "Cancha 1" (un solo nombre, sin abreviar ni duplicar)
    title:       nombreCancha(c.identificador, c.nombre).substring(0, 24),
    // Descripción completa: "$4.000/hr · Fútbol Sintético"
    description: `$${Number(c.precio || 0).toLocaleString('es-AR')}/hr · ${tipoCanchaCompleto(c.deporte, c.superficie)}`,
  }));

  await send(wa.buildRowsListMessage(to, {
    headerText:   `🏟️ ${formatFechaLabel(fecha)} · ${hora} hs (${duracionLabel(duracion)})`,
    bodyText:     'Elegí la cancha para tu turno:',
    footerText:   'Después te pido el nombre',
    button:       'Ver canchas',
    sectionTitle: 'Canchas disponibles',
    rows,
  }));
}

async function _sendSchedulesMenu(ctx, to, fecha) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const groups = await getAvailableSlotsGrouped(fecha, ctx.clubId);

  if (!groups.length) {
    await send({
      to, type: 'text',
      text: { body: `😔 No hay horarios disponibles para el ${formatFechaLabel(fecha)}.\nElegí otro día:` },
    });
    await _sendDaysMenu(ctx, to);
    return;
  }

  const sections = groups.map(g => ({
    title: g.field.nombre,
    rows:  g.slots,
  }));

  await send(wa.buildSchedulesListMessage(to, formatFechaLabel(fecha), sections));
}

async function _handleConfirm(ctx, from, slotRaw) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const { fecha, fieldId, hora, duracion } = parseSlotId(slotRaw);
  // Nombre del titular ingresado por el usuario (fallback si se perdió el estado)
  const pend = pendingName.get(from);
  const nombreTitular = pend?.name || `WhatsApp ${from.slice(-4)}`;

  const t = await sequelize.transaction();
  let booking, field, complex, hora_fin, monto;
  try {
    field = await Field.findByPk(fieldId, { transaction: t });
    if (!field) {
      await t.rollback();
      await send({ to: from, type: 'text', text: { body: '⚠️ Cancha no encontrada.' } });
      return;
    }

    // Slots que ocupa la reserva (duracion / 60 min)
    const slotsNecesarios = Math.ceil(duracion / 60);
    const horasAReservar  = Array.from({ length: slotsNecesarios }, (_, i) =>
      addMinutes(hora, i * 60)
    );
    hora_fin = addMinutes(hora, duracion);

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
      await send({
        to: from, type: 'text',
        text: { body: '⚠️ Ese horario acaba de ser reservado. Elegí otro:' },
      });
      await _sendGroupsMenu(ctx, from, fecha);
      return;
    }

    // Monto según duración: precios_por_duracion o precio_base proporcional
    const precios = field.precios_por_duracion || {};
    monto = precios[String(duracion)] != null
      ? parseFloat(precios[String(duracion)])
      : parseFloat(field.precio_base || 0) * (duracion / 60);

    // Si el WhatsApp pertenece a una cuenta, vincular la reserva a ese usuario
    // (así aparece en su "Mis turnos" de la web y se mantiene la trazabilidad).
    const cuenta = await cuentaPorTelefono(from, t);

    booking = await Booking.create({
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
      user_id:          cuenta?.id || null,
      created_by:       null,
    }, { transaction: t });

    for (const h of horasAReservar) {
      await TimeSlot.upsert(
        { field_id: fieldId, fecha, hora: h, estado: 'ocupado', booking_id: booking.id },
        { transaction: t }
      );
    }

    // ── Traza en "Operaciones" (mismo mecanismo que la PWA, origen 'chatbot') ──
    // La fecha/hora exacta la guarda Operation.fecha (defaultValue NOW).
    const canchaLbl = nombreCancha(field.identificador, field.nombre);
    await Operation.create({
      complex_id:  ctx.clubId,
      tipo:        'reserva',
      origen:      'chatbot',
      descripcion: `Reserva por WhatsApp: ${nombreTitular} — ${fecha} ${hora}→${hora_fin} (${duracion}min) · ${canchaLbl}`,
      agenda_id:   booking.id,
      monto:       monto || 0,
    }, { transaction: t });

    // ── Notificación in-app al dueño del complejo (como la PWA) ──
    complex = await Complex.findByPk(ctx.clubId, {
      attributes: ['owner_id', 'nombre', 'link_invitacion', 'whatsapp_contacto'],
      transaction: t,
    });
    if (complex?.owner_id) {
      await Notification.create({
        user_id:    complex.owner_id,
        tipo:       'nueva_reserva',
        titulo:     '🔔 Nueva reserva por WhatsApp',
        mensaje:    `${nombreTitular} reservó ${canchaLbl} el ${fecha} de ${hora} a ${hora_fin} (${duracion} min) desde el chatbot.`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await t.commit();
    pendingName.delete(from);   // limpiar el estado de "esperando nombre"

    // Log de auditoría de la acción crítica
    console.log(`[audit] chatbot RESERVA booking#${booking.id} complejo=${ctx.clubId} cancha=${field.identificador || field.nombre} ${fecha} ${hora}-${hora_fin} tel=${from} @ ${new Date().toISOString()}`);

  } catch (err) {
    // Solo revertir si la transacción sigue activa (evita el error engañoso
    // "cannot be rolled back ... state: commit" cuando falla algo post-commit).
    if (!t.finished) await t.rollback();
    console.error('[chatbot._handleConfirm]', err);
    await send({
      to: from, type: 'text',
      text: { body: '⚠️ Hubo un error al confirmar. Intentalo de nuevo.' },
    });
    return;
  }

  // ── Push al dueño del complejo (best-effort, mismo mecanismo que la PWA) ──
  if (complex?.owner_id) {
    notifService.sendToUserAsync(complex.owner_id, {
      tipo:   'reserva',
      titulo: '🔔 Nueva reserva por WhatsApp',
      body:   `${nombreTitular} reservó ${nombreCancha(field.identificador, field.nombre)} el ${fecha} ${hora}–${hora_fin}.`,
      url:    '/dashboard',
      data:   { cancha_id: field.id, cancha_nombre: field.nombre, fecha, hora, booking_id: booking.id },
    });
    console.log(`[audit] chatbot NOTIFICACION push→owner#${complex.owner_id} booking#${booking.id} @ ${new Date().toISOString()}`);
  }

  // ── Post-commit: mensajería (FUERA de la transacción) ──────────────────
  // La reserva ya está confirmada en la DB. Si un envío de WhatsApp falla,
  // NO debe revertir nada: solo se loguea para no romper el flujo del bot.
  try {
    await send({
      to: from, type: 'text',
      text: {
        body: `✅ ¡Turno confirmado!\n\n` +
              `📅 ${formatFechaLabel(fecha)}\n` +
              `⏰ ${hora} hs (${duracionLabel(duracion)})\n` +
              `🏟️ ${nombreCancha(field.identificador, field.nombre)} · ${tipoCanchaCompleto(field.deporte, field.superficie)}\n` +
              `👤 ${nombreTitular}\n\n` +
              `ID de reserva: *#${booking.id}*\n` +
              `Para cancelar escribí: *cancelar #${booking.id}*`,
      },
    });

    // Config del complejo ya cargada dentro de la transacción (link + WhatsApp).
    // Botón "Ver la web". En ambos casos viaja el teléfono de WhatsApp (tel) para
    // guardarlo en la cuenta del jugador al iniciar sesión/registrarse:
    //   1) Con link de invitación del admin → se usa ese link + tel anexado.
    //   2) Sin link → login?complex=<id>&tel=<tel> (auto-vínculo al complejo + teléfono).
    const telParam = encodeURIComponent(from);
    const webUrl = complex?.link_invitacion
      ? `${complex.link_invitacion}${complex.link_invitacion.includes('?') ? '&' : '?'}tel=${telParam}`
      : frontendUrl(`login?complex=${ctx.clubId}&tel=${telParam}`);
    // Link como TEXTO (no botón cta_url) → abre el navegador externo del dispositivo.
    await send(webLinkText(from, webUrl, { titulo: '🌐 *Ver la web del complejo*', intro: 'Gestioná tu reserva desde acá:' }));

    // Segundo botón OPCIONAL: "Comunicate con la cancha".
    // Prioridad: número propio de la cancha → número del complejo.
    const waContacto = field?.whatsapp_contacto || complex?.whatsapp_contacto;
    if (waContacto) {
      await send(wa.buildContactCanchaMessage(from, waContacto));
    }
  } catch (err) {
    console.error('[chatbot._handleConfirm] aviso post-confirmación falló (la reserva SÍ se guardó):', err.message);
  }
}

async function _handleTextCancel(ctx, from, bookingId) {
  const send = p => wa.sendMessage(p, ctx.creds);
  const t = await sequelize.transaction();
  try {
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: TimeSlot, as: 'timeSlots' }],
      transaction: t,
    });

    if (!booking || booking.telefono_cliente !== from) {
      await t.rollback();
      await send({
        to: from, type: 'text',
        text: { body: `⚠️ No encontramos la reserva *#${bookingId}* asociada a tu número.` },
      });
      return;
    }

    if (booking.estado === 'cancelado') {
      await t.rollback();
      await send({
        to: from, type: 'text',
        text: { body: `ℹ️ La reserva *#${bookingId}* ya estaba cancelada.` },
      });
      return;
    }

    // ── Regla de cancelación (2 h de anticipación / 15 min de gracia) ──
    const regla = evaluarCancelacion(booking);
    if (!regla.allowed) {
      await t.rollback();
      await send({
        to: from, type: 'text',
        text: { body: `⛔ No se puede cancelar la reserva *#${bookingId}*.\n\n${regla.mensaje}` },
      });
      return;
    }

    await Promise.all(
      booking.timeSlots.map(s =>
        s.update({ estado: 'libre', booking_id: null }, { transaction: t })
      )
    );
    await booking.update({ estado: 'cancelado' }, { transaction: t });

    // ── Traza en "Operaciones" (origen 'chatbot'); fecha exacta = Operation.fecha ──
    await Operation.create({
      complex_id:  ctx.clubId,
      tipo:        'cancelacion',
      origen:      'chatbot',
      descripcion: `Cancelación por WhatsApp: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio} (reserva #${booking.id})`,
      agenda_id:   booking.id,
    }, { transaction: t });

    await t.commit();

    console.log(`[audit] chatbot CANCELACION booking#${booking.id} complejo=${ctx.clubId} ${booking.fecha} ${booking.hora_inicio} tel=${from} @ ${new Date().toISOString()}`);

    await send({
      to: from, type: 'text',
      text: { body: `✅ Reserva *#${bookingId}* cancelada.\n\nEscribí *hola* para volver al menú.` },
    });

    // ── Notificación + push al dueño del complejo (mismo mecanismo que la PWA) ──
    try {
      const complex = await Complex.findByPk(ctx.clubId, { attributes: ['owner_id'] });
      if (complex?.owner_id) {
        await Notification.create({
          user_id:    complex.owner_id,
          tipo:       'reserva_cancelada',
          titulo:     '🚫 Turno cancelado por WhatsApp',
          mensaje:    `${booking.nombre_cliente} canceló su turno del ${booking.fecha} a las ${booking.hora_inicio} (reserva #${booking.id}) desde el chatbot.`,
          booking_id: booking.id,
        });
        notifService.sendToUserAsync(complex.owner_id, {
          tipo:   'cancelacion',
          titulo: '🚫 Turno cancelado por WhatsApp',
          body:   `${booking.nombre_cliente} canceló el ${booking.fecha} ${booking.hora_inicio}.`,
          url:    '/dashboard',
          data:   { booking_id: booking.id },
        });
        console.log(`[audit] chatbot NOTIFICACION push→owner#${complex.owner_id} cancelacion booking#${booking.id} @ ${new Date().toISOString()}`);
      }
    } catch (e) {
      console.error('[chatbot._handleTextCancel] traza/notif falló (la cancelación SÍ se guardó):', e.message);
    }

  } catch (err) {
    if (!t.finished) await t.rollback();
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
