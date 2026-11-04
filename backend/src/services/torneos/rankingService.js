'use strict';
/**
 * services/torneos/rankingService.js — Ligas, registro de jugadores y ranking por liga.
 *
 * Regla central: los puntos viven en UN acumulador por
 *   jugador + liga + categoría + género del circuito + temporada (ranking_puntos, índice único).
 * Ninguna consulta suma acumuladores entre sí: cada ranking filtra la combinación completa.
 * Todo cambio de puntos (torneo, ajuste manual) deja una fila en ranking_ajustes.
 */
const { Op } = require('sequelize');
const { sequelize, TorneoLiga, PadelCategoria, PadelJugador, RankingPunto, RankingAjuste, Torneo } = require('../../models');
const { GENEROS } = require('../../models/torneoLigas');

function httpError(status, message) { return Object.assign(new Error(message), { status }); }
const nombreCat = (n) => `${n}${{ 1: 'ra', 2: 'da', 3: 'ra', 4: 'ta', 5: 'ta', 6: 'ta', 7: 'ma', 8: 'va' }[n] || 'ª'}`;

// ── Ligas ───────────────────────────────────────────────────────────────────
async function ligas(clubId, { soloActivas = false } = {}) {
  return TorneoLiga.findAll({ where: { id_tenant: clubId, ...(soloActivas && { estado: 'activa' }) }, order: [['estado', 'ASC'], ['nombre', 'ASC']] });
}

function validarLiga(body) {
  const nombre = String(body?.nombre || '').trim();
  if (nombre.length < 3 || nombre.length > 100) throw httpError(400, 'El nombre de la liga debe tener entre 3 y 100 caracteres.');
  const estado = body?.estado ?? 'activa';
  if (!['activa', 'inactiva'].includes(estado)) throw httpError(400, 'Estado de liga inválido.');
  return { nombre, estado };
}

async function crearLiga(clubId, body) {
  const d = validarLiga(body);
  if (await TorneoLiga.count({ where: { id_tenant: clubId, nombre: d.nombre } })) throw httpError(409, 'Ya existe una liga con ese nombre.');
  return TorneoLiga.create({ ...d, id_tenant: clubId });
}

async function actualizarLiga(clubId, id, body) {
  const liga = await ligaDelClub(clubId, id);
  const d = validarLiga({ nombre: liga.nombre, estado: liga.estado, ...body });
  if (d.nombre !== liga.nombre && await TorneoLiga.count({ where: { id_tenant: clubId, nombre: d.nombre, id: { [Op.ne]: id } } })) throw httpError(409, 'Ya existe una liga con ese nombre.');
  return liga.update(d);
}

async function eliminarLiga(clubId, id) {
  const liga = await ligaDelClub(clubId, id);
  const usada = await Torneo.count({ where: { liga_id: id } }) + await RankingPunto.count({ where: { liga_id: id } });
  if (usada) { await liga.update({ estado: 'inactiva' }); return { desactivada: true }; }
  await liga.destroy();
  return { eliminada: true };
}

/** La liga existe y es del club (lanza 400 si no). */
async function ligaDelClub(clubId, ligaId, { activa = false } = {}) {
  const liga = ligaId ? await TorneoLiga.findOne({ where: { id: Number(ligaId), id_tenant: clubId } }) : null;
  if (!liga) throw httpError(400, 'Liga inválida: elegí una liga del club.');
  if (activa && liga.estado !== 'activa') throw httpError(400, `La liga "${liga.nombre}" está inactiva.`);
  return liga;
}

const categorias = () => PadelCategoria.findAll({ where: { estado: 'activa' }, order: [['id', 'DESC']] });   // 8va → 1ra

/** Valida la lista de categorías de un torneo: 1..N, sin duplicados, existentes. */
async function validarCategorias(lista) {
  const ids = (Array.isArray(lista) ? lista : []).map(Number);
  if (!ids.length) throw httpError(400, 'Elegí al menos una categoría.');
  if (ids.some(n => !Number.isInteger(n) || n < 1 || n > 8)) throw httpError(400, 'Categoría inválida (1ª a 8ª).');
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Hay categorías repetidas en el torneo.');
  const existentes = await PadelCategoria.count({ where: { id: ids, estado: 'activa' } });
  if (existentes !== ids.length) throw httpError(400, 'Alguna categoría no está disponible.');
  return [...ids].sort((a, b) => b - a);
}

// ── Jugadores ───────────────────────────────────────────────────────────────
/** Alta/actualización del registro único del jugador por DNI (en la inscripción o a mano). */
async function upsertJugador(clubId, { dni, nombre, whatsapp, email, genero, categoria }, transaction) {
  const limpio = String(dni || '').replace(/\D/g, '');
  if (!/^\d{7,9}$/.test(limpio)) throw httpError(400, 'DNI inválido.');
  const [j, creado] = await PadelJugador.findOrCreate({
    where: { id_tenant: clubId, dni: limpio },
    defaults: { id_tenant: clubId, dni: limpio, nombre, whatsapp: whatsapp || null, email: email || null, genero: genero || null, categoria_actual: categoria || null },
    transaction,
  });
  if (!creado) {
    const patch = {};
    if (nombre && nombre !== j.nombre) patch.nombre = nombre;
    if (whatsapp) patch.whatsapp = whatsapp;
    if (email) patch.email = email;
    if (genero) patch.genero = genero;
    if (categoria) patch.categoria_actual = categoria;
    if (Object.keys(patch).length) await j.update(patch, { transaction });
  }
  return j;
}

