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

// Montos (seña / total): services/reservaPago.service.js — única fuente para web, panel y chatbot.

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
  createPreference,
  getPayment,
};
