'use strict';
/**
 * services/payment.service.js
 * Envuelve el SDK de MercadoPago (Checkout Pro).
 *
 * El access token se resuelve por complejo (ver mp.config.js) y se pasa a cada
 * método → nunca hay un cliente global con un token fijo.
 */
const { buildClient } = require('../config/mp.config');

const CURRENCY = process.env.MP_CURRENCY || 'ARS';

// ── Validación de items ───────────────────────────────────────
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const e = new Error('La preferencia necesita al menos un item.'); e.status = 400; throw e;
  }
  for (const it of items) {
    const price = Number(it.unit_price);
    const qty   = Number(it.quantity ?? 1);
    if (!it.title || !Number.isFinite(price) || price <= 0 || !Number.isInteger(qty) || qty < 1) {
      const e = new Error('Item inválido: se requiere title, unit_price > 0 y quantity entero >= 1.');
      e.status = 400; throw e;
    }
  }
}

// ── Cálculo de montos ─────────────────────────────────────────
/**
 * Monto de la seña de una cancha (monto fijo definido por el admin).
 * @param {object} field  instancia/objeto Field
 */
function montoSena(field) {
  const s = Number(field?.sena_monto);
  if (!Number.isFinite(s) || s <= 0) {
    const e = new Error('Esta cancha no tiene una seña configurada.'); e.status = 400; e.code = 'SENA_NO_CONFIG';
    throw e;
  }
  return Math.round(s * 100) / 100;
}

/**
 * Monto total del turno (lo que se cobra si paga el total).
 * @param {object} booking  instancia/objeto Booking
 */
function montoTotal(booking) {
  const t = Number(booking?.monto);
  if (!Number.isFinite(t) || t <= 0) {
    const e = new Error('La reserva no tiene un monto válido.'); e.status = 400; e.code = 'MONTO_INVALIDO';
    throw e;
  }
  return Math.round(t * 100) / 100;
}

/**
 * Calcula el monto a cobrar según el tipo de pago.
 * @returns {{ amount:number, label:string }}
 */
function calcularMonto({ tipoPago, field, booking }) {
  if (tipoPago === 'seña') {
    const amount = montoSena(field);
    const total  = montoTotal(booking);
    if (amount > total) {
      const e = new Error('La seña no puede superar el total del turno.'); e.status = 400; throw e;
    }
    return { amount, label: 'Seña del turno' };
  }
  if (tipoPago === 'total') {
    return { amount: montoTotal(booking), label: 'Total del turno' };
  }
  const e = new Error('tipoPago inválido (esperado "seña" o "total").'); e.status = 400; throw e;
}

// ── Preference ────────────────────────────────────────────────
/**
 * Crea una preference de Checkout Pro.
 * @returns {Promise<{preference_id, init_point, sandbox_init_point}>}
 */
async function createPreference({ items, payer, metadata, backUrls, notificationUrl, accessToken }) {
  validateItems(items);
  const { preference } = buildClient(accessToken);

  const body = {
    items: items.map((it, i) => ({
      id:          String(it.id ?? i + 1),
      title:       String(it.title).slice(0, 250),
      quantity:    Number(it.quantity ?? 1),
      unit_price:  Number(it.unit_price),
      currency_id: CURRENCY,
    })),
    payer: payer ? { name: payer.name, email: payer.email } : undefined,
    metadata,                                   // viaja al payment → reconstruye la orden
    external_reference: metadata?.reserva_id != null ? String(metadata.reserva_id) : undefined,
    back_urls: backUrls,
    auto_return: 'approved',
    notification_url: notificationUrl,
    binary_mode: true,                          // aprobado o rechazado (sin limbo largo)
  };

  const res = await preference.create({ body });
  return {
    preference_id:      res.id,
    init_point:         res.init_point,
    sandbox_init_point: res.sandbox_init_point,
  };
}

// ── Payment ───────────────────────────────────────────────────
/**
 * Consulta un payment por id (fuente de verdad; nunca confiar en query params).
 * @returns {Promise<object>} payment de MP
 */
async function getPayment(id, accessToken) {
  const { payment } = buildClient(accessToken);
  return payment.get({ id });
}

module.exports = {
  validateItems,
  montoSena,
  montoTotal,
  calcularMonto,
  createPreference,
  getPayment,
};
