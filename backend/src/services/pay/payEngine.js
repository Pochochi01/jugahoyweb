'use strict';
/**
 * services/pay/payEngine.js — Jugahoy Pay: motor único de cobros (multiclub).
 *
 * API interna (la usan TODOS los módulos):
 *   createPaymentOrder(datos)          orden + token UUID v4 + URL /pay/:token (+ cargo en cuenta corriente)
 *   generatePaymentQR(orden)           QR (PNG data URL) que apunta a la URL pública
 *   iniciarCheckout(token, { monto })  link de pago del proveedor (Checkout Pro); admite pago parcial
 *   procesarPagoProveedor(...)         webhook / sync: consulta el pago al proveedor (fuente de verdad) y confirma
 *   confirmPayment(orden, { metodo })  cobro manual (efectivo, transferencia…) desde portería / panel
 *   cancelPayment(orden)               anula una orden sin pagos
 *   refundPayment(orden)               reembolso (total) en el proveedor + caja + cuenta corriente
 *   expirarVencidas()                  job: órdenes vencidas
 *
 * Garantías: transacción con lock de la orden por cada confirmación, pago del proveedor con id
 * ÚNICO (un webhook repetido no cobra dos veces), auditoría de cada cambio (pay_events) y evento en
 * tiempo real (bus → SSE) al terminar.
 */
const crypto = require('crypto');
const { EventEmitter } = require('events');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const m = require('../../models');
const { proveedor } = require('./providers');
const { handlerDe, ingresoCaja, egresoCaja } = require('./handlers');
const { frontendUrl } = require('../../config/urls');

const { PayOrder, PayPayment, PayEvent, PayAccountMovement, sequelize } = m;
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const MODULO_OK = /^[a-z_]{2,30}$/;
const ESTADOS_COBRABLES = ['pendiente', 'parcial', 'rechazado', 'procesando'];

// ── Tiempo real: bus de eventos (SSE en routes/pay.js) ────────
const bus = new EventEmitter();
bus.setMaxListeners(0);
const emitir = (orden) => {
  const ev = { token: orden.token, id: orden.id, complex_id: orden.complex_id, estado: orden.estado, importe: Number(orden.importe), importe_pagado: Number(orden.importe_pagado), pagado_at: orden.pagado_at, grupo: orden.grupo };
  bus.emit(`orden:${orden.token}`, ev);
  bus.emit(`club:${orden.complex_id}`, ev);
};

