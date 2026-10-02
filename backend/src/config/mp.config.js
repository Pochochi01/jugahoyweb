'use strict';
/**
 * config/mp.config.js
 * Cliente del SDK de MercadoPago (Checkout Pro) para un access token concreto.
 *
 * El token SIEMPRE es el de la cuenta del complejo, obtenido por OAuth y
 * renovado automáticamente (services/mercadopagoOAuth.service.js →
 * accessTokenValido). Ya no existe token de plataforma ni tokens pegados a mano.
 * El access token nunca se expone al frontend.
 */
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

/**
 * @param {string} accessToken  token OAuth del complejo
 * @returns {{ client: MercadoPagoConfig, preference: Preference, payment: Payment }}
 */
function buildClient(accessToken) {
  if (!accessToken) {
    const err = new Error('El complejo no conectó su cuenta de MercadoPago.');
    err.status = 400;
    err.code = 'MP_NOT_CONNECTED';
    throw err;
  }
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
  return { client, preference: new Preference(client), payment: new Payment(client) };
}

module.exports = { buildClient };
