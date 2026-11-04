'use strict';
/**
 * services/torneos/rankingAnualService.js — RankingService del ranking anual de ligas.
 *
 * Modelo:
 *   ranking_resultados  instancia + puntos de cada jugador en cada torneo/categoría (único →
 *                       un torneo nunca suma dos veces). Base de las estadísticas.
 *   ranking_puntos      acumulador por jugador + liga + categoría + género + temporada:
 *                       puntos = max(0, puntos_torneos + ajuste_manual)
 *                       puntos_torneos = SUM(ranking_resultados.puntos) de la combinación
 *   ranking_configuracion  puntos por instancia, por temporada + categoría (editables)
 *   ranking_ajustes     historial de TODO cambio (torneo, manual, recálculo)
 *
 * Métodos: getConfig / saveConfig, calcularInstancias, applyTournamentPoints,
 * calculatePlayerRanking (recompone una combinación), updatePlayerScore (manual),
 * getRankingTable, getRankingHistory, recalculateSeasonRanking (job con progreso).
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Torneo, TorneoCategoria, TorneoPareja, TorneoJugador, TorneoPartido, TorneoResultado, Complex,
  PadelJugador, RankingPunto, RankingAjuste, RankingTemporada, RankingConfiguracion, RankingResultado, TorneoLiga,
} = require('../../models');
const { INSTANCIAS, CAMPOS_PUNTOS, GENEROS } = require('../../models/torneoLigas');
const rk = require('./rankingService');

const httpError = rk.httpError;
// Valores iniciales de una temporada nueva (los fijos anteriores; luego se editan desde el panel)
const DEFAULTS = { zona: 10, '16avos': 15, octavos: 25, cuartos: 35, semifinal: 50, final: 70, campeon: 100 };
const ORDEN = ['zona', '16avos', 'octavos', 'cuartos', 'semifinal', 'final', 'campeon'];
const temporadaDe = (torneo) => Number(String(torneo.fecha_inicio).slice(0, 4));
const n0 = (v) => Number(v) || 0;   // COALESCE(v, 0)

// ── Temporadas y configuración ──────────────────────────────────────────────
/** Temporada del club para un año (la crea con la configuración del año anterior o por defecto). */
async function asegurarTemporada(clubId, anio, transaction) {
  const a = Number(anio);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) throw httpError(400, 'Año de temporada inválido.');
  const [temp, creada] = await RankingTemporada.findOrCreate({
    where: { id_tenant: clubId, anio: a }, defaults: { id_tenant: clubId, anio: a, nombre: `Temporada ${a}`, estado: 'activa' }, transaction,
  });
  if (creada || !(await RankingConfiguracion.count({ where: { temporada_id: temp.id }, transaction }))) {
    // Copia la configuración de la temporada anterior más cercana (si hay); si no, los valores por defecto
    const previa = await RankingTemporada.findOne({ where: { id_tenant: clubId, anio: { [Op.lt]: a } }, order: [['anio', 'DESC']], transaction });
    const base = previa ? await RankingConfiguracion.findAll({ where: { temporada_id: previa.id }, raw: true, transaction }) : [];
    const filas = [];
    for (let c = 1; c <= 8; c++) {
      const b = base.find(x => x.categoria_id === c);
      filas.push({ temporada_id: temp.id, categoria_id: c, ...Object.fromEntries(INSTANCIAS.map(i => [CAMPOS_PUNTOS[i], b ? b[CAMPOS_PUNTOS[i]] : DEFAULTS[i]])) });
    }
    await RankingConfiguracion.bulkCreate(filas, { ignoreDuplicates: true, transaction });
  }
  return temp;
}

async function temporadas(clubId) {
  await asegurarTemporada(clubId, new Date().getFullYear());
  return RankingTemporada.findAll({ where: { id_tenant: clubId }, order: [['anio', 'DESC']] });
}

