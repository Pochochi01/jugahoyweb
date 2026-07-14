'use strict';
/**
 * config/mp.config.js
 * Configuración del SDK de MercadoPago (Checkout Pro).
 *
 * Decisión de arquitectura (confirmada): el cobro va a la cuenta de CADA complejo
 * usando `complexes.mercadopago_token`. Por eso el cliente del SDK se crea
 * POR REQUEST con el token correspondiente (no como singleton global).
 *
 * `MP_ACCESS_TOKEN` del .env se usa solo como fallback de plataforma cuando un
 * complejo todavía no configuró su token propio.
 *
 * El access token NUNCA se expone al frontend (no-negociable #5).
 */
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const PLATFORM_TOKEN = process.env.MP_ACCESS_TOKEN || null;

if (!PLATFORM_TOKEN) {
  console.warn('⚠️  MercadoPago: MP_ACCESS_TOKEN no está configurado en .env ' +
    '(los complejos sin token propio no podrán cobrar online).');
}

/**
 * Detecta el ambiente a partir del prefijo del token.
 *  - TEST-...     → sandbox (credenciales de prueba)
 *  - APP_USR-...  → producción
 */
function detectEnv(token) {
  if (!token) return 'unset';
  if (token.startsWith('TEST-')) return 'sandbox';
  if (token.startsWith('APP_USR-')) return 'production';
  return 'unknown';
}

/**
 * Resuelve el access token a usar para un complejo dado.
 * Prioriza el token propio del complejo; si no tiene, usa el de plataforma.
 * @param {string|null} complexToken  complexes.mercadopago_token
 * @returns {string|null}
 */
function resolveAccessToken(complexToken) {
  return (complexToken && complexToken.trim()) || PLATFORM_TOKEN;
}

/**
 * Crea un cliente del SDK para un access token concreto.
 * @param {string} accessToken
 * @returns {{ client: MercadoPagoConfig, preference: Preference, payment: Payment, env: string }}
 */
function buildClient(accessToken) {
  if (!accessToken) {
    const err = new Error('MercadoPago no está configurado para este complejo.');
    err.status = 400;
    err.code = 'MP_TOKEN_MISSING';
    throw err;
  }
  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });
  return {
    client,
    preference: new Preference(client),
    payment:    new Payment(client),
    env:        detectEnv(accessToken),
  };
}

module.exports = {
  PLATFORM_TOKEN,
  detectEnv,
  resolveAccessToken,
  buildClient,
};
