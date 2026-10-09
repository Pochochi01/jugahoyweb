'use strict';
/**
 * services/recordatorioService.js — RecordatorioService: confirmación de asistencia por WhatsApp
 *
 * Flujo (por complejo con `configuracion_chatbot.hora_recordatorio` definida):
 *  1. Envío: a la hora configurada (hora Argentina) se pide confirmación a los turnos que
 *     empiezan dentro de las próximas 24 h (después del plazo para responder), si:
 *       a) se reservaron con más de 24 h de anticipación, o
 *       b) son ocurrencias de un turno fijo.
 *     El turno queda en estado_confirmacion='pendiente' con un límite = envío + plazo (3 h).
 *  2. Respuesta: cualquier mensaje del mismo número al chatbot (Baileys o Meta) dentro del
 *     plazo confirma el turno. "NO" / "cancelar" lo cancela a pedido del cliente.
 *  3. Vencimiento: sin respuesta en el plazo → el turno se cancela, se libera el horario
 *     (aviso a la lista de espera) y se avisa al cliente por el chatbot.
 *
 * Ventanas sin solapamiento: el envío del día D cubre los turnos con inicio en
 * (ahora + plazo, D@hora + 24 h + plazo]. Si el server estuvo caído a la hora exacta,
 * envía igual mientras siga dentro del plazo de esa tanda (no manda tarde fuera de él).
 *
 * Los mensajes salen por el canal del chatbot del complejo (`wa.sendMessage` con sus
 * credenciales): Baileys si el complejo lo eligió como proveedor; si es Meta, se respeta
 * la ventana de 24 h (plantilla `confirmacion_asistencia` cuando corresponda).
 */
const { Op } = require('sequelize');
const {
  sequelize, Booking, Field, Complex, TimeSlot, User, Operation, Notification, ConfiguracionChatbot,
} = require('../models');
const wa = require('./whatsappService');
const waWindow = require('./whatsappWindowService');
const integrations = require('./integrations.service');
const { inicioDe, yaComenzo } = require('../utils/cancelPolicy');
const { todayAR, sumarDias } = require('../utils/time');

const MSG_RECORDATORIO = 'Confirme su asistencia respondiendo este mensaje en las próximas 3 horas. De lo contrario, el turno será cancelado.';
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const H = 3600 * 1000;
const telKey = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-10) : null; };
const log = (...a) => console.log('[confirmación]', ...a);

// ── Configuración ────────────────────────────────────────────────────────────

/** Configuración del complejo (valores por defecto si no hay fila). */
async function getConfig(complexId) {
  const c = await ConfiguracionChatbot.findOne({ where: { complex_id: complexId } });
  return { complex_id: Number(complexId), hora_recordatorio: c?.hora_recordatorio || null, horas_confirmacion: c?.horas_confirmacion || 3 };
}

/** Guarda la hora ('HH:mm' o null para desactivar). Lanza Error(400) si es inválida. */
async function setConfig(complexId, { hora_recordatorio }) {
  const hora = hora_recordatorio ? String(hora_recordatorio).slice(0, 5) : null;
  if (hora && !HORA_RE.test(hora)) { const e = new Error('Hora inválida (formato HH:mm).'); e.status = 400; throw e; }
  const [row] = await ConfiguracionChatbot.findOrCreate({ where: { complex_id: complexId }, defaults: { hora_recordatorio: hora } });
  if (row.hora_recordatorio !== hora) await row.update({ hora_recordatorio: hora });
  return getConfig(complexId);
}

/** Último instante (≤ now) en que tocaba enviar según la hora configurada. */
function ultimoEnvio(hora, now = new Date()) {
  const hoy = todayAR();
  let t = new Date(`${hoy}T${hora}:00-03:00`);
  if (t > now) t = new Date(`${sumarDias(hoy, -1)}T${hora}:00-03:00`);
  return t;
}

const telDe = async (b) => b.telefono_cliente
  || (b.user_id ? (await User.findByPk(b.user_id, { attributes: ['telefono'] }))?.telefono : null);