// ── Cliente / cuenta corriente ────────────────────────────────
/** Identidad del cliente para la cuenta corriente: DNI → teléfono → usuario → nombre. */
function clienteKey(c = {}) {
  const dni = String(c.dni || '').replace(/\D/g, '');
  if (dni.length >= 6) return `dni:${dni}`;
  const tel = String(c.telefono || '').replace(/\D/g, '');
  if (tel.length >= 8) return `tel:${tel.slice(-10)}`;
  if (c.userId) return `user:${Number(c.userId)}`;
  const nom = String(c.nombre || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return nom ? `nom:${nom.slice(0, 70)}` : null;
}
async function movimiento(orden, tipo, importe, concepto, { transaction, usuario } = {}) {
  if (!orden.cliente_key || !Number(importe)) return null;
  return PayAccountMovement.create({
    complex_id: orden.complex_id, cliente_key: orden.cliente_key, cliente_nombre: orden.cliente_nombre, tipo,
    importe: r2(importe), concepto: String(concepto).slice(0, 200), modulo: orden.modulo, order_id: orden.id, usuario: usuario || null,
  }, { transaction });
}
const evento = (orden, tipo, { anterior, origen, usuario, datos, transaction } = {}) => PayEvent.create({
  order_id: orden.id, tipo, estado_anterior: anterior ?? null, estado_nuevo: orden.estado, origen: origen || null, usuario: usuario || null, datos: datos || null,
}, { transaction });

// ── Órdenes ───────────────────────────────────────────────────
/**
 * @param {{ complexId, modulo, referencia?: {tipo, id}, grupo?, cliente?: {nombre, dni, email, telefono, userId},
 *           concepto, detalle?: Array<{concepto, importe, tipo?}>, importe, permiteParcial?, venceAt?, creadoPor?: {id, nombre},
 *           metadata?, cargoEnCuenta?: boolean, origen? }} d
 * @returns {Promise<PayOrder>}
 */
async function createPaymentOrder(d, { transaction } = {}) {
  const importe = r2(d.importe);
  if (!d.complexId) throw httpError(400, 'Falta el club.');
  if (!MODULO_OK.test(String(d.modulo || ''))) throw httpError(400, 'Módulo de origen inválido.');
  if (!String(d.concepto || '').trim()) throw httpError(400, 'Indicá el concepto.');
  if (!Number.isFinite(importe) || importe <= 0) throw httpError(400, 'El importe debe ser mayor a 0.');
  if (importe > 99999999) throw httpError(400, 'Importe fuera de rango.');
  const detalle = (d.detalle?.length ? d.detalle : [{ concepto: d.concepto, importe }]).map(x => ({ concepto: String(x.concepto).slice(0, 150), importe: r2(x.importe), tipo: x.tipo || null }));
  if (Math.abs(detalle.reduce((a, x) => a + x.importe, 0) - importe) > 0.009) throw httpError(400, 'El detalle no suma el importe total.');
  const venceAt = d.venceAt ? new Date(d.venceAt) : null;
  if (venceAt && Number.isNaN(venceAt.getTime())) throw httpError(400, 'Vencimiento inválido.');
  const c = d.cliente || {};
  const crear = async (t) => {
    const orden = await PayOrder.create({
      token: crypto.randomUUID(), complex_id: Number(d.complexId), modulo: d.modulo,
      referencia_tipo: d.referencia?.tipo || null, referencia_id: d.referencia?.id || null, grupo: d.grupo || null,
      cliente_key: clienteKey(c), cliente_nombre: c.nombre?.trim() || null, cliente_dni: String(c.dni || '').replace(/\D/g, '') || null,
      cliente_email: c.email?.trim() || null, cliente_telefono: c.telefono ? String(c.telefono).replace(/\D/g, '') : null,
      concepto: String(d.concepto).trim().slice(0, 200), detalle, importe, permite_parcial: Boolean(d.permiteParcial), vence_at: venceAt,
      creado_por_id: d.creadoPor?.id || null, creado_por: d.creadoPor?.nombre || null, metadata: d.metadata || null,
    }, { transaction: t });
    await evento(orden, 'creada', { origen: d.origen || 'api', usuario: d.creadoPor?.nombre, datos: { importe, modulo: d.modulo }, transaction: t });
    if (d.cargoEnCuenta !== false) await movimiento(orden, 'cargo', importe, orden.concepto, { transaction: t, usuario: d.creadoPor?.nombre });
    return orden;
  };
  return transaction ? crear(transaction) : sequelize.transaction(crear);
}

const urlPago = (orden) => frontendUrl(`/pay/${orden.token}`);
/** QR + URL pública de la orden. */
async function generatePaymentQR(orden, { ancho = 480 } = {}) {
  const url = urlPago(orden);
  const qr = await QRCode.toDataURL(url, { width: ancho, margin: 1, errorCorrectionLevel: 'M' });
  return { url, qr };
}

async function porToken(token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) throw httpError(404, 'Orden no encontrada');
  const o = await PayOrder.findOne({ where: { token } });
  if (!o) throw httpError(404, 'Orden no encontrada');
  return o;
}
const saldo = (o) => r2(Number(o.importe) - Number(o.importe_pagado));
const vencida = (o) => o.vence_at && new Date(o.vence_at) < new Date() && ['pendiente', 'parcial', 'rechazado'].includes(o.estado);

