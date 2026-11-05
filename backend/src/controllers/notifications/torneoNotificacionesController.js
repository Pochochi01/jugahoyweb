'use strict';
/**
 * controllers/notifications/torneoNotificacionesController.js
 * Administración > Notificaciones (por club): historial, filtros, métricas y reenvío.
 */
const svc = require('../../services/notifications/NotificationService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.status ? err.message : 'Error interno' });

async function listar(req, res) {
  try { res.json(await svc.listar(req.clubId, req.query)); } catch (e) { send(res, e); }
}
async function metricas(req, res) {
  try { res.json(await svc.metricas(req.clubId, req.query)); } catch (e) { send(res, e); }
}
async function reenviar(req, res) {
  try { res.status(201).json(await svc.reenviar(req.clubId, Number(req.params.id))); } catch (e) { send(res, e); }
}

module.exports = { listar, metricas, reenviar };