const detalle = (b, field) => `📅 ${b.fecha}\n⏰ ${b.hora_inicio} a ${b.hora_fin} hs\n🏟️ ${field?.nombre || 'Cancha'}`;

// ── 1. Envío ─────────────────────────────────────────────────────────────────

/** Turnos que corresponde recordar ahora en un complejo (sin enviar nada). */
async function candidatos(complexId, cfg, now = new Date()) {
  const base = ultimoEnvio(cfg.hora_recordatorio, now);
  const plazo = cfg.horas_confirmacion * H;
  if (now.getTime() >= base.getTime() + plazo) return [];          // fuera del plazo de la tanda de hoy
  const desde = now.getTime() + plazo;                                // tiene que quedar tiempo para responder
  const hasta = base.getTime() + 24 * H + plazo;

  const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id', 'nombre'] });
  if (!fields.length) return [];
  const hoy = todayAR();
  const lista = await Booking.findAll({
    where: {
      field_id: { [Op.in]: fields.map(f => f.id) },
      estado: { [Op.in]: ['confirmado', 'pendiente'] },
      estado_confirmacion: null,
      fecha: { [Op.between]: [sumarDias(hoy, -1), sumarDias(hoy, 2)] },
    },
  });
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  return lista.filter(b => {
    const ini = inicioDe(b).getTime();
    if (ini <= desde || ini > hasta) return false;
    if (b.recurring_id) return true;                                  // turno fijo
    const creado = new Date(b.createdAt || b.created_at).getTime();
    return ini - creado > 24 * H;                                     // reserva con > 24 h de anticipación
  }).map(b => Object.assign(b, { _field: fieldMap.get(b.field_id) }));
}

/** Envía el pedido de confirmación de un turno y lo deja 'pendiente'. */
async function enviarRecordatorio(b, complexId, cfg, creds, now = new Date()) {
  const tel = String(await telDe(b) || '').replace(/\D/g, '');
  if (!tel) return false;
  const cuerpo = `⏰ *Recordatorio de turno*\n\nHola ${b.nombre_cliente || ''}!\n\n${detalle(b, b._field)}\n\n${MSG_RECORDATORIO}`;
  await waWindow.enviarConVentana(complexId, tel, {
    tipo: 'confirmacion_asistencia',
    freeText: { type: 'text', text: { body: cuerpo } },
    templateParams: [b.nombre_cliente || '', b._field?.nombre || 'Cancha', b.fecha, `${b.hora_inicio} a ${b.hora_fin}`],
    creds,
    etiqueta: `turno #${b.id}`,
  });
  await b.update({
    estado_confirmacion: 'pendiente',
    confirmacion_enviada_at: now,
    confirmacion_limite: new Date(now.getTime() + cfg.horas_confirmacion * H),
    confirmacion_tel: tel,
  });
  return true;
}

/** Revisa todos los complejos configurados y envía lo que toque. */
async function enviarPendientes(now = new Date()) {
  const cfgs = await ConfiguracionChatbot.findAll({
    where: { hora_recordatorio: { [Op.ne]: null } },
    include: [{ model: Complex, as: 'complejo', where: { activo: true }, attributes: ['id'] }],
  });
  let enviados = 0;
  for (const c of cfgs) {
    const cfg = { hora_recordatorio: c.hora_recordatorio, horas_confirmacion: c.horas_confirmacion || 3 };
    const lista = await candidatos(c.complex_id, cfg, now);
    if (!lista.length) continue;
    const creds = await integrations.getMetaCredentials(c.complex_id).catch(() => null);
    for (const b of lista) {
      try { if (await enviarRecordatorio(b, c.complex_id, cfg, creds, now)) enviados++; }
      catch (err) { console.error('[confirmación] envío turno', b.id, '→', err.message); }   // reintenta en el próximo tick
    }
  }
  if (enviados) log(`pedidos enviados: ${enviados}`);
  return enviados;
}

