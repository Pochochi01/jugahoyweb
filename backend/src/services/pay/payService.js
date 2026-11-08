'use strict';
/**
 * services/pay/payService.js — Casos de uso de Jugahoy Pay sobre el motor (payEngine):
 *   liquidarReserva / liquidacionDeReserva   turno: cancha + consumos → un QR por jugador / pareja
 *   ordenCuota                               cuota de escuela → QR + link (vencimiento = día de vencimiento del club)
 *   cuenta corriente: resumenCliente, clientes, cobrarSaldo (Modo 9: cobra todo lo pendiente)
 *   sendPaymentReminder                      recordatorio por email / push con el link de pago
 *   dashboard                                métricas financieras del club
 *   iniciarJobs                              vencimientos + recordatorios de cuotas
 */
const crypto = require('crypto');
const { Op, fn, col, literal } = require('sequelize');
const m = require('../../models');
const engine = require('./payEngine');
const liq = require('./liquidacion');

const { PayOrder, PayAccountMovement, sequelize } = m;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const ACTIVAS = ['pendiente', 'procesando', 'parcial', 'aprobado', 'rechazado'];

const conQr = async (o) => ({ ...vistaAdmin(o), ...(await engine.generatePaymentQR(o)) });
function vistaAdmin(o) {
  const j = o.toJSON ? o.toJSON() : o;
  return {
    id: j.id, token: j.token, modulo: j.modulo, referencia_tipo: j.referencia_tipo, referencia_id: j.referencia_id, grupo: j.grupo,
    cliente_key: j.cliente_key, cliente_nombre: j.cliente_nombre, cliente_dni: j.cliente_dni, cliente_email: j.cliente_email, cliente_telefono: j.cliente_telefono,
    concepto: j.concepto, detalle: j.detalle, importe: Number(j.importe), importe_pagado: Number(j.importe_pagado), saldo: r2(Number(j.importe) - Number(j.importe_pagado)),
    permite_parcial: j.permite_parcial, estado: j.estado, vence_at: j.vence_at, pagado_at: j.pagado_at, metodo: j.metodo,
    creado_por: j.creado_por, createdAt: j.createdAt, metadata: j.metadata,
  };
}

// ── Reservas: liquidación de cancha + consumos ────────────────
async function bookingDelClub(complexId, bookingId, transaction) {
  const b = await m.Booking.findByPk(bookingId, { include: [{ model: m.Field, as: 'field', attributes: ['id', 'nombre', 'complex_id'] }], transaction });
  if (!b || Number(b.field?.complex_id) !== Number(complexId)) throw httpError(404, 'Turno no encontrado');
  return b;
}
const ordenesDeReserva = (complexId, bookingId, transaction) => PayOrder.findAll({
  where: { complex_id: complexId, modulo: 'reserva', referencia_tipo: 'booking', referencia_id: bookingId, estado: ACTIVAS },
  order: [['id', 'ASC']], transaction,
});

/**
 * Previsualiza o genera la liquidación del turno.
 * @param {{ jugadores: Array<{nombre, dni?, email?, telefono?}>, modo, pagador?, porcentajes?, parejas?, asignaciones?, generar?: boolean, venceHoras? }} body
 */
