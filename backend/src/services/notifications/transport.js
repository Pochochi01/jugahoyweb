'use strict';
/**
 * services/notifications/transport.js — Proveedores de envío (estrategia por suscripción).
 *
 *   fcm     → Firebase Cloud Messaging (firebase-admin). Se activa con FIREBASE_SERVICE_ACCOUNT
 *             (ruta al JSON, JSON literal o base64) en .env.
 *   webpush → Web Push estándar con VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY), ya existente.
 *
 * send(sub, payload) resuelve { ok: true } o { ok: false, invalido: bool, error }.
 * invalido = el token/suscripción ya no existe (se da de baja); el resto se reintenta.
 * Se envían mensajes de DATOS: el Service Worker de la PWA arma la notificación (mismo formato
 * para los dos proveedores, con id de seguimiento para medir entrega y apertura).
 */
const fs = require('fs');
const webpush = require('web-push');
const notif = require('../notification.service');   // configura VAPID al cargarse

let fcm = null;          // instancia de messaging, o false si no está configurado
function messaging() {
  if (fcm !== null) return fcm;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { fcm = false; return fcm; }
  try {
    const admin = require('firebase-admin');
    const txt = raw.trim().startsWith('{') ? raw : fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8') : Buffer.from(raw, 'base64').toString('utf8');
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(txt)) });
    fcm = app.messaging();
    console.log('✓ Firebase Cloud Messaging activo');
  } catch (err) {
    console.error('✗ Firebase Cloud Messaging:', err.message);
    fcm = false;
  }
  return fcm;
}

const FCM_INVALIDOS = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);
const TTL_SEG = 6 * 3600;

async function enviarFcm(sub, payload) {
  const m = messaging();
  if (!m) return { ok: false, invalido: false, error: 'FCM no configurado' };
  try {
    await m.send({
      token: sub.fcm_token,
      data: Object.fromEntries(Object.entries({ ...payload, actions: JSON.stringify(payload.actions || []) }).map(([k, v]) => [k, String(v ?? '')])),
      webpush: { headers: { TTL: String(TTL_SEG), Urgency: 'high' }, fcmOptions: { link: payload.url } },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, invalido: FCM_INVALIDOS.has(err.code), error: err.code || err.message };
  }
}

async function enviarWebPush(sub, payload) {
  if (!notif.isConfigured()) return { ok: false, invalido: false, error: 'VAPID no configurado' };
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: TTL_SEG, urgency: 'high' });
    return { ok: true };
  } catch (err) {
    const code = err.statusCode;
    // 404/410: la suscripción no existe más · 400/403: claves inválidas para este endpoint
    return { ok: false, invalido: [400, 403, 404, 410].includes(code) || /p256dh|auth/.test(err.message), error: `${code || ''} ${err.body || err.message}`.trim().slice(0, 250) };
  }
}

function send(sub, payload) {
  return sub.proveedor === 'fcm' ? enviarFcm(sub, payload) : enviarWebPush(sub, payload);
}

const disponible = () => Boolean(messaging()) || notif.isConfigured();
const fcmActivo = () => Boolean(messaging());

module.exports = { send, disponible, fcmActivo, _setFcm: (v) => { fcm = v; } };