async function crearTemporada(clubId, { anio, nombre }) {
  if (await RankingTemporada.count({ where: { id_tenant: clubId, anio: Number(anio) } })) throw httpError(409, `La temporada ${anio} ya existe.`);
  const t = await asegurarTemporada(clubId, anio);
  if (nombre && String(nombre).trim()) await t.update({ nombre: String(nombre).trim().slice(0, 60) });
  return t;
}

async function actualizarTemporada(clubId, id, { nombre, estado }) {
  const t = await RankingTemporada.findOne({ where: { id, id_tenant: clubId } });
  if (!t) throw httpError(404, 'Temporada no encontrada.');
  if (estado !== undefined && !['activa', 'cerrada'].includes(estado)) throw httpError(400, 'Estado inválido (activa o cerrada).');
  await t.update({ ...(nombre && { nombre: String(nombre).trim().slice(0, 60) }), ...(estado && { estado }) });
  return t;
}

/** Configuración de puntos de una temporada (todas las categorías, 8va → 1ra). */
async function getConfig(clubId, anio) {
  const temp = await asegurarTemporada(clubId, anio);
  const filas = await RankingConfiguracion.findAll({ where: { temporada_id: temp.id }, order: [['categoria_id', 'DESC']] });
  return {
    temporada: temp, instancias: INSTANCIAS,
    categorias: filas.map(f => ({ categoria_id: f.categoria_id, nombre: rk.nombreCat(f.categoria_id), puntos: Object.fromEntries(INSTANCIAS.map(i => [i, f[CAMPOS_PUNTOS[i]]])), updated_by: f.updated_by, updatedAt: f.updatedAt })),
  };
}

/** Puntos por instancia { zona, 16avos, …, campeon } para una temporada + categoría. */
async function puntosPorInstancia(clubId, anio, categoriaId, transaction) {
  const temp = await asegurarTemporada(clubId, anio, transaction);
  const f = await RankingConfiguracion.findOne({ where: { temporada_id: temp.id, categoria_id: categoriaId }, transaction });
  return Object.fromEntries(INSTANCIAS.map(i => [i, f ? f[CAMPOS_PUNTOS[i]] : DEFAULTS[i]]));
}

/** Guarda los puntos de una categoría (enteros ≥ 0). Impacta en los próximos cálculos y en "Recalcular". */
async function saveConfig(clubId, anio, categoriaId, puntos, usuario) {
  const cat = Number(categoriaId);
  if (!(cat >= 1 && cat <= 8)) throw httpError(400, 'Categoría inválida.');
  const temp = await asegurarTemporada(clubId, anio);
  if (temp.estado === 'cerrada') throw httpError(409, `La temporada ${temp.anio} está cerrada.`);
  const patch = {};
  for (const i of INSTANCIAS) {
    if (puntos?.[i] === undefined) continue;
    const v = Number(puntos[i]);
    if (!Number.isInteger(v) || v < 0 || v > 100000) throw httpError(400, `Puntos de "${i}" inválidos: entero mayor o igual a 0.`);
    patch[CAMPOS_PUNTOS[i]] = v;
  }
  if (!Object.keys(patch).length) throw httpError(400, 'No hay puntos para guardar.');
  const [fila] = await RankingConfiguracion.findOrCreate({ where: { temporada_id: temp.id, categoria_id: cat }, defaults: { temporada_id: temp.id, categoria_id: cat } });
  await fila.update({ ...patch, updated_by: usuario?.nombre || null });
  console.log(`[ranking] configuración ${temp.anio} · ${rk.nombreCat(cat)} actualizada por ${usuario?.nombre || '?'}: ${JSON.stringify(patch)}`);
  return getConfig(clubId, anio);
}