async function liquidarReserva(complexId, bookingId, body = {}, usuario = {}) {
  const b = await bookingDelClub(complexId, bookingId);
  if (b.cobrado) throw httpError(409, 'El turno ya fue cobrado.');
  if (['cancelado', 'rechazado'].includes(b.estado)) throw httpError(409, `El turno está "${b.estado}".`);
  const consumos = await m.BookingConsumo.findAll({ where: { booking_id: b.id }, order: [['id', 'ASC']], raw: true });
  const canchaTotal = Number(b.monto) || 0;
  const pagadoOnline = b.mp_payment_id && b.estado === 'confirmado' ? Math.min(Number(b.monto_pagado) || 0, canchaTotal) : 0;
  const cancha = r2(canchaTotal - pagadoOnline);
  const resultado = liq.mergeReservationAndConsumptions({
    total: cancha, jugadores: body.jugadores, modo: body.modo, pagador: body.pagador, porcentajes: body.porcentajes, parejas: body.parejas,
    consumos: consumos.map(c => ({ id: c.id, nombre: Number(c.cantidad) > 1 ? `${c.nombre_producto} x${Number(c.cantidad)}` : c.nombre_producto, subtotal: c.subtotal })),
    asignaciones: body.asignaciones || {}, conceptoCancha: `Cancha ${b.field?.nombre || ''} ${b.fecha} ${b.hora_inicio}`.replace(/\s+/g, ' ').trim(),
  });
  const vista = { booking: { id: b.id, fecha: b.fecha, hora: b.hora_inicio, cancha: b.field?.nombre, cliente: b.nombre_cliente, monto: canchaTotal, pagado_online: pagadoOnline }, ...resultado, consumos_detalle: consumos };
  if (!body.generar) return vista;
  if (resultado.total <= 0) throw httpError(409, 'No hay importe para cobrar.');

  const grupo = crypto.randomUUID();
  const venceAt = body.venceHoras ? new Date(Date.now() + Number(body.venceHoras) * 3600000) : null;
  const ordenes = await sequelize.transaction(async (t) => {
    const lock = await m.Booking.findByPk(b.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (lock.cobrado) throw httpError(409, 'El turno ya fue cobrado.');
    if ((await ordenesDeReserva(complexId, b.id, t)).length) throw httpError(409, 'El turno ya tiene un cobro Jugahoy Pay en curso: anulalo para generar otro.');
    const out = [];
    for (const p of resultado.pagadores) {
      out.push(await engine.createPaymentOrder({
        complexId, modulo: 'reserva', referencia: { tipo: 'booking', id: b.id }, grupo,
        cliente: { nombre: p.nombre, dni: p.titular?.dni, email: p.titular?.email, telefono: p.titular?.telefono },
        concepto: `Turno ${b.fecha} ${b.hora_inicio} · ${b.field?.nombre || 'cancha'}`, detalle: p.items, importe: p.total,
        venceAt, creadoPor: usuario, metadata: { booking_id: b.id, jugadores: p.jugadores, modo: body.modo }, origen: 'admin',
      }, { transaction: t }));
    }
    return out;
  });
  return { ...vista, grupo, ordenes: await Promise.all(ordenes.map(conQr)) };
}

async function liquidacionDeReserva(complexId, bookingId) {
  await bookingDelClub(complexId, bookingId);
  const ordenes = await ordenesDeReserva(complexId, bookingId);
  return { ordenes: await Promise.all(ordenes.map(conQr)) };
}

// ── Escuelas: cuota → orden ───────────────────────────────────
function vencimientoCuota(periodo, dia) {
  const [y, mes] = String(periodo).split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, mes, 0)).getUTCDate();
  const d = Math.min(Math.max(1, Number(dia) || 10), ultimo);
  return new Date(`${periodo}-${String(d).padStart(2, '0')}T23:59:59-03:00`);
}
/** Escuela y categoría de un alumno (para el vencimiento y el concepto). */
async function escuelaDeAlumno(alumno) {
  const categoria = await m.EscuelaCategoria.findByPk(alumno.categoria_id, { attributes: ['id', 'nombre', 'escuela_id'] });
  const escuela = categoria?.escuela_id ? await m.Escuela.findByPk(categoria.escuela_id, { attributes: ['id', 'nombre', 'dia_vencimiento'] }) : null;
  const config = escuela ? null : await m.EscuelaConfig.findOne({ where: { complex_id: alumno.complex_id }, attributes: ['nombre', 'dia_vencimiento'] });
  return { categoria, escuela, nombre: escuela?.nombre || config?.nombre || 'Escuela', dia: escuela?.dia_vencimiento ?? config?.dia_vencimiento ?? 10 };
}
async function ordenCuota(complexId, pagoId, usuario = {}) {
  const pago = await m.EscuelaPago.findByPk(pagoId);
  const alumno = pago && await m.EscuelaAlumno.findByPk(pago.alumno_id);
  if (!pago || !alumno || Number(alumno.complex_id) !== Number(complexId)) throw httpError(404, 'Cuota no encontrada');
  if (pago.estado === 'pagado') throw httpError(409, 'La cuota ya está pagada.');
  const existente = await PayOrder.findOne({ where: { complex_id: complexId, modulo: 'escuela', referencia_tipo: 'escuela_pago', referencia_id: pago.id, estado: ['pendiente', 'procesando', 'parcial', 'rechazado'] } });
  if (existente) return conQr(existente);
  const { categoria, escuela, nombre: nombreEscuela, dia } = await escuelaDeAlumno(alumno);
  const orden = await engine.createPaymentOrder({
    complexId, modulo: 'escuela', referencia: { tipo: 'escuela_pago', id: pago.id },
    cliente: { nombre: alumno.nombre, dni: alumno.dni, email: alumno.responsable_email, telefono: alumno.responsable_whatsapp },
    concepto: `Cuota ${pago.periodo} · ${nombreEscuela}${categoria ? ` · ${categoria.nombre}` : ''}`,
    importe: Number(pago.monto), venceAt: null, creadoPor: usuario, origen: 'admin',
    metadata: { escuela_id: escuela?.id || null, categoria_id: categoria?.id || null, alumno_id: alumno.id, periodo: pago.periodo, vencimiento: vencimientoCuota(pago.periodo, dia) },
  });
  return conQr(orden);
}

