'use strict';
/**
 * controllers/torneoPlantelController.js — "Editar plantel" de una inscripción (pareja).
 * Rutas (/api/torneos/club/:complexId/torneos/:torneoId/parejas/:parejaId/jugadores):
 *   GET    /             jugadores + cupo + participación
 *   POST   /             agregar jugador (cupo 2)
 *   PUT    /:jugadorId   modificar jugador
 *   DELETE /:jugadorId   eliminar (no si la pareja ya jugó)
 *   GET    /historial    cambios (CREATE / UPDATE / DELETE)
 */
const plantel = require('../services/torneos/plantelService');
const { permisosDe, PERMISOS } = require('../services/torneos/torneoPermisos');

const send = (res, err) => {
  if (!err.status) console.error('[plantel]', err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Error interno al editar el plantel.' });
};
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { send(res, err); } };
const autor = (req) => (req.user
  ? { id: req.user.id, nombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.email }
  : { id: null, nombre: req.organizador ? `Organizador ${req.organizador.nombre || req.organizador.usuario}` : null });

const listar = h(async (req, res) => res.json(await plantel.listar(req.torneo, req.params.parejaId)));
const agregar = h(async (req, res) => res.status(201).json(await plantel.agregar(req.torneo, req.params.parejaId, req.body || {}, autor(req))));
const modificar = h(async (req, res) => res.json(await plantel.modificar(req.torneo, req.params.parejaId, req.params.jugadorId, req.body || {}, autor(req))));
const eliminar = h(async (req, res) => res.json(await plantel.eliminar(req.torneo, req.params.parejaId, req.params.jugadorId, autor(req))));
const historial = h(async (req, res) => res.json(await plantel.historial(req.torneo, req.params.parejaId)));

/** GET /club/:complexId/torneos-permisos — permisos granulares del usuario actual (para la UI). */
const misPermisos = (req, res) => res.json({ permisos: permisosDe(req), catalogo: PERMISOS });

module.exports = { listar, agregar, modificar, eliminar, historial, misPermisos };
