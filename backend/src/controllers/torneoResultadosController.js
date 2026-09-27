'use strict';
/**
 * controllers/torneoResultadosController.js
 * Carga / corrección / borrado de resultados. La lógica (tabla de posiciones,
 * avance en la llave, armado automático de cruces, avisos) vive en torneoService.
 */
const { Op } = require('sequelize');
const { TorneoPartido, TorneoResultado } = require('../models');
const svc = require('../services/torneos/torneoService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

async function list(req, res) {
  try {
    const where = { torneo_id: req.torneo.id, es_bye: false };
    if (req.query.ronda) where.ronda = req.query.ronda;
    if (req.query.pendientes === '1') where.estado = { [Op.notIn]: ['jugado', 'walkover'] };
    const partidos = await TorneoPartido.findAll({
      where, include: svc.incluirPartido(false), order: [['fecha', 'ASC'], ['hora', 'ASC']],
    });
    res.json(partidos);
  } catch (err) { send(res, err); }
}

/** PUT /partidos/:partidoId/resultado  body: { sets: [[6,3],[6,4]] } | { walkover_ganador: 1|2 } */
async function upsert(req, res) {
  try {
    if (!['zonas', 'llaves'].includes(req.torneo.estado) && req.torneo.estado !== 'finalizado') {
      return res.status(409).json({ message: 'El torneo no está en juego.' });
    }
    res.json(await svc.registrarResultado(req.torneo, req.params.partidoId, req.body || {}));
  } catch (err) { send(res, err); }
}

/** Borra un resultado de zona (solo antes de armar la llave). */
async function remove(req, res) {
  try {
    const p = await TorneoPartido.findOne({ where: { id: req.params.partidoId, torneo_id: req.torneo.id } });
    if (!p) return res.status(404).json({ message: 'Partido no encontrado' });
    if (p.ronda !== 'zona' || req.torneo.estado !== 'zonas') {
      return res.status(409).json({ message: 'Solo se pueden borrar resultados de zona antes de generar la llave.' });
    }
    await TorneoResultado.destroy({ where: { partido_id: p.id } });
    await p.update({ estado: p.fecha ? 'programado' : 'pendiente' });
    res.json({ ok: true });
  } catch (err) { send(res, err); }
}

module.exports = { list, upsert, remove };