/** Datos públicos de la orden (página /pay/:token): sin datos personales más allá del nombre. */
async function vistaPublica(token) {
  const o = await porToken(token);
  if (vencida(o)) await marcarVencida(o);
  const club = await m.Complex.findByPk(o.complex_id, { attributes: ['id', 'nombre', 'logo_url', 'direccion', 'ciudad'], raw: true });
  const mpOAuth = require('../mercadopagoOAuth.service');
  return {
    token: o.token, estado: o.estado, concepto: o.concepto, detalle: o.detalle, moneda: o.moneda,
    importe: Number(o.importe), importe_pagado: Number(o.importe_pagado), saldo: saldo(o), permite_parcial: o.permite_parcial,
    cliente: o.cliente_nombre, vence_at: o.vence_at, pagado_at: o.pagado_at, modulo: o.modulo, club,
    puede_pagar: ESTADOS_COBRABLES.includes(o.estado) && saldo(o) > 0 && await mpOAuth.puedeCobrar(o.complex_id).catch(() => false),
  };
}

/** Link de pago del proveedor. Pago parcial solo si la orden lo permite. */
async function iniciarCheckout(token, { monto } = {}) {
  const o = await porToken(token);
  if (vencida(o)) { await marcarVencida(o); throw httpError(409, 'La orden está vencida.'); }
  if (!ESTADOS_COBRABLES.includes(o.estado)) throw httpError(409, `La orden está ${o.estado}.`);
  const resta = saldo(o);
  if (resta <= 0) throw httpError(409, 'La orden ya está paga.');
  let importe = resta;
  if (monto != null && monto !== '') {
    importe = r2(monto);
    if (!o.permite_parcial && importe !== resta) throw httpError(400, 'Esta orden no admite pagos parciales.');
    if (!Number.isFinite(importe) || importe <= 0 || importe > resta) throw httpError(400, `El monto debe estar entre $1 y $${resta}.`);
  }
  const { checkoutId, url } = await proveedor(o.provider).crearCheckout(o, { monto: importe });
  const anterior = o.estado;
  await o.update({ provider_checkout_id: checkoutId, provider_checkout_url: url, ...(o.estado === 'rechazado' && { estado: 'pendiente' }) });
  await evento(o, 'checkout', { anterior, origen: 'publico', datos: { monto: importe, checkout_id: checkoutId } });
  return { url, monto: importe };
}

/**
 * Aplica un pago a la orden (núcleo transaccional). Idempotente por (provider, provider_payment_id).
 * @param {PayOrder} ordenRef
 * @param {{ provider, id, estado: 'approved'|'pending'|'rejected'|'cancelled'|'refunded', monto, metodo?, cuotas?, aprobadoAt?, raw? }} pago
 */