// ── Cuenta corriente ──────────────────────────────────────────
async function resumenCliente(complexId, clienteKey) {
  const [movs, totales, pendientes] = await Promise.all([
    PayAccountMovement.findAll({ where: { complex_id: complexId, cliente_key: clienteKey }, order: [['id', 'DESC']], limit: 100, raw: true }),
    PayAccountMovement.findOne({ where: { complex_id: complexId, cliente_key: clienteKey }, attributes: [[fn('SUM', col('importe')), 'saldo'], [fn('MAX', col('cliente_nombre')), 'nombre']], raw: true }),
    PayOrder.findAll({ where: { complex_id: complexId, cliente_key: clienteKey, estado: ['pendiente', 'parcial', 'rechazado', 'vencido', 'procesando'] }, order: [['id', 'ASC']] }),
  ]);
  const saldo = r2(totales?.saldo || 0);
  return {
    cliente_key: clienteKey, nombre: totales?.nombre || null,
    saldo_actual: saldo > 0 ? 0 : r2(-saldo),           // a favor
    deuda_total: saldo > 0 ? saldo : 0,
    saldo_pendiente: r2(pendientes.reduce((a, o) => a + Number(o.importe) - Number(o.importe_pagado), 0)),
    pendientes: pendientes.map(vistaAdmin), movimientos: movs.map(x => ({ ...x, importe: Number(x.importe) })),
  };
}

async function clientes(complexId, { q, conDeuda, limit = 50 } = {}) {
  const where = { complex_id: complexId };
  if (q) where[Op.or] = [{ cliente_nombre: { [Op.like]: `%${q}%` } }, { cliente_key: { [Op.like]: `%${String(q).replace(/\D/g, '') || q}%` } }];
  const filas = await PayAccountMovement.findAll({
    where, attributes: ['cliente_key', [fn('MAX', col('cliente_nombre')), 'nombre'], [fn('SUM', col('importe')), 'saldo'], [fn('MAX', col('created_at')), 'ultimo']],
    group: ['cliente_key'], ...(conDeuda && { having: literal('SUM(importe) > 0.009') }),
    order: [[literal('saldo'), 'DESC']], limit: Math.min(200, Number(limit) || 50), raw: true,
  });
  return filas.map(f => ({ ...f, saldo: r2(f.saldo) }));
}

