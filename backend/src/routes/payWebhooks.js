'use strict';
/**
 * routes/payWebhooks.js — POST /api/webhooks/mercadopago?complex_id=N
 *
 * 1. Registra la notificación (pay_webhook_logs) con su request-id: un reintento idéntico no se procesa dos veces.
 * 2. Valida la firma x-signature (si MP_WEBHOOK_SECRET está configurado; inválida → 401).
 * 3. Consulta el pago a Mercado Pago con el token del club (fuente de verdad: nunca se usa el cuerpo del aviso).
 * 4. Lo aplica a la orden (external_reference = token) verificando que sea de ese club. Idempotente por payment id.
 * Responde 200 rápido; un error interno devuelve 500 para que Mercado Pago reintente.
 */
const router = require('express').Router();
const { proveedor } = require('../services/pay/providers');
const engine = require('../services/pay/payEngine');
const { PayWebhookLog } = require('../models');

router.post('/mercadopago', async (req, res) => {
  const mp = proveedor('mercadopago');
  const { valida, requestId, recursoId, tipo } = mp.validarWebhook(req);
  const complexId = Number(req.query.complex_id) || null;
  let log;
  try {
    const reqId = requestId || `${tipo}:${recursoId}:${Date.now()}`;
    [log] = await PayWebhookLog.findOrCreate({
      where: { provider: 'mercadopago', request_id: reqId },
      defaults: { provider: 'mercadopago', request_id: reqId, tipo, recurso_id: recursoId, complex_id: complexId, firma_valida: valida, ip: String(req.ip || '').slice(0, 64), payload: { query: req.query, body: req.body } },
    });
    if (log.procesado) return res.status(200).json({ ok: true, duplicado: true });
    if (valida === false) { await log.update({ resultado: 'firma inválida' }); return res.status(401).json({ message: 'Firma inválida' }); }
    if (!/payment/.test(tipo) || !recursoId || !complexId) { await log.update({ procesado: true, resultado: 'ignorado (no es un pago)' }); return res.status(200).json({ ok: true }); }
    const r = await engine.procesarPagoProveedor({ provider: 'mercadopago', paymentId: recursoId, complexId, origen: 'webhook' });
    await log.update({ procesado: true, resultado: r.ignorado || (r.duplicado ? 'duplicado' : `orden ${r.orden?.token} → ${r.orden?.estado}`) });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[pay webhook]', err.message);
    if (log) await log.update({ resultado: String(err.message).slice(0, 255) }).catch(() => {});
    res.status(err.status === 403 ? 200 : 500).json({ message: 'error' });   // 403 (otro club): no reintentar
  }
});

module.exports = router;