/**
 * TODOS los jugadores del club (también los sin puntos) con sus puntos en la
 * combinación pedida. Sin liga/categoría → puntos = 0 (no se suman ligas).
 */
async function jugadoresConPuntos(clubId, { q, liga_id, categoria_id, genero, temporada, limite = 50 } = {}) {
  const where = { id_tenant: clubId };
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where[Op.or] = [{ nombre: { [Op.like]: like } }, { dni: { [Op.like]: like } }];
  }
  const jugadores = await PadelJugador.findAll({ where, order: [['nombre', 'ASC']], limit: Math.min(Number(limite) || 50, 500) });
  const combinacion = liga_id && categoria_id;
  const puntos = combinacion && jugadores.length ? await RankingPunto.findAll({
    where: { jugador_id: jugadores.map(j => j.id), liga_id, categoria_id, temporada: temporada || new Date().getFullYear(), ...(genero && { genero }) },
    attributes: ['jugador_id', 'genero', 'puntos'], raw: true,
  }) : [];
  const liga = liga_id ? await TorneoLiga.findByPk(liga_id, { attributes: ['id', 'nombre'] }) : null;
  return jugadores.map(j => {
    const p = puntos.filter(x => x.jugador_id === j.id);
    return {
      id: j.id, dni: j.dni, nombre: j.nombre, whatsapp: j.whatsapp, email: j.email, genero: j.genero,
      categoria_actual: j.categoria_actual, categoria_label: j.categoria_actual ? nombreCat(j.categoria_actual) : null,
      liga: liga?.nombre || null, puntos: p.length ? Math.max(...p.map(x => x.puntos)) : 0,
    };
  });
}

// ── Ranking ─────────────────────────────────────────────────────────────────
function filtroRanking(q = {}) {
  const liga_id = Number(q.liga_id);
  const categoria_id = Number(q.categoria_id ?? q.categoria);
  const temporada = Number(q.temporada || q.anio) || new Date().getFullYear();
  if (!Number.isInteger(liga_id) || liga_id <= 0) throw httpError(400, 'Elegí la liga: el ranking nunca mezcla ligas.');
  if (!(categoria_id >= 1 && categoria_id <= 8)) throw httpError(400, 'Elegí la categoría (1ª a 8ª).');
  if (temporada < 2000 || temporada > 2100) throw httpError(400, 'Año inválido.');
  const genero = q.genero || null;
  if (genero && !GENEROS.includes(genero)) throw httpError(400, 'Género inválido.');
  return { liga_id, categoria_id, temporada, genero };
}

/** Ranking de UNA combinación liga + categoría + año (+ género). */
async function ranking(clubId, q) {
  const f = filtroRanking(q);
  const liga = await ligaDelClub(clubId, f.liga_id);
  const filas = await RankingPunto.findAll({
    where: { id_tenant: clubId, liga_id: f.liga_id, categoria_id: f.categoria_id, temporada: f.temporada, ...(f.genero && { genero: f.genero }) },
    include: [{ model: PadelJugador, as: 'jugador', attributes: ['id', 'dni', 'nombre'] }],
    order: [['puntos', 'DESC'], [{ model: PadelJugador, as: 'jugador' }, 'nombre', 'ASC']],
  });
  // Posición con empates compartidos (1, 2, 2, 4)
  let pos = 0, prev = null;
  const jugadores = filas.map((r, i) => {
    if (r.puntos !== prev) { pos = i + 1; prev = r.puntos; }
    return { id: r.id, posicion: pos, jugador_id: r.jugador_id, dni: r.jugador?.dni, nombre: r.jugador?.nombre, genero: r.genero, puntos: r.puntos };
  });
  const anios = (await RankingPunto.findAll({ where: { id_tenant: clubId, liga_id: f.liga_id }, attributes: [[sequelize.fn('DISTINCT', sequelize.col('temporada')), 'temporada']], raw: true })).map(x => x.temporada);
  return { ...f, liga: { id: liga.id, nombre: liga.nombre }, categoria_label: nombreCat(f.categoria_id), temporadas: [...new Set([...anios, new Date().getFullYear()])].sort((a, b) => b - a), jugadores };
}

/** Puntos por DNI de una combinación (para cabezas de serie del torneo anual). */
async function puntosPorDni(clubId, { liga_id, categoria_id, genero, temporada }) {
  const filas = await RankingPunto.findAll({
    where: { id_tenant: clubId, liga_id, categoria_id, genero, temporada },
    include: [{ model: PadelJugador, as: 'jugador', attributes: ['dni'] }],
  });
  return new Map(filas.map(f => [f.jugador.dni, f.puntos]));
}