/** Modo 9: una orden por TODO lo pendiente del cliente; al pagarla se cancelan las órdenes incluidas. */
async function cobrarSaldo(complexId, clienteKey, usuario = {}) {
  const pendientes = await PayOrder.findAll({ where: { complex_id: complexId, cliente_key: clienteKey, estado: ['pendiente', 'parcial', 'rechazado', 'vencido'] }, order: [['id', 'ASC']] });
  const items = pendientes.map(o => ({ concepto: o.concepto, importe: r2(Number(o.importe) - Number(o.importe_pagado)) })).filter(x => x.importe > 0);
  if (!items.length) throw httpError(409, 'El cliente no tiene saldo pendiente.');
  const p0 = pendientes[0];
  const orden = await engine.createPaymentOrder({
    complexId, modulo: 'cuenta', cliente: { nombre: p0.cliente_nombre, dni: p0.cliente_dni, email: p0.cliente_email, telefono: p0.cliente_telefono },
    concepto: `Saldo pendiente · ${items.length} concepto(s)`, detalle: items, importe: r2(items.reduce((a, x) => a + x.importe, 0)),
    creadoPor: usuario, metadata: { ordenes: pendientes.map(o => o.id) }, cargoEnCuenta: false, origen: 'admin',
  });
  if (orden.cliente_key !== clienteKey) await orden.update({ cliente_key: clienteKey });
  return conQr(orden);
}

// ── Recordatorios ─────────────────────────────────────────────
async function sendPaymentReminder(orden) {
  const { url } = await engine.generatePaymentQR(orden);
  const club = await m.Complex.findByPk(orden.complex_id, { attributes: ['nombre'], raw: true });
  const saldo = r2(Number(orden.importe) - Number(orden.importe_pagado));
  const vence = orden.metadata?.vencimiento || orden.vence_at;
  const texto = `Hola ${orden.cliente_nombre || ''}. Tenés pendiente ${orden.concepto} por $${saldo.toLocaleString('es-AR')}${vence ? ` (vence el ${new Date(vence).toLocaleDateString('es-AR')})` : ''}. Pagalo online acá: ${url}`;
  const canales = [];
  if (orden.cliente_email) {
    const { sendMail } = require('../../config/mailer');
    await sendMail({ to: orden.cliente_email, subject: `${club?.nombre || 'JugaHoy'} · ${orden.concepto}`, html: `<p>${texto.replace(url, `<a href="${url}">${url}</a>`)}</p>` });
    canales.push('email');
  }
  if (orden.cliente_dni) {
    await require('../notifications/NotificationService').sendPush({ dni: orden.cliente_dni, nombre: orden.cliente_nombre, titulo: '💳 Pago pendiente', mensaje: texto.replace(`Pagalo online acá: ${url}`, 'Tocá para pagar.'), url: `/pay/${orden.token}`, dedupe: `pay:${orden.token}:rec:${new Date().toISOString().slice(0, 10)}` }).catch(() => {});
    canales.push('push');
  }
  const meta = { ...(orden.metadata || {}), recordatorios: [...(orden.metadata?.recordatorios || []), { at: new Date(), canales }] };
  await orden.update({ metadata: meta });
  // WhatsApp: el link queda listo para compartir desde el panel (los módulos usan el WhatsApp del dispositivo)
  return { canales, texto, url, whatsapp: orden.cliente_telefono ? `https://wa.me/${orden.cliente_telefono}?text=${encodeURIComponent(texto)}` : null };
}