// ── Puntos de torneos ───────────────────────────────────────────────────────
/** Instancia máxima alcanzada por cada pareja de una categoría (zona … campeon). */
async function calcularInstancias(torneo, cat, transaction) {
  const [partidos, parejas] = await Promise.all([
    TorneoPartido.findAll({ where: { torneo_id: torneo.id, categoria_id: cat, es_bye: false }, include: [{ model: TorneoResultado, as: 'resultado' }], transaction }),
    TorneoPareja.findAll({ where: { torneo_id: torneo.id, categoria_id: cat, zona_id: { [Op.ne]: null } }, include: [{ model: TorneoJugador, as: 'jugadores' }], transaction }),
  ]);
  const instancia = new Map(parejas.map(p => [p.id, 'zona']));
  for (const m of partidos) {
    for (const pid of [m.pareja1_id, m.pareja2_id]) {
      if (pid && instancia.has(pid) && ORDEN.indexOf(m.ronda) > ORDEN.indexOf(instancia.get(pid))) instancia.set(pid, m.ronda);
    }
    if (m.ronda === 'final' && m.resultado?.ganador_id) instancia.set(m.resultado.ganador_id, 'campeon');
  }
  return { parejas, instancia };
}

/**
 * Recompone UNA combinación: puntos_torneos = SUM(resultados); puntos = max(0, torneos + ajuste).
 * Registra el cambio en el historial si el total cambió.
 */
async function calculatePlayerRanking(clubId, combinacion, { tipo, motivo, torneo_id, usuario } = {}, transaction) {
  const { jugador_id, liga_id, categoria_id, genero, temporada } = combinacion;
  const suma = n0(await RankingResultado.sum('puntos', { where: { jugador_id, liga_id, categoria_id, genero, temporada }, transaction }));
  const [fila] = await RankingPunto.findOrCreate({
    where: { jugador_id, liga_id, categoria_id, genero, temporada },
    defaults: { id_tenant: clubId, jugador_id, liga_id, categoria_id, genero, temporada, puntos: 0, puntos_torneos: 0, ajuste_manual: 0 }, transaction,
  });
  const actual = await RankingPunto.findByPk(fila.id, { transaction, lock: transaction?.LOCK.UPDATE });
  const anterior = actual.puntos;
  const nuevo = Math.max(0, suma + n0(actual.ajuste_manual));
  if (nuevo === anterior && suma === actual.puntos_torneos) return { anterior, nuevo, cambio: false };
  await actual.update({ puntos: nuevo, puntos_torneos: suma }, { transaction });
  if (nuevo !== anterior) {
    await RankingAjuste.create({
      id_tenant: clubId, ranking_id: actual.id, ...combinacion, puntos_anterior: anterior, puntos_nuevo: nuevo,
      tipo, motivo: motivo || null, torneo_id: torneo_id || null, usuario_id: usuario?.id || null, usuario: usuario?.nombre || 'sistema',
    }, { transaction });
  }
  return { anterior, nuevo, cambio: nuevo !== anterior };
}

/**
 * Aplica los puntos de una categoría finalizada (idempotente): escribe ranking_resultados
 * (índice único torneo + categoría + jugador → nunca suma dos veces) y recompone cada combinación.
 * @param {object} opts  { reemplazar: true } recalcula aunque ya estuviera procesado (recálculo global)
 */
