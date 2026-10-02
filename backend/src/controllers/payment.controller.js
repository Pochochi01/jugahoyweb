'use strict';
/**
 * controllers/payment.controller.js
 * Integración MercadoPago Checkout Pro para reservas de turnos.
 *
 * Principios (confirmados):
 *  - El Booking se crea al reservar (estado 'pendiente_pago') y retiene el slot.
 *    init-mp NO crea la orden: solo genera la preference.
 *  - Doble reconciliación (webhook + sync) usando la MISMA función _syncFromMercadoPago.
 *  - Idempotencia por mp_payment_id (UNIQUE) + transacción con lock.
 *  - Nunca se confía en los query params de retorno: se consulta a MP con el token.
 *  - Token OAuth del complejo (renovado automáticamente) → se resuelve vía
 *    complex_id embebido en notification_url y reserva_id en back_urls.
 */
const { Op } = require('sequelize');
const { Booking, Field, Complex, TimeSlot, sequelize } = require('../models');
const paymentService = require('../services/payment.service');
const mpOAuth = require('../services/mercadopagoOAuth.service');
const reservaPago = require('../services/reservaPago.service');
const caja = require('../services/cajaService');

const PUBLIC_URL     = process.env.PUBLIC_URL     || 'http://localhost:5173';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3001';

// ── helpers de token ──────────────────────────────────────────
// Access token OAuth válido del complejo (se renueva solo si está por vencer)
async function tokenForComplexId(complexId) {
  return mpOAuth.accessTokenValido(complexId);
}

// Carga la reserva con su cancha y complejo (para token + montos)
async function loadBookingFull(reservaId) {
  return Booking.findByPk(reservaId, {
    include: [{
      model: Field, as: 'field',
      include: [{ model: Complex, as: 'complex', attributes: ['id', 'nombre'] }],
    }],
  });
}