async function aplicarPago(ordenRef, pago, { origen, usuario } = {}) {
  let cambio = false;
  let resultado;
  await sequelize.transaction(async (t) => {
    const o = await PayOrder.findByPk(ordenRef.id, { transaction: t, lock: t.LOCK.UPDATE });
    const previo = await PayPayment.findOne({ where: { provider: pago.provider, provider_payment_id: String(pago.id) }, transaction: t, lock: t.LOCK.UPDATE });
    if (previo && previo.estado === pago.estado) { resultado = { orden: o, duplicado: true }; return; }   // webhook repetido
    const anteriorPago = previo?.estado || null;
    const reg = previo
      ? await previo.update({ estado: pago.estado, raw: pago.raw || previo.raw, aprobado_at: pago.aprobadoAt || previo.aprobado_at }, { transaction: t })
      : await PayPayment.create({ order_id: o.id, provider: pago.provider, provider_payment_id: String(pago.id), estado: pago.estado, monto: r2(pago.monto), metodo: pago.metodo || null, cuotas: pago.cuotas || null, aprobado_at: pago.aprobadoAt || null, raw: pago.raw || null }, { transaction: t });
    const anterior = o.estado;
    const metodo = pago.provider === 'manual' ? (pago.metodo || 'efectivo') : 'mercadopago';
    if (pago.estado === 'approved' && anteriorPago !== 'approved') {
      if (['cancelado', 'reembolsado'].includes(o.estado)) throw httpError(409, `La orden está ${o.estado}: el pago debe reembolsarse.`);
      const pagado = r2(Number(o.importe_pagado) + Number(reg.monto));
      const completo = pagado >= Number(o.importe) - 0.009;
      await o.update({ importe_pagado: pagado, estado: completo ? 'aprobado' : 'parcial', pagado_at: completo ? (pago.aprobadoAt || new Date()) : o.pagado_at, metodo }, { transaction: t });
      await evento(o, completo ? 'pago_aprobado' : 'pago_parcial', { anterior, origen, usuario, datos: { pago: reg.provider_payment_id, monto: Number(reg.monto), metodo: pago.metodo }, transaction: t });
      await movimiento(o, 'pago', -Number(reg.monto), `Pago ${o.concepto}`, { transaction: t, usuario });
      const h = handlerDe(o.modulo);
      const ctx = { transaction: t, metodo, origen, usuario };
      if (h.onAprobado) await h.onAprobado(o, reg, ctx);
      else await ingresoCaja(o, Number(reg.monto), ctx);
      cambio = true;
    } else if (pago.estado === 'pending' && ['pendiente', 'rechazado'].includes(o.estado)) {
      await o.update({ estado: 'procesando' }, { transaction: t });
      await evento(o, 'pago_pendiente', { anterior, origen, datos: { pago: reg.provider_payment_id, metodo: pago.metodo }, transaction: t });
      cambio = true;
    } else if (['rejected', 'cancelled'].includes(pago.estado) && ['pendiente', 'procesando'].includes(o.estado)) {
      await o.update({ estado: Number(o.importe_pagado) > 0 ? 'parcial' : 'rechazado' }, { transaction: t });
      await evento(o, 'pago_rechazado', { anterior, origen, datos: { pago: reg.provider_payment_id, detalle: pago.raw?.status_detail }, transaction: t });
      cambio = true;
    } else if (pago.estado === 'refunded' && anteriorPago === 'approved') {
      await revertirPago(o, reg, { transaction: t, origen, usuario });
      cambio = true;
    }
    resultado = { orden: o, duplicado: false };
  });
  if (cambio) { emitir(resultado.orden); if (resultado.orden.estado === 'aprobado') avisarAprobado(resultado.orden); }
  return resultado;
}

async function revertirPago(o, reg, { transaction: t, origen, usuario }) {
  const anterior = o.estado;
  const pagado = r2(Math.max(0, Number(o.importe_pagado) - Number(reg.monto)));
  await o.update({ importe_pagado: pagado, estado: pagado > 0 ? 'parcial' : 'reembolsado' }, { transaction: t });
  await evento(o, 'reembolso', { anterior, origen, usuario, datos: { pago: reg.provider_payment_id, monto: Number(reg.monto) }, transaction: t });
  await movimiento(o, 'anulacion', Number(reg.monto), `Reembolso ${o.concepto}`, { transaction: t, usuario });
  const h = handlerDe(o.modulo);
  const ctx = { transaction: t, monto: Number(reg.monto), metodo: o.metodo };
  if (h.onReembolsado) await h.onReembolsado(o, ctx);
  else await egresoCaja(o, Number(reg.monto), ctx);
}

/**
 * Webhook / sync: consulta el pago al proveedor con el token del club (nunca se confía en el aviso)
 * y lo aplica a la orden indicada por external_reference. Verifica que la orden sea de ese club.
 */
async function procesarPagoProveedor({ provider = 'mercadopago', paymentId, complexId, origen = 'webhook' }) {
  const pago = await proveedor(provider).consultarPago(paymentId, complexId);
  if (!pago.referencia) return { ignorado: 'sin referencia' };
  const o = await PayOrder.findOne({ where: { token: pago.referencia } });
  if (!o) return { ignorado: 'no es una orden de Jugahoy Pay' };
  if (Number(o.complex_id) !== Number(complexId)) throw httpError(403, 'El pago no corresponde a ese club.');
  return aplicarPago(o, { ...pago, provider }, { origen });
}