// ── 2/3. Confirmar / cancelar ────────────────────────────────────────────────

/** Marca el turno como confirmado. */
async function confirmar(bookingId) {
  const b = await Booking.findByPk(bookingId);
  if (!b) return null;
  await b.update({ estado_confirmacion: 'confirmado' });
  return b;
}

/**
 * Cancela el turno por falta de confirmación (o a pedido del cliente): libera los
 * horarios, registra la operación, avisa a la lista de espera y al cliente por WhatsApp.
 * @param {'sin_respuesta'|'cliente'|'admin'} origen
 * @returns {Booking|null} null si no se pudo (no existe, ya empezó, ya cobrado o ya cancelado)
 */
async function cancelar(bookingId, origen = 'sin_respuesta') {
  const t = await sequelize.transaction();
  let b, field;
  try {
    b = await Booking.findByPk(bookingId, { include: [{ model: TimeSlot, as: 'timeSlots' }, { model: Field, as: 'field', attributes: ['nombre', 'deporte', 'complex_id'] }], transaction: t, lock: t.LOCK.UPDATE });
    if (!b || ['cancelado', 'rechazado'].includes(b.estado) || b.cobrado || yaComenzo(b)) { await t.rollback(); return null; }
    field = b.field;
    await Promise.all(b.timeSlots.map(s => s.update({ estado: 'libre', booking_id: null }, { transaction: t })));
    await b.update({ estado: 'cancelado', estado_confirmacion: 'cancelado' }, { transaction: t });
    const porQue = { sin_respuesta: 'sin confirmación de asistencia', cliente: 'el cliente avisó que no asiste', admin: 'falta de confirmación (manual)' }[origen];
    await Operation.create({ complex_id: field.complex_id, tipo: 'cancelacion', descripcion: `Cancelación automática (${porQue}): ${b.nombre_cliente} — ${b.fecha} ${b.hora_inicio}-${b.hora_fin}` }, { transaction: t });
    if (b.user_id) {
      await Notification.create({ user_id: b.user_id, tipo: 'reserva_rechazada', titulo: 'Turno cancelado ❌', mensaje: `Tu turno del ${b.fecha} de ${b.hora_inicio} a ${b.hora_fin} fue cancelado (${porQue}).`, booking_id: b.id }, { transaction: t });
    }
    await t.commit();
  } catch (err) { await t.rollback(); throw err; }

  // Lista de espera (best-effort)
  const waitlist = require('./waitlistService');
  for (const s of b.timeSlots) {
    waitlist.notificarLiberado(field.complex_id, { field_id: b.field_id, fecha: b.fecha, hora: s.hora, deporte: field.deporte }).catch(() => {});
  }
  // Aviso al cliente por el chatbot
  const tel = String(b.confirmacion_tel || await telDe(b) || '').replace(/\D/g, '');
  if (tel) {
    const body = origen === 'cliente'
      ? `👌 Listo, cancelamos tu turno:\n\n${detalle(b, field)}\n\nEscribí *reservar* para elegir otro horario.`
      : `❌ *Turno cancelado*\n\nNo recibimos la confirmación de asistencia a tiempo, así que el turno fue cancelado:\n\n${detalle(b, field)}\n\nEscribí *reservar* para elegir otro horario.`;
    integrations.getMetaCredentials(field.complex_id)
      .then(creds => wa.sendMessage({ to: tel, type: 'text', text: { body } }, creds))
      .catch(err => console.error('[confirmación] aviso cancelación:', err.message));
  }
  return b;
}

/** Cancela los pedidos vencidos sin respuesta. */
async function cancelarVencidos(now = new Date()) {
  const vencidos = await Booking.findAll({ where: { estado_confirmacion: 'pendiente', confirmacion_limite: { [Op.lte]: now } }, attributes: ['id'] });
  let n = 0;
  for (const { id } of vencidos) {
    try {
      if (await cancelar(id, 'sin_respuesta')) n++;
      else await Booking.update({ estado_confirmacion: null }, { where: { id, estado_confirmacion: 'pendiente' } });   // ya cobrado / empezado: sin efecto
    } catch (err) { console.error('[confirmación] cancelar', id, '→', err.message); }
  }
  if (n) log(`turnos cancelados por falta de confirmación: ${n}`);
  return n;
}

