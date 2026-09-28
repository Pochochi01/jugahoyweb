'use strict';
/**
 * controllers/torneoRankingController.js
 * Ranking anual del club (base del armado de zonas de los torneos 'anual').
 * Clave: temporada + categoría + género del circuito + DNI.
 * Los puntos se suman solos al finalizar cada torneo anual; acá se consultan
 * y se ajustan a mano (altas de jugadores con puntos de arrastre, correcciones).
 *
 * Rutas: /api/torneos/club/:complexId/ranking
 */
const { RankingJugador } = require('../models');
const svc = require('../services/torneos/torneoService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });
const GENEROS = ['masculino', 'femenino', 'mixto'];

function filtro(q) {
  const temporada = Number(q.temporada) || new Date().getFullYear();
  const categoria = Number(q.categoria);
  if (!(categoria >= 1 && categoria <= 8)) throw svc.httpError(400, 'Categoría inválida (1ª a 8ª).');
  if (!GENEROS.includes(q.genero)) throw svc.httpError(400, 'Género inválido.');
  return { temporada, categoria, genero: q.genero };
}

/** GET ?temporada&categoria&genero → ranking ordenado por puntos. */
async function list(req, res) {
  try {
    const f = filtro(req.query);
    const filas = await RankingJugador.findAll({
      where: { id_tenant: req.clubId, ...f },
      order: [['puntos', 'DESC'], ['nombre', 'ASC']],
    });
    res.json({ ...f, puntos_por_instancia: svc.PUNTOS_INSTANCIA, jugadores: filas.map((r, i) => ({ ...r.toJSON(), posicion: i + 1 })) });
  } catch (err) { send(res, err); }
}

/** PUT { temporada, categoria, genero, dni, nombre, puntos } → alta o ajuste. */
async function upsert(req, res) {
  try {
    const f = filtro(req.body || {});
    const dni = String(req.body.dni || '').replace(/\D/g, '');
    const nombre = String(req.body.nombre || '').trim();
    const puntos = Number(req.body.puntos);
    if (!/^\d{7,9}$/.test(dni)) throw svc.httpError(400, 'DNI inválido.');
    if (nombre.length < 3) throw svc.httpError(400, 'Nombre requerido.');
    if (!Number.isInteger(puntos) || puntos < 0) throw svc.httpError(400, 'Los puntos deben ser un entero ≥ 0.');
    const [fila, creado] = await RankingJugador.findOrCreate({
      where: { id_tenant: req.clubId, ...f, dni }, defaults: { nombre, puntos },
    });
    if (!creado) await fila.update({ nombre, puntos });
    res.status(creado ? 201 : 200).json(fila);
  } catch (err) { send(res, err); }
}

async function remove(req, res) {
  const n = await RankingJugador.destroy({ where: { id: req.params.id, id_tenant: req.clubId } });
  if (!n) return res.status(404).json({ message: 'Jugador no encontrado en el ranking' });
  res.json({ ok: true });
}

module.exports = { list, upsert, remove };