/** Cobro manual (efectivo / transferencia / tarjeta en portería). */
async function confirmPayment(orden, { metodo = 'efectivo', monto, usuario } = {}) {
  if (!['efectivo', 'transferencia', 'tarjeta'].includes(metodo)) throw httpError(400, 'Método manual inválido.');
  if (!ESTADOS_COBRABLES.includes(orden.estado) && orden.estado !== 'vencido') throw httpError(409, `La orden está ${orden.estado}.`);
  const resta = saldo(orden);
  const importe = monto != null ? r2(monto) : resta;
  if (!(importe > 0) || importe > resta) throw httpError(400, `El monto debe estar entre $1 y $${resta}.`);
  if (importe !== resta && !orden.permite_parcial) throw httpError(400, 'Esta orden no admite pagos parciales.');
  return aplicarPago(orden, { provider: 'manual', id: `manual-${orden.id}-${crypto.randomUUID()}`, estado: 'approved', monto: importe, metodo, aprobadoAt: new Date() }, { origen: 'admin', usuario });
}

async function cancelPayment(orden, { usuario, motivo } = {}) {
  await sequelize.transaction(async (t) => {
    const o = await PayOrder.findByPk(orden.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (Number(o.importe_pagado) > 0) throw httpError(409, 'La orden tiene pagos: usá reembolso.');
    if (['cancelado', 'aprobado', 'reembolsado'].includes(o.estado)) throw httpError(409, `La orden ya está ${o.estado}.`);
    const anterior = o.estado;
    await o.update({ estado: 'cancelado' }, { transaction: t });
    await evento(o, 'cancelada', { anterior, origen: 'admin', usuario, datos: { motivo: motivo || null }, transaction: t });
    await movimiento(o, 'anulacion', -Number(o.importe), `Anulación ${o.concepto}`, { transaction: t, usuario });
    orden.estado = 'cancelado';
  });
  emitir(orden);
  return orden;
}

/** Reembolso total: proveedor (MP) o manual, con caja y cuenta corriente. */
async function refundPayment(orden, { usuario } = {}) {
  const pagos = await PayPayment.findAll({ where: { order_id: orden.id, estado: 'approved' } });
  if (!pagos.length) throw httpError(409, 'La orden no tiene pagos aprobados.');
  for (const p of pagos) {
    if (p.provider !== 'manual') await proveedor(p.provider).reembolsar(p.provider_payment_id, orden.complex_id);
    await aplicarPago(orden, { provider: p.provider, id: p.provider_payment_id, estado: 'refunded', monto: Number(p.monto) }, { origen: 'admin', usuario });
  }
  return PayOrder.findByPk(orden.id);
}

async function marcarVencida(o) {
  const anterior = o.estado;
  await o.update({ estado: 'vencido' });
  await evento(o, 'vencida', { anterior, origen: 'job' });
  emitir(o);
}
async function expirarVencidas() {
  const lista = await PayOrder.findAll({ where: { estado: ['pendiente', 'rechazado'], vence_at: { [Op.lt]: new Date() } }, limit: 500 });
  for (const o of lista) await marcarVencida(o).catch(() => {});
  return lista.length;
}

// ── Avisos al aprobarse (push del Portal de Jugador + email) ──
function avisarAprobado(o) {
  setImmediate(async () => {
    try {
      const club = await m.Complex.findByPk(o.complex_id, { attributes: ['nombre'], raw: true });
      const texto = `Recibimos tu pago de $${Number(o.importe).toLocaleString('es-AR')} por ${o.concepto}${club ? ` en ${club.nombre}` : ''}. ¡Gracias!`;
      if (o.cliente_dni) {
        await require('../notifications/NotificationService').sendPush({ dni: o.cliente_dni, nombre: o.cliente_nombre, titulo: '✅ Pago aprobado', mensaje: texto, url: `/pay/${o.token}`, dedupe: `pay:${o.token}:aprobado` }).catch(() => {});
      }
      if (o.cliente_email) {
        const { sendMail } = require('../../config/mailer');
        await sendMail({ to: o.cliente_email, subject: `Pago aprobado · ${o.concepto}`, html: `<p>${texto}</p><p>Comprobante: <a href="${urlPago(o)}">${urlPago(o)}</a></p>` }).catch(() => {});
      }
    } catch (err) { console.error('[pay] aviso', err.message); }
  });
}

module.exports = {
  bus, clienteKey, createPaymentOrder, generatePaymentQR, urlPago, porToken, vistaPublica, iniciarCheckout,
  aplicarPago, procesarPagoProveedor, confirmPayment, cancelPayment, refundPayment, expirarVencidas, saldo,
};
