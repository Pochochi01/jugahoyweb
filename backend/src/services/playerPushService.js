'use strict';
/**
 * services/playerPushService.js — Web Push del Portal de Jugador (suscripción por DNI).
 * Reutiliza las claves VAPID de notification.service. Envíos siempre en segundo plano:
 * un error de push nunca afecta la operación que lo disparó.
 */
const webpush = require('web-push');
const { PlayerPushSubscription } = require('../models');
const notif = require('./notification.service');

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function suscribir(dni, subscription, userAgent) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw httpError(400, 'Suscripción push inválida.');
  const datos = { dni, keys: subscription.keys, user_agent: String(userAgent || '').slice(0, 255) || null };
  const [row, creada] = await PlayerPushSubscription.findOrCreate({ where: { endpoint: subscription.endpoint }, defaults: { ...datos, endpoint: subscription.endpoint } });
  if (!creada) await row.update(datos);   // el mismo dispositivo pasa a otro DNI
  return row;
}

async function desuscribir(dni, endpoint) {
  if (!endpoint) return 0;
  return PlayerPushSubscription.destroy({ where: { dni, endpoint } });
}

/** Envía a todos los dispositivos de esos DNI. payload: { titulo, body, url, tipo } */
async function enviarADnis(dnis, payload) {
  const lista = [...new Set((dnis || []).map(d => String(d || '').replace(/\D/g, '')).filter(Boolean))];
  if (!notif.isConfigured() || !lista.length) return { sent: 0, pruned: 0 };
  const subs = await PlayerPushSubscription.findAll({ where: { dni: lista } });
  let sent = 0, pruned = 0;
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload)); sent++; } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { await s.destroy().catch(() => {}); pruned++; } else console.error('[push jugador]', err.statusCode, err.body || err.message);
    }
  }));
  return { sent, pruned };
}

function enviarADnisAsync(dnis, payload) {
  enviarADnis(dnis, payload).catch(err => console.error('[push jugador]', err.message));
}

module.exports = { suscribir, desuscribir, enviarADnis, enviarADnisAsync };