async function applyTournamentPoints(torneo, tc, transaction, { reemplazar = false, usuario } = {}) {
  if (torneo.tipo !== 'anual') return { aplicados: 0 };
  const cat = tc.categoria_id;
  const temporada = temporadaDe(torneo);
  const ya = await RankingResultado.count({ where: { torneo_id: torneo.id, categoria_id: cat }, transaction });
  if (ya && !reemplazar) return { aplicados: 0, ya_procesado: true };
  const pts = await puntosPorInstancia(torneo.id_tenant, temporada, cat, transaction);
  const { parejas, instancia } = await calcularInstancias(torneo, cat, transaction);
  const tipo = reemplazar ? 'recalculo' : 'torneo';
  const afectados = new Map();
  if (reemplazar) {
    for (const r of await RankingResultado.findAll({ where: { torneo_id: torneo.id, categoria_id: cat }, transaction })) afectados.set(r.jugador_id, r.genero);
    await RankingResultado.destroy({ where: { torneo_id: torneo.id, categoria_id: cat }, transaction });
  }
  const filas = [];
  for (const p of parejas) {
    const inst = instancia.get(p.id);
    for (const j of p.jugadores) {
      const jugadorId = j.jugador_id || (await rk.upsertJugador(torneo.id_tenant, j, transaction)).id;
      if (!j.jugador_id) await j.update({ jugador_id: jugadorId }, { transaction });
      filas.push({ id_tenant: torneo.id_tenant, torneo_id: torneo.id, categoria_id: cat, jugador_id: jugadorId, liga_id: torneo.liga_id, genero: torneo.genero, temporada, instancia: inst, puntos: pts[inst] || 0 });
      afectados.set(jugadorId, torneo.genero);
    }
  }
  await RankingResultado.bulkCreate(filas, { ignoreDuplicates: true, transaction });
  for (const [jugador_id, genero] of afectados) {
    const inst = filas.find(f => f.jugador_id === jugador_id)?.instancia;
    await calculatePlayerRanking(torneo.id_tenant, { jugador_id, liga_id: torneo.liga_id, categoria_id: cat, genero, temporada },
      { tipo, motivo: `${torneo.nombre} (${rk.nombreCat(cat)}): ${inst || 'sin participación'}`, torneo_id: torneo.id, usuario }, transaction);
  }
  return { aplicados: filas.length };
}

// ── Edición manual ──────────────────────────────────────────────────────────
/** Sumar / restar / fijar puntaje (con motivo y auditoría). El ajuste sobrevive a los recálculos. */
const updatePlayerScore = (clubId, body, usuario) => rk.ajusteManual(clubId, body, usuario);

// ── Tabla general ───────────────────────────────────────────────────────────
/**
 * Ranking general de una liga + categoría + temporada (+ circuito). Incluye a TODOS los
 * jugadores de la categoría en el club (categoría actual) y a los que tengan puntos o
 * resultados en la combinación; el que nunca jugó aparece con 0 en todo (COALESCE).
 * Estadísticas (desde ranking_resultados): torneos jugados, campeonatos, finales disputadas
 * (llegó a la final), semifinales disputadas (llegó a semifinal o más), último torneo.
 */
