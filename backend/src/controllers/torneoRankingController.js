'use strict';
/**
 * controllers/torneoRankingController.js
 * Ligas, jugadores y ranking anual por liga + categoría + año (+ género del circuito).
 * Los puntos se suman solos al finalizar cada categoría de un torneo anual; acá se
 * consultan y se ajustan a mano con auditoría (ranking_ajustes).
 *
 * Rutas (/api/torneos/club/:complexId):
 *   GET    /ligas · POST /ligas · PUT /ligas/:id · DELETE /ligas/:id   (escrituras: admin del club)
 *   GET    /categorias
 *   GET    /jugadores?q&liga_id&categoria_id&genero&temporada           TODOS los jugadores (también con 0 puntos)
 *   GET    /ranking?liga_id&categoria_id&temporada&genero                ranking de UNA combinación
 *   POST   /ranking/ajustes   { jugador_id|dni+nombre, liga_id, categoria_id, genero, temporada, tipo, puntos, motivo }
 *   GET    /ranking/ajustes?jugador_id&liga_id&categoria_id&temporada     historial (auditoría)
 *   PUT    /ranking           (compatibilidad) = ajuste 'fijar'
 *   DELETE /ranking/:id       pone en 0 la combinación (con auditoría, no borra)
 */
const { RankingPunto } = require('../models');
const rk = require('../services/torneos/rankingService');
const anual = require('../services/torneos/rankingAnualService');

const send = (res, err) => {
  if (!err.status) console.error('[ranking]', err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Error interno del ranking.' });
};
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { send(res, err); } };
/** Quién hace el cambio (admin del club u organizador) para la auditoría. */
const autor = (req) => (req.user
  ? { id: req.user.id, nombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.email }
  : req.organizador ? { id: null, nombre: `Organizador ${req.organizador.nombre || req.organizador.id}` } : { nombre: 'desconocido' });

const ligas = h(async (req, res) => res.json(await rk.ligas(req.clubId, { soloActivas: req.query.activas === '1' })));
const crearLiga = h(async (req, res) => res.status(201).json(await rk.crearLiga(req.clubId, req.body)));
const actualizarLiga = h(async (req, res) => res.json(await rk.actualizarLiga(req.clubId, Number(req.params.id), req.body)));
const eliminarLiga = h(async (req, res) => res.json(await rk.eliminarLiga(req.clubId, Number(req.params.id))));
const categorias = h(async (_req, res) => res.json(await rk.categorias()));
const jugadores = h(async (req, res) => res.json(await rk.jugadoresConPuntos(req.clubId, req.query)));
// Tabla general: todos los jugadores (0 si nunca jugaron) con estadísticas de la temporada
const list = h(async (req, res) => res.json(await anual.getRankingTable(req.clubId, req.query)));

// Temporadas y configuración de puntos por instancia (temporada + categoría)
const temporadas = h(async (req, res) => res.json(await anual.temporadas(req.clubId)));
const crearTemporada = h(async (req, res) => res.status(201).json(await anual.crearTemporada(req.clubId, req.body || {})));
const actualizarTemporada = h(async (req, res) => res.json(await anual.actualizarTemporada(req.clubId, Number(req.params.id), req.body || {})));
const config = h(async (req, res) => res.json(await anual.getConfig(req.clubId, req.query.temporada || new Date().getFullYear())));
const guardarConfig = h(async (req, res) => res.json(await anual.saveConfig(req.clubId, req.params.temporada, req.params.categoriaId, req.body?.puntos, autor(req))));

// Recálculo global (job en segundo plano con progreso)
const recalcular = h(async (req, res) => res.status(202).json(anual.recalculateSeasonRanking(req.clubId, { temporada: req.body?.temporada }, autor(req))));
const estadoRecalculo = h(async (req, res) => res.json(anual.estadoRecalculo(req.clubId, req.params.id)));
const ajuste = h(async (req, res) => {
  const r = await rk.ajusteManual(req.clubId, req.body || {}, autor(req));
  res.status(201).json({ anterior: r.anterior, nuevo: r.nuevo, ranking: r.ranking });
});
const historial = h(async (req, res) => res.json(await rk.historial(req.clubId, req.query)));

/** Compatibilidad con el cliente anterior (PUT /ranking): fija el puntaje. */
const upsert = h(async (req, res) => {
  const r = await rk.ajusteManual(req.clubId, { ...req.body, categoria_id: req.body?.categoria_id ?? req.body?.categoria, tipo: 'fijar', motivo: req.body?.motivo || 'Ajuste manual (fijar puntaje)' }, autor(req));
  res.json(r.ranking);
});

/** Nunca borra: deja la combinación en 0 y lo registra. */
const remove = h(async (req, res) => {
  const fila = await RankingPunto.findOne({ where: { id: req.params.id, id_tenant: req.clubId } });
  if (!fila) return res.status(404).json({ message: 'Jugador no encontrado en el ranking' });
  const { jugador_id, liga_id, categoria_id, genero, temporada } = fila;
  await RankingPunto.sequelize.transaction(t => rk.moverPuntos(req.clubId, { jugador_id, liga_id, categoria_id, genero, temporada },
    { tipo: 'baja', valor: 0, motivo: req.body?.motivo || 'Quitado del ranking', usuario: autor(req) }, t));
  res.json({ ok: true });
});

module.exports = {
  ligas, crearLiga, actualizarLiga, eliminarLiga, categorias, jugadores, list, ajuste, historial, upsert, remove,
  temporadas, crearTemporada, actualizarTemporada, config, guardarConfig, recalcular, estadoRecalculo,
};