/**
 * Respuesta entrante al chatbot (la llama procesarMensaje antes del menú).
 * @returns {boolean} true si el mensaje era la respuesta a un pedido de confirmación (ya respondido).
 */
async function procesarRespuesta(ctx, from, texto = '') {
  const key = telKey(from);
  if (!key) return false;
  const fields = await Field.findAll({ where: { complex_id: ctx.clubId }, attributes: ['id'] });
  if (!fields.length) return false;
  const pend = (await Booking.findAll({
    where: { field_id: { [Op.in]: fields.map(f => f.id) }, estado_confirmacion: 'pendiente', confirmacion_limite: { [Op.gt]: new Date() } },
    include: [{ model: Field, as: 'field', attributes: ['nombre'] }],
  })).filter(b => telKey(b.confirmacion_tel) === key);
  if (!pend.length) return false;

  const send = p => wa.sendMessage(p, ctx.creds);
  if (/^\s*(no\b|cancel)/i.test(texto)) {
    for (const b of pend) await cancelar(b.id, 'cliente');
    return true;
  }
  for (const b of pend) await b.update({ estado_confirmacion: 'confirmado' });
  await send({ to: from, type: 'text', text: { body: `✅ ¡Gracias! Confirmamos tu asistencia:\n\n${pend.map(b => detalle(b, b.field)).join('\n\n')}\n\n¡Te esperamos! 🙌` } });
  return true;
}

// ── Consulta para el panel ───────────────────────────────────────────────────

/** Turnos con pedido de confirmación entre dos fechas + totales por estado. */
async function resumen(complexId, { desde, hasta } = {}) {
  const hoy = todayAR();
  desde = desde || sumarDias(hoy, -7); hasta = hasta || sumarDias(hoy, 2);
  const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id', 'nombre'] });
  const turnos = fields.length ? await Booking.findAll({
    where: { field_id: { [Op.in]: fields.map(f => f.id) }, estado_confirmacion: { [Op.ne]: null }, fecha: { [Op.between]: [desde, hasta] } },
    include: [{ model: Field, as: 'field', attributes: ['nombre'] }],
    order: [['fecha', 'DESC'], ['hora_inicio', 'ASC']],
  }) : [];
  const totales = { pendiente: 0, confirmado: 0, cancelado: 0 };
  turnos.forEach(b => { totales[b.estado_confirmacion]++; });
  return {
    desde, hasta, totales,
    turnos: turnos.map(b => ({
      id: b.id, fecha: b.fecha, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin, cancha: b.field?.nombre,
      nombre_cliente: b.nombre_cliente, telefono: b.confirmacion_tel, turno_fijo: !!b.recurring_id,
      estado_confirmacion: b.estado_confirmacion, confirmacion_limite: b.confirmacion_limite,
    })),
  };
}

// ── Scheduler ────────────────────────────────────────────────────────────────

let timer = null, corriendo = false;
async function tick(now = new Date()) {
  if (corriendo) return;
  corriendo = true;
  try { await cancelarVencidos(now); await enviarPendientes(now); }
  catch (err) { console.error('[confirmación] tick:', err.message); }
  finally { corriendo = false; }
}
/** Revisa cada minuto (envíos a la hora exacta y vencimientos de 3 h). */
function iniciar(segundos = 60) {
  if (timer) return;
  timer = setInterval(tick, segundos * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 20 * 1000);
  console.log('✓ Confirmación de asistencia por WhatsApp activa (revisión cada minuto).');
}

module.exports = {
  MSG_RECORDATORIO, getConfig, setConfig, candidatos, enviarPendientes, enviarRecordatorio,
  confirmar, cancelar, cancelarVencidos, procesarRespuesta, resumen, tick, iniciar,
};
