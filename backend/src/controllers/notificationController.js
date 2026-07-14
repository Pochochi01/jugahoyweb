const { Notification } = require('../models');
const notifService = require('../services/notification.service');

async function getAll(req, res) {
  try {
    const notifs = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function markRead(req, res) {
  try {
    await Notification.update(
      { leida: true },
      { where: { id: req.params.id, user_id: req.user.id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function markAllRead(req, res) {
  try {
    await Notification.update({ leida: true }, { where: { user_id: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Web Push ──────────────────────────────────────────────────
// Clave pública VAPID (necesaria en el frontend para suscribirse). No es secreta.
async function getVapidKey(req, res) {
  res.json({ publicKey: notifService.getVapidPublicKey() });
}

// Registrar/actualizar la suscripción del navegador actual
async function subscribe(req, res) {
  try {
    const subscription = req.body?.subscription || req.body;
    await notifService.saveSubscription(req.user.id, subscription);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

// Eliminar una suscripción (al desactivar o cerrar sesión)
async function unsubscribe(req, res) {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ message: 'endpoint requerido' });
    await notifService.removeSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Envío manual (solo admins). Los envíos automáticos ocurren en los eventos de reserva.
async function send(req, res) {
  try {
    const { user_id, payload } = req.body;
    if (!user_id || !payload) return res.status(400).json({ message: 'user_id y payload son requeridos' });
    const result = await notifService.sendToUser(user_id, payload);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAll, markRead, markAllRead, getVapidKey, subscribe, unsubscribe, send };