/** Cuotas pendientes que vencen en los próximos 3 días: genera la orden (si no existe) y avisa una vez. */
async function recordatoriosCuotas(ahora = new Date()) {
  const periodo = ahora.toISOString().slice(0, 7);
  const cuotas = await m.EscuelaPago.findAll({ where: { estado: 'pendiente', periodo: { [Op.lte]: periodo } }, limit: 1000 });
  let enviados = 0;
  for (const c of cuotas) {
    try {
      const alumno = await m.EscuelaAlumno.findByPk(c.alumno_id, { attributes: ['id', 'complex_id', 'estado', 'categoria_id', 'responsable_email'] });
      if (!alumno || alumno.estado !== 'activo') continue;
      const { dia } = await escuelaDeAlumno(alumno);
      const vence = vencimientoCuota(c.periodo, dia);
      const dias = (vence - ahora) / 86400000;
      if (dias > 3 || dias < -1) continue;   // ventana: 3 días antes hasta 1 día después
      const o = await ordenCuota(alumno.complex_id, c.id, { nombre: 'Recordatorio automático' });
      const orden = await PayOrder.findByPk(o.id);
      if ((orden.metadata?.recordatorios || []).length) continue;
      await sendPaymentReminder(orden);
      enviados++;
    } catch (err) { console.error('[pay] recordatorio cuota', c.id, err.message); }
  }
  return enviados;
}

// ── Dashboard financiero ──────────────────────────────────────
async function dashboard(complexId, { desde, hasta } = {}) {
  const ahora = new Date();
  const ini = desde ? new Date(`${desde}T00:00:00-03:00`) : new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const fin = hasta ? new Date(`${hasta}T23:59:59-03:00`) : ahora;
  const hoy0 = new Date(`${ahora.toISOString().slice(0, 10)}T00:00:00-03:00`);
  const q = (sql, rep = {}) => sequelize.query(sql, { replacements: { club: complexId, ini, fin, hoy0, ...rep }, type: sequelize.QueryTypes.SELECT });
  const [[hoy], porModulo, mensual, [anual], [pendiente], [conversion], porEscuela, porTorneo, deudores, topClientes, [deuda]] = await Promise.all([
    q(`SELECT COALESCE(SUM(importe_pagado),0) total, COUNT(*) n FROM pay_orders WHERE complex_id=:club AND estado IN ('aprobado','parcial') AND pagado_at >= :hoy0`),
    q(`SELECT modulo, COALESCE(SUM(importe_pagado),0) total, COUNT(*) n FROM pay_orders WHERE complex_id=:club AND importe_pagado > 0 AND updated_at BETWEEN :ini AND :fin GROUP BY modulo ORDER BY total DESC`),
    q(`SELECT DATE_FORMAT(pagado_at,'%Y-%m') mes, COALESCE(SUM(importe_pagado),0) total FROM pay_orders WHERE complex_id=:club AND estado='aprobado' AND pagado_at >= DATE_SUB(:fin, INTERVAL 12 MONTH) GROUP BY mes ORDER BY mes`),
    q(`SELECT COALESCE(SUM(importe_pagado),0) total FROM pay_orders WHERE complex_id=:club AND estado IN ('aprobado','parcial') AND YEAR(pagado_at) = YEAR(:fin)`),
    q(`SELECT COALESCE(SUM(importe - importe_pagado),0) total, COUNT(*) n FROM pay_orders WHERE complex_id=:club AND estado IN ('pendiente','procesando','parcial','rechazado','vencido')`),
    q(`SELECT COUNT(*) creadas, SUM(estado='aprobado') aprobadas, AVG(CASE WHEN estado='aprobado' THEN TIMESTAMPDIFF(SECOND, created_at, pagado_at) END) seg FROM pay_orders WHERE complex_id=:club AND estado <> 'cancelado' AND created_at BETWEEN :ini AND :fin`),
    q(`SELECT JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.escuela_id')) escuela_id, e.nombre, COALESCE(SUM(o.importe_pagado),0) total FROM pay_orders o LEFT JOIN escuelas e ON e.id = JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.escuela_id')) WHERE o.complex_id=:club AND o.modulo='escuela' AND o.importe_pagado > 0 AND o.updated_at BETWEEN :ini AND :fin GROUP BY escuela_id, e.nombre`).catch(() => []),
    q(`SELECT JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.torneo_id')) torneo_id, t.nombre, COALESCE(SUM(o.importe_pagado),0) total FROM pay_orders o LEFT JOIN torneos t ON t.id = JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.torneo_id')) WHERE o.complex_id=:club AND o.modulo='torneo' AND o.importe_pagado > 0 AND o.updated_at BETWEEN :ini AND :fin GROUP BY torneo_id, t.nombre`).catch(() => []),
    clientes(complexId, { conDeuda: true, limit: 10 }),
    q(`SELECT cliente_key, MAX(cliente_nombre) nombre, SUM(importe_pagado) total, COUNT(*) n FROM pay_orders WHERE complex_id=:club AND importe_pagado > 0 AND cliente_key IS NOT NULL AND updated_at BETWEEN :ini AND :fin GROUP BY cliente_key ORDER BY total DESC LIMIT 10`),
    q(`SELECT COALESCE(SUM(s),0) total FROM (SELECT SUM(importe) s FROM pay_account_movements WHERE complex_id=:club GROUP BY cliente_key HAVING SUM(importe) > 0.009) x`),
  ]);
  const n = (v) => r2(v || 0);
  const modulo = (k) => n(porModulo.find(r => r.modulo === k)?.total);
  return {
    periodo: { desde: ini, hasta: fin },
    cobros_hoy: n(hoy.total), cobros_hoy_cantidad: Number(hoy.n) || 0,
    por_modulo: porModulo.map(r => ({ modulo: r.modulo, total: n(r.total), cantidad: Number(r.n) })),
    reservas: modulo('reserva'), cantina: r2(modulo('cantina') + modulo('buffet')), escuelas: modulo('escuela'), torneos: modulo('torneo'),
    por_escuela: porEscuela.map(r => ({ escuela_id: r.escuela_id, nombre: r.nombre || 'Escuela', total: n(r.total) })),
    por_torneo: porTorneo.map(r => ({ torneo_id: r.torneo_id, nombre: r.nombre || 'Torneo', total: n(r.total) })),
    facturacion_mensual: mensual.map(r => ({ mes: r.mes, total: n(r.total) })), facturacion_anual: n(anual.total),
    saldo_pendiente: n(pendiente.total), ordenes_pendientes: Number(pendiente.n) || 0, deuda_total: n(deuda.total),
    conversion_qr: conversion.creadas ? Math.round((Number(conversion.aprobadas) / Number(conversion.creadas)) * 1000) / 10 : 0,
    tiempo_promedio_pago_min: conversion.seg ? Math.round(Number(conversion.seg) / 6) / 10 : null,
    top_deudores: deudores, top_clientes: topClientes.map(r => ({ ...r, total: n(r.total) })),
  };
}

