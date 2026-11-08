'use strict';
/**
 * services/pay/providers.js — Pasarelas de pago (estrategia). Hoy: Mercado Pago Checkout Pro.
 *
 * Interfaz de un proveedor:
 *   crearCheckout(orden, { monto }) → { checkoutId, url }
 *   consultarPago(paymentId, complexId) → { id, estado, monto, metodo, cuotas, referencia, aprobadoAt, raw }
 *       estado normalizado: approved | pending | rejected | cancelled | refunded
 *   reembolsar(paymentId, complexId, monto?) → { ok, id }
 *   validarWebhook(req) → { valida: boolean|null, requestId, recursoId, tipo }
 * Para sumar MODO, GetNet, Payway, Naranja X, etc.: agregar otra entrada a PROVIDERS con esta interfaz.
 */
const crypto = require('crypto');
const paymentService = require('../payment.service');
const mpOAuth = require('../mercadopagoOAuth.service');
const { frontendUrl } = require('../../config/urls');

const PUBLIC_API_URL = () => (process.env.PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

const ESTADO_MP = {
  approved: 'approved', authorized: 'pending', pending: 'pending', in_process: 'pending', in_mediation: 'pending',
  rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'refunded',
};

const mercadopago = {
  nombre: 'mercadopago',
  async crearCheckout(orden, { monto }) {
    if (!(await mpOAuth.puedeCobrar(orden.complex_id))) throw httpError(409, 'El club no tiene Mercado Pago conectado.', 'MP_NOT_CONNECTED');
    const accessToken = await mpOAuth.accessTokenValido(orden.complex_id);
    const volver = (r) => frontendUrl(`/pay/${orden.token}?resultado=${r}`);
    const pref = await paymentService.createPreference({
      accessToken,
      items: [{ id: orden.token, title: orden.concepto, unit_price: Number(monto), quantity: 1 }],
      payer: orden.cliente_email ? { name: orden.cliente_nombre || undefined, email: orden.cliente_email } : undefined,
      metadata: { pay_token: orden.token, complex_id: orden.complex_id },
      externalReference: orden.token,
      backUrls: { success: volver('aprobado'), failure: volver('rechazado'), pending: volver('pendiente') },
      notificationUrl: `${PUBLIC_API_URL()}/api/webhooks/mercadopago?complex_id=${orden.complex_id}`,
      expiresAt: orden.vence_at || null,
      binaryMode: false,   // transferencias / efectivo pueden quedar "pendiente" y aprobarse después
    });
    return { checkoutId: pref.preference_id, url: pref.init_point };
  },
  async consultarPago(paymentId, complexId) {
    const accessToken = await mpOAuth.accessTokenValido(complexId);
    const p = await paymentService.getPayment(paymentId, accessToken);
    return {
      id: String(p.id), estado: ESTADO_MP[p.status] || 'pending', estadoProveedor: p.status,
      monto: Number(p.transaction_amount), metodo: p.payment_type_id || p.payment_method_id || null, cuotas: p.installments || null,
      referencia: p.external_reference || p.metadata?.pay_token || null,
      aprobadoAt: p.date_approved ? new Date(p.date_approved) : null,
      raw: { id: p.id, status: p.status, status_detail: p.status_detail, payment_method_id: p.payment_method_id, payment_type_id: p.payment_type_id, transaction_amount: p.transaction_amount, installments: p.installments, date_approved: p.date_approved },
    };
  },
  async reembolsar(paymentId, complexId, monto) {
    const accessToken = await mpOAuth.accessTokenValido(complexId);
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `refund-${paymentId}-${monto || 'total'}` },
      body: JSON.stringify(monto ? { amount: Number(monto) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw httpError(502, `Mercado Pago rechazó el reembolso: ${data.message || r.status}`);
    return { ok: true, id: String(data.id || '') };
  },
  /**
   * Firma de Mercado Pago (x-signature: "ts=…,v1=…"; manifest "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
   * Sin MP_WEBHOOK_SECRET configurado devuelve valida = null (igual se consulta el pago a MP con el
   * token del club: el webhook nunca es fuente de verdad).
   */
  validarWebhook(req) {
    const recursoId = String(req.query['data.id'] || req.body?.data?.id || req.query.id || '');
    const tipo = String(req.body?.type || req.query.type || req.query.topic || '');
    const requestId = String(req.headers['x-request-id'] || '');
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) return { valida: null, requestId, recursoId, tipo };
    const partes = Object.fromEntries(String(req.headers['x-signature'] || '').split(',').map(x => x.trim().split('=')).filter(x => x.length === 2));
    if (!partes.ts || !partes.v1) return { valida: false, requestId, recursoId, tipo };
    const manifest = `id:${recursoId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
    const firma = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    const ok = firma.length === partes.v1.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(partes.v1));
    return { valida: ok, requestId, recursoId, tipo };
  },
};

const PROVIDERS = { mercadopago };
const proveedor = (nombre = 'mercadopago') => {
  const p = PROVIDERS[nombre];
  if (!p) throw httpError(400, `Pasarela no soportada: ${nombre}`);
  return p;
};

module.exports = { PROVIDERS, proveedor };
