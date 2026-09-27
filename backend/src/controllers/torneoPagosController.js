'use strict';
/**
 * controllers/torneoPagosController.js
 * Cobro de inscripciones con MercadoPago (Checkout Pro) a la cuenta DEL CLUB.
 *
 * Mismo esquema que las reservas (payment.controller.js):
 *  - la inscripción viaja en metadata { tipo: 'torneo', pareja_id } y el webhook
 *    es propio (/api/torneos/public/pagos/webhook), separado del de reservas
 *  - doble reconciliación: webhook + sync al volver del checkout
 *  - fuente de verdad = consulta del payment a MP con el token del club
 *  - idempotencia por torneo_parejas.mp_payment_id (UNIQUE) + lock
 */
const { PaymentRefund } = require('mercadopago');
const { Torneo, TorneoPareja, TorneoJugador, sequelize } = require('../models');
const paymentService = require('../services/payment.service');
const integrations = require('../services/integrations.service');
const { buildClient } = require('../config/mp.config');
const svc = require('../services/torneos/torneoService');
const { frontendUrl } = require('../config/urls');

const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3001';

async function cargarPareja(id) {
  return TorneoPareja.findByPk(id, {
    include: [{ model: Torneo, as: 'torneo' }, { model: TorneoJugador, as: 'jugadores' }],
  });
}

// ── POST /api/torneos/public/parejas/:parejaId/pagar ──────────
async function iniciarPago(req, res) {
  try {
    const pareja = await cargarPareja(req.params.parejaId);
    if (!pareja) return res.status(404).json({ message: 'Inscripción no encontrada' });
    if (pareja.estado_pago !== 'pendiente') return res.status(409).json({ message: `La inscripción está ${pareja.estado_pago}.` });
    const torneo = pareja.torneo;
    const monto = Number(torneo.precio_inscripcion);
    if (!(monto > 0)) return res.status(400).json({ message: 'El torneo no tiene costo de inscripción.' });

    const accessToken = await integrations.requireMercadoPagoToken(torneo.id_tenant);
    const back = (estado) => frontendUrl(`/torneos/${torneo.id}/pago?estado=${estado}&pareja=${pareja.id}`);
    const pref = await paymentService.createPreference({
      accessToken,
      items: [{
        id: `torneo-${torneo.id}-pareja-${pareja.id}`,
        title: `Inscripción ${torneo.nombre} — ${pareja.jugadores.map(j => j.nombre).join(' / ')}`,
        quantity: 1,
        unit_price: monto,
      }],
      payer: { name: pareja.jugadores[0]?.nombre, email: pareja.jugadores[0]?.email || undefined },
      metadata: { tipo: 'torneo', torneo_id: torneo.id, pareja_id: pareja.id },
      backUrls: { success: back('exito'), failure: back('error'), pending: back('pendiente') },
      notificationUrl: `${PUBLIC_API_URL}/api/torneos/public/pagos/webhook?complex_id=${torneo.id_tenant}`,
    });
    // La pareja viaja en metadata (tipo: 'torneo'); reconciliar() la lee del payment.
    res.json({ ...pref, amount: monto });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

// ── GET /api/torneos/public/pagos/sync?payment_id&pareja_id ───
async function sync(req, res) {
  try {
    const { payment_id: paymentId, pareja_id: parejaId } = req.query;
    if (!paymentId || !parejaId) return res.status(400).json({ message: 'payment_id y pareja_id son requeridos' });
    const pareja = await cargarPareja(parejaId);
    if (!pareja) return res.status(404).json({ message: 'Inscripción no encontrada' });
    const token = await integrations.getMercadoPagoToken(pareja.torneo.id_tenant);
    res.json(await reconciliar(paymentId, token, Number(parejaId)));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

// ── POST /api/torneos/public/pagos/webhook?complex_id= ────────
async function webhook(req, res) {
  res.sendStatus(200);
  try {
    const type = req.query.type || req.body?.type || req.body?.action?.split('.')?.[0];
    if (type !== 'payment') return;
    const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (!paymentId) return;
    const token = await integrations.getMercadoPagoToken(req.query.complex_id);
    await reconciliar(paymentId, token);
  } catch (err) {
    console.error('[torneos][MP webhook]', err.message);
  }
}

/**
 * Reconciliación central (webhook + sync).
 * @param {number} [parejaEsperada] si viene del sync, el payment debe corresponder a esa pareja
 */
async function reconciliar(paymentId, accessToken, parejaEsperada) {
  const payment = await paymentService.getPayment(paymentId, accessToken);
  const status = payment?.status;
  const parejaId = Number(payment?.metadata?.pareja_id);
  if (payment?.metadata?.tipo !== 'torneo' || !parejaId) return { status, estado_pago: null };
  if (parejaEsperada && parejaEsperada !== parejaId) {
    const e = new Error('El pago no corresponde a esta inscripción.'); e.status = 400; throw e;
  }

  let pagadoAhora = false;
  const estado = await sequelize.transaction(async (t) => {
    const pareja = await TorneoPareja.findByPk(parejaId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!pareja) return null;
    if (status === 'approved' && pareja.estado_pago === 'pendiente') {
      await svc.confirmarPago(pareja.id, {
        metodo_pago: 'mercadopago', mp_payment_id: String(paymentId), monto: payment.transaction_amount,
      }, t);
      pagadoAhora = true;
      return 'pagado';
    }
    if (['refunded', 'charged_back'].includes(status) && pareja.estado_pago === 'pagado') {
      await pareja.update({ estado_pago: 'reembolsado' }, { transaction: t });
      return 'reembolsado';
    }
    // rejected / cancelled → sigue 'pendiente' (puede reintentar)
    return pareja.estado_pago;
  }).catch(async (err) => {
    if (err.original?.code === 'ER_DUP_ENTRY') return (await TorneoPareja.findByPk(parejaId))?.estado_pago;
    throw err;
  });

  if (pagadoAhora) {
    const pareja = await cargarPareja(parejaId);
    await svc.emitirTickets(pareja.torneo, pareja);
  }
  return { status, estado_pago: estado, pareja_id: parejaId };
}

/** Reembolso total en MercadoPago (lo usa el organizador al marcar 'reembolsado'). */
async function reembolsarMp(clubId, paymentId) {
  const token = await integrations.requireMercadoPagoToken(clubId);
  const { client } = buildClient(token);
  return new PaymentRefund(client).create({ payment_id: paymentId });
}

module.exports = { iniciarPago, sync, webhook, reconciliar, reembolsarMp };