// ── Jobs ──────────────────────────────────────────────────────
let timers = [];
function iniciarJobs() {
  if (process.env.PAY_JOBS === '0') return;
  const correr = (nombre, fn, seg) => {
    const run = () => fn().then(n => n && console.log(`[pay] ${nombre}: ${n}`)).catch(err => console.error(`[pay] ${nombre}:`, err.message));
    setTimeout(run, 20000).unref?.();
    timers.push(setInterval(run, seg * 1000).unref?.());
  };
  correr('vencimientos', engine.expirarVencidas, 10 * 60);
  correr('recordatorios de cuotas', recordatoriosCuotas, 6 * 3600);
  console.log('✓ Jugahoy Pay: jobs iniciados');
}
const detenerJobs = () => { timers.forEach(clearInterval); timers = []; };

module.exports = {
  vistaAdmin, conQr, liquidarReserva, liquidacionDeReserva, ordenCuota, vencimientoCuota,
  resumenCliente, clientes, cobrarSaldo, sendPaymentReminder, recordatoriosCuotas, dashboard, iniciarJobs, detenerJobs,
  splitReservationPayment: liq.splitReservationPayment, calculateConsumptionDistribution: liq.calculateConsumptionDistribution,
  mergeReservationAndConsumptions: liq.mergeReservationAndConsumptions,
};