async function getRankingTable(clubId, q = {}) {
  const f = rk.filtroRanking(q);
  const liga = await rk.ligaDelClub(clubId, f.liga_id);
  const genero = f.genero || 'masculino';
  const generosJugador = genero === 'mixto' ? ['masculino', 'femenino'] : [genero];
  const r = { club: clubId, liga: f.liga_id, cat: f.categoria_id, temp: f.temporada, genero, generos: generosJugador };
  const filas = await sequelize.query(`
    SELECT j.id jugador_id, j.dni, j.nombre, j.categoria_actual,
      COALESCE(rp.id, NULL) ranking_id, COALESCE(rp.puntos, 0) puntos, COALESCE(rp.puntos_torneos, 0) puntos_torneos, COALESCE(rp.ajuste_manual, 0) ajuste_manual,
      COALESCE(s.torneos, 0) torneos_jugados, COALESCE(s.campeonatos, 0) campeonatos,
      COALESCE(s.finales, 0) finales, COALESCE(s.semifinales, 0) semifinales, s.ultimo_torneo_id
    FROM padel_jugadores j
    LEFT JOIN ranking_puntos rp ON rp.jugador_id = j.id AND rp.liga_id = :liga AND rp.categoria_id = :cat AND rp.temporada = :temp AND rp.genero = :genero
    LEFT JOIN (
      SELECT x.jugador_id, COUNT(DISTINCT x.torneo_id) torneos,
        SUM(x.instancia = 'campeon') campeonatos,
        SUM(x.instancia IN ('final', 'campeon')) finales,
        SUM(x.instancia IN ('semifinal', 'final', 'campeon')) semifinales,
        SUBSTRING_INDEX(GROUP_CONCAT(x.torneo_id ORDER BY t.fecha_fin DESC, x.torneo_id DESC), ',', 1) ultimo_torneo_id
      FROM ranking_resultados x JOIN torneos t ON t.id = x.torneo_id
      WHERE x.liga_id = :liga AND x.categoria_id = :cat AND x.temporada = :temp AND x.genero = :genero
      GROUP BY x.jugador_id
    ) s ON s.jugador_id = j.id
    WHERE j.id_tenant = :club
      AND (rp.id IS NOT NULL OR s.jugador_id IS NOT NULL OR (j.categoria_actual = :cat AND (j.genero IS NULL OR j.genero IN (:generos))))
    ORDER BY puntos DESC, campeonatos DESC, finales DESC, torneos_jugados DESC, j.nombre ASC`, { replacements: r, type: sequelize.QueryTypes.SELECT });

  const ultimos = [...new Set(filas.map(x => Number(x.ultimo_torneo_id)).filter(Boolean))];
  const torneos = ultimos.length ? await Torneo.findAll({ where: { id: ultimos }, attributes: ['id', 'nombre', 'fecha_fin'], raw: true }) : [];
  const club = await Complex.findByPk(clubId, { attributes: ['nombre'] });
  let pos = 0, prev = null;
  const jugadores = filas.map((x, i) => {
    const puntos = n0(x.puntos);
    if (puntos !== prev) { pos = i + 1; prev = puntos; }
    const ult = torneos.find(t => t.id === Number(x.ultimo_torneo_id));
    return {
      posicion: pos, jugador_id: x.jugador_id, ranking_id: x.ranking_id || null, dni: x.dni, nombre: x.nombre,
      categoria: x.categoria_actual ? rk.nombreCat(x.categoria_actual) : rk.nombreCat(f.categoria_id), club: club?.nombre || null,
      puntos, puntos_torneos: n0(x.puntos_torneos), ajuste_manual: n0(x.ajuste_manual),
      torneos_jugados: n0(x.torneos_jugados), campeonatos: n0(x.campeonatos), finales: n0(x.finales), semifinales: n0(x.semifinales),
      ultimo_torneo: ult ? { id: ult.id, nombre: ult.nombre, fecha: ult.fecha_fin } : null,
    };
  });
  const anios = await RankingTemporada.findAll({ where: { id_tenant: clubId }, attributes: ['anio'], order: [['anio', 'DESC']], raw: true });
  return { liga_id: f.liga_id, categoria_id: f.categoria_id, temporada: f.temporada, genero, liga: { id: liga.id, nombre: liga.nombre }, categoria_label: rk.nombreCat(f.categoria_id), temporadas: anios.map(a => a.anio), jugadores };
}

/** Historial de un jugador (o filtrado) — auditoría de cambios de puntos. */
const getRankingHistory = (clubId, q) => rk.historial(clubId, q);

/** Estadísticas por jugador en una combinación (siembra: desempates). */
async function statsPorJugador(clubId, { liga_id, categoria_id, genero, temporada }, jugadorIds) {
  if (!jugadorIds.length) return new Map();
  const filas = await sequelize.query(`
    SELECT jugador_id, COUNT(DISTINCT torneo_id) torneos, SUM(instancia = 'campeon') titulos, SUM(instancia IN ('final', 'campeon')) finales
    FROM ranking_resultados WHERE id_tenant = :club AND liga_id = :liga AND categoria_id = :cat AND genero = :genero AND temporada = :temp AND jugador_id IN (:ids)
    GROUP BY jugador_id`, { replacements: { club: clubId, liga: liga_id, cat: categoria_id, genero, temp: temporada, ids: jugadorIds }, type: sequelize.QueryTypes.SELECT });
  return new Map(filas.map(x => [x.jugador_id, { torneos: n0(x.torneos), titulos: n0(x.titulos), finales: n0(x.finales) }]));
}

// ── Recálculo global (job con progreso, sin bloquear) ───────────────────────
const jobs = new Map();   // id → { estado, total, procesados, combinaciones, cambios, errores, inicio, fin }

/**
 * Recalcula el ranking del club (o de una temporada): recorre los torneos anuales con
 * categorías finalizadas, vuelve a calcular cada torneo con la configuración vigente
 * (una transacción corta por torneo/categoría) y recompone todas las combinaciones.
 * Devuelve enseguida el id del job; el progreso se consulta con estadoRecalculo().
 */
