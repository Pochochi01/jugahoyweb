'use strict';
/**
 * services/notification.service.js
 * Integración de Web Push (VAPID) con la librería `web-push`.
 *
 * - Guarda/borra suscripciones (tabla push_subscriptions).
 * - `sendToUser`: envía a todas las suscripciones de un usuario y poda las
 *   suscripciones muertas (404/410).
 * - Los envíos reales se disparan desde los eventos de reserva (best-effort,
 *   nunca bloquean la respuesta HTTP).
 */
const webpush = require('web-push');
const { PushSubscription } = require('../models');

const PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:soporte@jugahoy.com.ar';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
} else {
  console.warn('⚠️  Web Push deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en .env');
}

function getVapidPublicKey() { return PUBLIC_KEY || null; }
function isConfigured()      { return configured; }

// ── Suscripciones ─────────────────────────────────────────────
async function saveSubscription(userId, subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const e = new Error('Suscripción push inválida.'); e.status = 400; throw e;
  }
  // Idempotente por endpoint; reasigna el user_id por si cambió de cuenta en el device
  const [row, created] = await PushSubscription.findOrCreate({
    where:    { endpoint: subscription.endpoint },
    defaults: { user_id: userId, endpoint: subscription.endpoint, keys: subscription.keys },
  });
  if (!created) await row.update({ user_id: userId, keys: subscription.keys });
  return row;
}

async function removeSubscription(endpoint) {
  if (!endpoint) return 0;
  return PushSubscription.destroy({ where: { endpoint } });
}

// ── Envío ─────────────────────────────────────────────────────
/**
 * Envía un push a todas las suscripciones de un usuario.
 * @param {number} userId
 * @param {object} payload  { tipo, titulo, body, url, data:{ cancha_id, cancha_nombre, fecha, hora, booking_id }, actions? }
 * @returns {Promise<{sent:number, pruned:number}>}
 */
async function sendToUser(userId, payload) {
  if (!configured || !userId) return { sent: 0, pruned: 0 };
  const subs = await PushSubscription.findAll({ where: { user_id: userId } });
  let sent = 0, pruned = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      // 404/410 → la suscripción ya no existe en el navegador: la eliminamos
      if (err.statusCode === 404 || err.statusCode === 410) {
        await s.destroy(); pruned++;
      } else {
        console.error('[push] error:', err.statusCode, err.body || err.message);
      }
    }
  }));
  return { sent, pruned };
}

/**
 * Helper para no bloquear la request: envía en segundo plano y loguea errores.
 */
function sendToUserAsync(userId, payload) {
  sendToUser(userId, payload).catch(err => console.error('[push] sendToUserAsync:', err.message));
}

module.exports = {
  getVapidPublicKey,
  isConfigured,
  saveSubscription,
  removeSubscription,
  sendToUser,
  sendToUserAsync,
};