/**
 * Cambia el acumulador de UNA combinación y registra la auditoría.
 * tipo: 'fijar' (valor absoluto) | 'sumar' | 'restar' | 'torneo'.
 * Nunca deja puntos negativos.
 */
async function moverPuntos(clubId, { jugador_id, liga_id, categoria_id, genero, temporada }, { tipo, valor, motivo, torneo_id, usuario }, transaction) {
  const v = Number(valor);
  if (!Number.isInteger(v) || v < 0) throw httpError(400, 'Los puntos deben ser un entero mayor o igual a 0.');
  const [fila] = await RankingPunto.findOrCreate({
    where: { jugador_id, liga_id, categoria_id, genero, temporada },
    defaults: { id_tenant: clubId, jugador_id, liga_id, categoria_id, genero, temporada, puntos: 0 },
    transaction,
  });
  const actual = await RankingPunto.findByPk(fila.id, { transaction, lock: transaction?.LOCK.UPDATE });
  const anterior = actual.puntos;
  const nuevo = ['fijar', 'baja'].includes(tipo) ? v : tipo === 'restar' ? anterior - v : anterior + v;
  if (nuevo < 0) throw httpError(400, `No se pueden restar ${v} puntos: el jugador tiene ${anterior}.`);
  await actual.update({ puntos: nuevo }, { transaction });
  await RankingAjuste.create({
    id_tenant: clubId, ranking_id: actual.id, jugador_id, liga_id, categoria_id, genero, temporada,
    puntos_anterior: anterior, puntos_nuevo: nuevo, tipo, motivo: motivo || null, torneo_id: torneo_id || null,
    usuario_id: usuario?.id || null, usuario: usuario?.nombre || null,
  }, { transaction });
  return { ranking: actual, anterior, nuevo };
}

/** Ajuste manual desde el panel (Administración → Rankings → Ajuste manual). */
async function ajusteManual(clubId, body, usuario) {
  const f = filtroRanking(body);
  if (!f.genero) throw httpError(400, 'Elegí el género del circuito (masculino, femenino o mixto).');
  await ligaDelClub(clubId, f.liga_id);
  const tipo = body.tipo;
  if (!['fijar', 'sumar', 'restar'].includes(tipo)) throw httpError(400, 'Tipo de ajuste inválido (fijar, sumar, restar).');
  const motivo = String(body.motivo || '').trim();
  if (motivo.length < 5) throw httpError(400, 'Registrá el motivo del ajuste (mínimo 5 caracteres).');
  let jugadorId = Number(body.jugador_id);
  return sequelize.transaction(async (t) => {
    if (!jugadorId) {
      // Alta de un jugador nuevo con puntos históricos
      const nombre = String(body.nombre || '').trim();
      if (nombre.length < 3) throw httpError(400, 'Nombre del jugador requerido.');
      jugadorId = (await upsertJugador(clubId, { dni: body.dni, nombre, categoria: f.categoria_id }, t)).id;
    } else if (!(await PadelJugador.count({ where: { id: jugadorId, id_tenant: clubId }, transaction: t }))) {
      throw httpError(404, 'Jugador no encontrado.');
    }
    const r = await moverPuntos(clubId, { jugador_id: jugadorId, ...f }, { tipo, valor: body.puntos, motivo, usuario }, t);
    console.log(`[ranking] ajuste ${tipo} · club ${clubId} · jugador ${jugadorId} · liga ${f.liga_id} · ${f.categoria_id}ª ${f.genero} ${f.temporada}: ${r.anterior} → ${r.nuevo} · ${usuario?.nombre || '?'} · "${motivo}"`);
    return r;
  });
}

/** Historial de ajustes (auditoría) con filtros. */
async function historial(clubId, q = {}) {
  const where = { id_tenant: clubId };
  for (const k of ['jugador_id', 'liga_id', 'categoria_id', 'temporada']) if (q[k]) where[k] = Number(q[k]);
  if (q.tipo) where.tipo = q.tipo;
  return RankingAjuste.findAll({
    where, include: [{ model: PadelJugador, as: 'jugador', attributes: ['nombre', 'dni'] }, { model: TorneoLiga, as: 'liga', attributes: ['nombre'] }],
    order: [['id', 'DESC']], limit: Math.min(Number(q.limite) || 200, 1000),
  });
}

/** Una liga por defecto para clubes sin ligas (alta de torneos desde clientes viejos). */
async function ligaPorDefecto(clubId, transaction) {
  const [liga] = await TorneoLiga.findOrCreate({ where: { id_tenant: clubId, nombre: 'Liga general' }, defaults: { id_tenant: clubId, nombre: 'Liga general', estado: 'activa' }, transaction });
  return liga;
}

module.exports = {
  httpError, nombreCat, ligas, crearLiga, actualizarLiga, eliminarLiga, ligaDelClub, ligaPorDefecto, categorias, validarCategorias,
  upsertJugador, jugadoresConPuntos, filtroRanking, ranking, puntosPorDni, moverPuntos, ajusteManual, historial,
};
