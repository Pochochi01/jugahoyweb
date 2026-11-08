'use strict';
/**
 * routes/pay.js — Jugahoy Pay (montado en /api/pay).
 *
 * Público (página /pay/:token y kiosco):
 *   GET  /public/:token              datos de la orden (club, concepto, importe, detalle, estado)
 *   GET  /public/:token/qr           QR PNG de la URL de pago
 *   POST /public/:token/checkout     { monto? } → link de Checkout Pro (pago parcial si la orden lo permite)
 *   GET  /public/:token/events       SSE: cambios de estado en tiempo real
 *
 * Club (/club/:complexId · usuario del club con permiso):
 *   POST /ordenes                         cobro genérico / portería / autopago { modulo, concepto, importe, detalle?, cliente?, … }
 *   GET  /ordenes?estado&modulo&q&page    listado · GET /ordenes/:id (con pagos y auditoría)
 *   POST /ordenes/:id/confirmar           cobro manual { metodo, monto? } · POST /ordenes/:id/cancelar · POST /ordenes/:id/reembolsar
 *   POST /ordenes/:id/recordatorio        email / push + link de WhatsApp
 *   POST /reservas/:bookingId/liquidacion { jugadores, modo, …, generar } · GET /reservas/:bookingId/liquidacion
 *   POST /escuela/cuotas/:pagoId/orden
 *   GET  /cuenta?q&deuda=1 · GET /cuenta/:clienteKey · POST /cuenta/:clienteKey/cobrar-saldo
 *   GET  /dashboard?desde&hasta · GET /events?access_token= (SSE del club)
 */
const router = require('express').Router();
const engine = require('../services/pay/payEngine');
const svc = require('../services/pay/payService');
const { PayOrder, PayPayment, PayEvent } = require('../models');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requireAnyPermission } = require('../middlewares/roles');

const send = (res, err) => {
  if (!err.status) console.error('[pay]', err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Error interno', ...(err.code && { code: err.code }) });
};
const usuario = (req) => (req.user ? { id: req.user.id, nombre: `${req.user.nombre} ${req.user.apellido || ''}`.trim() } : {});

// Rate limiting simple por IP para lo público (sin dependencias)
function limitar(max, ventanaMs) {
  const hits = new Map();
  return (req, res, next) => {
    const k = `${req.ip}|${req.baseUrl}${req.route?.path || ''}`;
    const ahora = Date.now();
    const h = hits.get(k);
    if (!h || ahora - h.t > ventanaMs) hits.set(k, { t: ahora, n: 1 });
    else if (++h.n > max) return res.status(429).json({ message: 'Demasiados intentos. Probá en un momento.' });
    if (hits.size > 5000) for (const [key, v] of hits) if (ahora - v.t > ventanaMs) hits.delete(key);
    next();
  };
}

/** Server-Sent Events: suscribe al bus del motor y mantiene la conexión viva. */
function sse(req, res, canal, inicial) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const enviar = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (inicial) enviar(inicial);
  engine.bus.on(canal, enviar);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); engine.bus.off(canal, enviar); });
}

// ── Público ───────────────────────────────────────────────────
router.get('/public/:token', limitar(120, 60000), async (req, res) => {
  try { res.json(await engine.vistaPublica(req.params.token)); } catch (e) { send(res, e); }
});
router.get('/public/:token/qr', limitar(60, 60000), async (req, res) => {
  try {
    const o = await engine.porToken(req.params.token);
    const { qr } = await engine.generatePaymentQR(o, { ancho: Math.min(1200, Number(req.query.w) || 600) });
    res.set('Cache-Control', 'public, max-age=3600').type('png').send(Buffer.from(qr.split(',')[1], 'base64'));
  } catch (e) { send(res, e); }
});
router.post('/public/:token/checkout', limitar(10, 60000), async (req, res) => {
  try { res.json(await engine.iniciarCheckout(req.params.token, { monto: req.body?.monto })); } catch (e) { send(res, e); }
});
router.get('/public/:token/events', limitar(30, 60000), async (req, res) => {
  try {
    const o = await engine.porToken(req.params.token);
    sse(req, res, `orden:${o.token}`, { token: o.token, estado: o.estado, importe: Number(o.importe), importe_pagado: Number(o.importe_pagado) });
  } catch (e) { send(res, e); }
});

// ── Club ──────────────────────────────────────────────────────
const club = require('express').Router({ mergeParams: true });
// EventSource no manda headers: el SSE del club acepta ?access_token=
const tokenDeQuery = (req, res, next) => { if (!req.headers.authorization && req.query.access_token) req.headers.authorization = `Bearer ${req.query.access_token}`; next(); };
router.use('/club/:complexId', tokenDeQuery, authenticate, requireComplexAccess, club);

const caja = requireAnyPermission('caja');
const cobra = requireAnyPermission('caja', 'cantina_ventas', 'agenda', 'escuela');
const ordenDelClub = async (req) => {
  const o = await PayOrder.findOne({ where: { id: Number(req.params.id), complex_id: Number(req.params.complexId) } });
  if (!o) throw Object.assign(new Error('Orden no encontrada'), { status: 404 });
  return o;
};