function recalculateSeasonRanking(clubId, { temporada } = {}, usuario = {}) {
  const enCurso = [...jobs.values()].find(j => j.clubId === clubId && j.estado === 'en_curso');
  if (enCurso) throw httpError(409, 'Ya hay un recálculo en curso para este club.');
  const id = crypto.randomBytes(8).toString('hex');
  const job = { id, clubId, temporada: temporada ? Number(temporada) : null, estado: 'en_curso', total: 0, procesados: 0, combinaciones: 0, cambios: 0, errores: [], inicio: new Date(), usuario: usuario?.nombre || null };
  jobs.set(id, job);
  setImmediate(() => ejecutarRecalculo(job, usuario).catch(err => { job.estado = 'error'; job.errores.push(err.message); job.fin = new Date(); }));
  return { id, estado: job.estado };
}

async function ejecutarRecalculo(job, usuario) {
  const { clubId } = job;
  const whereT = { id_tenant: clubId, tipo: 'anual', ...(job.temporada && { fecha_inicio: { [Op.between]: [`${job.temporada}-01-01`, `${job.temporada}-12-31`] } }) };
  const cats = await TorneoCategoria.findAll({ where: { estado: 'finalizado' }, include: [{ model: Torneo, as: 'torneo', where: whereT }], order: [['torneo_id', 'ASC']] });
  job.total = cats.length;
  console.log(`[ranking] recálculo ${job.id} · club ${clubId}${job.temporada ? ` · ${job.temporada}` : ''}: ${cats.length} torneo-categorías · por ${job.usuario || '?'}`);
  for (const tc of cats) {
    try {
      await sequelize.transaction(t => applyTournamentPoints(tc.torneo, tc, t, { reemplazar: true, usuario }));
      await tc.update({ puntos_asignados: true });
    } catch (err) { job.errores.push(`Torneo ${tc.torneo_id} (${rk.nombreCat(tc.categoria_id)}): ${err.message}`); }
    job.procesados++;
    await new Promise(r => setImmediate(r));   // cede el event loop entre torneos
  }
  // Combinaciones sin torneos (solo ajustes) o con resultados borrados: recomponer todas
  const combos = await RankingPunto.findAll({ where: { id_tenant: clubId, ...(job.temporada && { temporada: job.temporada }) }, attributes: ['jugador_id', 'liga_id', 'categoria_id', 'genero', 'temporada'], raw: true });
  for (const c of combos) {
    const r = await sequelize.transaction(t => calculatePlayerRanking(clubId, c, { tipo: 'recalculo', motivo: 'Recálculo global con la configuración vigente', usuario }, t));
    job.combinaciones++;
    if (r.cambio) job.cambios++;
  }
  job.estado = job.errores.length ? 'con_errores' : 'completado';
  job.fin = new Date();
  console.log(`[ranking] recálculo ${job.id} terminado: ${job.procesados}/${job.total} torneos, ${job.combinaciones} combinaciones, ${job.cambios} con cambios, ${job.errores.length} errores`);
}

function estadoRecalculo(clubId, id) {
  const j = jobs.get(id);
  if (!j || j.clubId !== clubId) throw httpError(404, 'Recálculo no encontrado.');
  const { clubId: _c, ...publico } = j;
  return { ...publico, porcentaje: j.total ? Math.round((j.procesados / j.total) * 100) : (j.estado === 'en_curso' ? 0 : 100) };
}

module.exports = {
  DEFAULTS, INSTANCIAS, asegurarTemporada, temporadas, crearTemporada, actualizarTemporada, getConfig, saveConfig, puntosPorInstancia,
  calcularInstancias, calculatePlayerRanking, applyTournamentPoints, updatePlayerScore, getRankingTable, getRankingHistory,
  statsPorJugador, recalculateSeasonRanking, estadoRecalculo, temporadaDe, GENEROS, TorneoLiga,
};
