'use strict';
/**
 * controllers/bracketTemplatesController.js — Plantillas de llaves (solo Administrador General).
 * Permite agregar formatos nuevos (globales o del club) sin modificar código.
 */
const svc = require('../services/brackets/bracketService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.status ? err.message : 'Error interno', ...(err.errores && { errores: err.errores }) });
const usuario = (req) => (req.user ? `${req.user.nombre} ${req.user.apellido || ''}`.trim() : null);

async function catalogo(req, res) {
  try { res.json(await svc.catalogo(req.clubId)); } catch (e) { send(res, e); }
}
function probar(req, res) {
  try { res.json(svc.probarPlantilla(req.body || {})); } catch (e) { send(res, e); }
}
async function crear(req, res) {
  try { res.status(201).json(await svc.guardarPlantilla(req.body || {}, { clubId: req.clubId, usuario: usuario(req) })); } catch (e) { send(res, e); }
}
async function actualizar(req, res) {
  try { res.json(await svc.guardarPlantilla(req.body || {}, { id: Number(req.params.id), clubId: req.clubId, usuario: usuario(req) })); } catch (e) { send(res, e); }
}
async function activar(req, res) {
  try { res.json(await svc.cambiarActiva(Number(req.params.id), req.body?.active)); } catch (e) { send(res, e); }
}

module.exports = { catalogo, probar, crear, actualizar, activar };