club.post('/ordenes', requireAnyPermission('caja', 'cantina_ventas'), async (req, res) => {
  try {
    const b = req.body || {};
    const o = await engine.createPaymentOrder({
      complexId: Number(req.params.complexId), modulo: b.modulo || 'porteria', concepto: b.concepto, importe: b.importe, detalle: b.detalle,
      cliente: b.cliente, permiteParcial: Boolean(b.permite_parcial), venceAt: b.vence_at || (b.vence_minutos ? new Date(Date.now() + Number(b.vence_minutos) * 60000) : null),
      referencia: b.referencia, metadata: b.metadata, creadoPor: usuario(req), cargoEnCuenta: b.cargo_en_cuenta !== false && Boolean(b.cliente?.nombre || b.cliente?.dni), origen: 'admin',
    });
    res.status(201).json(await svc.conQr(o));
  } catch (e) { send(res, e); }
});
club.get('/ordenes', cobra, async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const limit = Math.min(100, Number(req.query.limit) || 30), page = Math.max(1, Number(req.query.page) || 1);
    const where = { complex_id: Number(req.params.complexId) };
    if (req.query.estado) where.estado = String(req.query.estado).split(',');
    if (req.query.modulo) where.modulo = String(req.query.modulo);
    if (req.query.grupo) where.grupo = String(req.query.grupo);
    if (req.query.q) where[Op.or] = [{ cliente_nombre: { [Op.like]: `%${req.query.q}%` } }, { concepto: { [Op.like]: `%${req.query.q}%` } }, { token: { [Op.like]: `${req.query.q}%` } }];
    const { rows, count } = await PayOrder.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset: (page - 1) * limit });
    res.json({ items: rows.map(svc.vistaAdmin), total: count, page, limit });
  } catch (e) { send(res, e); }
});
club.get('/ordenes/:id', cobra, async (req, res) => {
  try {
    const o = await ordenDelClub(req);
    const [pagos, eventos] = await Promise.all([PayPayment.findAll({ where: { order_id: o.id }, order: [['id', 'ASC']], attributes: { exclude: ['raw'] } }), PayEvent.findAll({ where: { order_id: o.id }, order: [['id', 'ASC']] })]);
    res.json({ ...(await svc.conQr(o)), pagos, eventos });
  } catch (e) { send(res, e); }
});
club.post('/ordenes/:id/confirmar', cobra, async (req, res) => {
  try { const r = await engine.confirmPayment(await ordenDelClub(req), { metodo: req.body?.metodo, monto: req.body?.monto, usuario: usuario(req).nombre }); res.json(svc.vistaAdmin(r.orden)); } catch (e) { send(res, e); }
});
club.post('/ordenes/:id/cancelar', cobra, async (req, res) => {
  try { res.json(svc.vistaAdmin(await engine.cancelPayment(await ordenDelClub(req), { usuario: usuario(req).nombre, motivo: req.body?.motivo }))); } catch (e) { send(res, e); }
});
club.post('/ordenes/:id/reembolsar', caja, async (req, res) => {
  try { res.json(svc.vistaAdmin(await engine.refundPayment(await ordenDelClub(req), { usuario: usuario(req).nombre }))); } catch (e) { send(res, e); }
});
club.post('/ordenes/:id/recordatorio', cobra, async (req, res) => {
  try { res.json(await svc.sendPaymentReminder(await ordenDelClub(req))); } catch (e) { send(res, e); }
});

club.post('/reservas/:bookingId/liquidacion', requireAnyPermission('agenda', 'caja'), async (req, res) => {
  try { res.json(await svc.liquidarReserva(Number(req.params.complexId), Number(req.params.bookingId), req.body || {}, usuario(req))); } catch (e) { send(res, e); }
});
club.get('/reservas/:bookingId/liquidacion', requireAnyPermission('agenda', 'caja'), async (req, res) => {
  try { res.json(await svc.liquidacionDeReserva(Number(req.params.complexId), Number(req.params.bookingId))); } catch (e) { send(res, e); }
});
club.post('/escuela/cuotas/:pagoId/orden', requireAnyPermission('escuela', 'caja'), async (req, res) => {
  try { res.status(201).json(await svc.ordenCuota(Number(req.params.complexId), Number(req.params.pagoId), usuario(req))); } catch (e) { send(res, e); }
});

club.get('/cuenta', caja, async (req, res) => {
  try { res.json(await svc.clientes(Number(req.params.complexId), { q: req.query.q, conDeuda: req.query.deuda === '1', limit: req.query.limit })); } catch (e) { send(res, e); }
});
club.get('/cuenta/:clienteKey', caja, async (req, res) => {
  try { res.json(await svc.resumenCliente(Number(req.params.complexId), String(req.params.clienteKey))); } catch (e) { send(res, e); }
});
club.post('/cuenta/:clienteKey/cobrar-saldo', caja, async (req, res) => {
  try { res.status(201).json(await svc.cobrarSaldo(Number(req.params.complexId), String(req.params.clienteKey), usuario(req))); } catch (e) { send(res, e); }
});
club.get('/dashboard', caja, async (req, res) => {
  try { res.json(await svc.dashboard(Number(req.params.complexId), req.query)); } catch (e) { send(res, e); }
});
club.get('/events', cobra, (req, res) => sse(req, res, `club:${Number(req.params.complexId)}`, { conectado: true }));

module.exports = router;