// ── POST /api/payments/init-mp ────────────────────────────────
// Jugador (web): genera la preference de una reserva propia. El monto y la
// preference los arma reservaPago.service (misma lógica que panel y chatbot).
async function initMp(req, res) {
  try {
    const { reserva_id, cancha_id, player_id, tipoPago } = req.body;
    if (!reserva_id || !tipoPago) return res.status(400).json({ message: 'reserva_id y tipoPago son requeridos' });

    const booking = await Booking.findByPk(reserva_id, { attributes: ['id', 'user_id', 'field_id'] });
    if (!booking) return res.status(404).json({ message: 'Reserva no encontrada' });
    // Seguridad: la reserva debe ser del jugador autenticado
    if (booking.user_id && booking.user_id !== req.user.id) {
      return res.status(403).json({ message: 'No podés pagar una reserva de otro usuario' });
    }
    if (cancha_id && Number(cancha_id) !== booking.field_id) {
      return res.status(400).json({ message: 'La cancha no corresponde a la reserva' });
    }
    res.json(await reservaPago.iniciarPagoReserva(booking.id, tipoPago, { playerId: player_id }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
}

// ── GET /api/payments/sync?payment_id=X&reserva_id=Y ──────────
// El frontend llama esto al volver de MP. reserva_id (external_reference) permite
// resolver el token del complejo para consultar el payment.
async function sync(req, res) {
  try {
    const paymentId = req.query.payment_id;
    const reservaId = req.query.reserva_id;
    if (!paymentId) return res.status(400).json({ message: 'payment_id es requerido' });

    // Token: el del complejo de la reserva (ya no hay token de plataforma)
    if (!reservaId) return res.status(400).json({ message: 'reserva_id es requerido' });
    const booking = await loadBookingFull(reservaId);
    if (!booking) return res.status(404).json({ message: 'Reserva no encontrada' });
    const accessToken = await tokenForComplexId(booking.field?.complex?.id);

    const result = await _syncFromMercadoPago(paymentId, accessToken);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

// ── POST /api/payments/webhook ────────────────────────────────
// Responder 200 de inmediato; procesar async solo eventos de tipo 'payment'.
async function webhook(req, res) {
  res.sendStatus(200); // ACK inmediato (MP reintenta si no recibe 200)

  try {
    const type = req.query.type || req.body?.type || req.body?.action?.split('.')?.[0];
    if (type !== 'payment') return;

    const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (!paymentId) return;

    const complexId = req.query.complex_id;
    const accessToken = await tokenForComplexId(complexId);

    await _syncFromMercadoPago(paymentId, accessToken);
  } catch (err) {
    // No re-lanzar: ya respondimos 200. Log para diagnóstico.
    console.error('[MP webhook] error:', err.message);
  }
}

// ── Reconciliación central (webhook + sync) ───────────────────
/**
 * Consulta el payment en MP, mapea el estado y actualiza la reserva de forma
 * idempotente y transaccional.
 * @returns {Promise<{status, estado, reserva_id, mp_payment_id}>}
 */
async function _syncFromMercadoPago(paymentId, accessToken) {
  // 1) Fuente de verdad: consultar el payment a MP (nunca los query params)
  const payment = await paymentService.getPayment(paymentId, accessToken);
  const status  = payment?.status; // approved | pending | in_process | rejected | cancelled | refunded

  // reserva_id: external_reference primero, luego metadata
  const meta = payment?.metadata || {};
  const reservaId = payment?.external_reference || meta.reserva_id;
  if (!reservaId) {
    return { status, estado: null, reserva_id: null, mp_payment_id: String(paymentId) };
  }

  // 2) Transacción con lock sobre la reserva (serializa webhook vs sync)
  const t = await sequelize.transaction();
  try {
    const booking = await Booking.findByPk(reservaId, {
      include: [{ model: TimeSlot, as: 'timeSlots' }],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!booking) { await t.rollback(); return { status, estado: null, reserva_id: reservaId }; }

    // Idempotencia: si ya se procesó este payment, no repetir
    if (booking.mp_payment_id === String(paymentId) &&
        ['confirmado', 'cancelado', 'rechazado'].includes(booking.estado)) {
      await t.commit();
      return { status, estado: booking.estado, reserva_id: booking.id, mp_payment_id: booking.mp_payment_id };
    }

    if (status === 'approved') {
      await booking.update({
        estado:        'confirmado',
        mp_payment_id: String(paymentId),
        monto_pagado:  payment.transaction_amount,
        metodo_pago:   'mercadopago',
      }, { transaction: t });
      // Caja: el cobro online se registra recién cuando MercadoPago lo CONFIRMA.
      // Si no hay caja abierta, queda pendiente y se registra al cobrar el turno
      // en la agenda (pago_online_en_caja evita contarlo dos veces).
      const field = await Field.findByPk(booking.field_id, { attributes: ['complex_id', 'nombre'], transaction: t });
      const tx = await caja.registrarEnCaja(field.complex_id, {
        tipo: 'ingreso', metodo_pago: 'mercadopago', categoria: 'turno', agenda_id: booking.id,
        concepto: `${booking.tipo_pago === 'seña' ? 'Seña' : 'Pago'} online turno ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio} (MercadoPago)`,
        monto: Number(payment.transaction_amount),
      }, t);
      if (tx) await booking.update({ pago_online_en_caja: true }, { transaction: t });
    } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) {
      // Liberar el slot para que otro pueda reservar
      await Promise.all((booking.timeSlots || []).map(s =>
        s.update({ estado: 'libre', booking_id: null }, { transaction: t })));
      await booking.update({
        estado:        status === 'refunded' || status === 'charged_back' ? 'cancelado' : 'rechazado',
        mp_payment_id: String(paymentId),
      }, { transaction: t });
    }
    // pending / in_process → se mantiene 'pendiente_pago' (no se toca)

    await t.commit();
    return {
      status,
      estado:        booking.estado,
      reserva_id:    booking.id,
      mp_payment_id: booking.mp_payment_id,
    };
  } catch (err) {
    await t.rollback();
    // Race condition entre webhook y sync: otra transacción ya seteó el mp_payment_id UNIQUE
    if (err.original?.code === 'ER_DUP_ENTRY' || err.parent?.code === 'ER_DUP_ENTRY') {
      const fresh = await Booking.findByPk(reservaId);
      return { status, estado: fresh?.estado, reserva_id: reservaId, mp_payment_id: String(paymentId), deduped: true };
    }
    throw err;
  }
}

module.exports = { initMp, sync, webhook, _syncFromMercadoPago };
