'use strict';
/**
 * services/playerPortalService.js — Portal de Jugador (100% SOLO LECTURA sobre torneos).
 *
 * Identidad: la PERSONA por DNI (un DNI puede jugar en varios clubes). Relación existente:
 *   torneo_jugadores.dni / padel_jugadores(dni).id = torneo_jugadores.jugador_id
 *     → torneo_parejas (pareja_id) → torneos (torneo_id) → torneo_ligas (liga_id)
 * player_tournament_index es una copia DERIVADA de esa relación (para consultar rápido por
 * dni / torneo / liga); se reconstruye desde torneo_jugadores y nunca es fuente de verdad.
 *
 * Visibilidad: torneos donde el DNI juega + torneos (no borrador) de las mismas ligas.
 * Lo único que este servicio escribe son las tablas propias del portal
 * (player_access, player_tournament_index, player_access_logs).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const m = require('../models');
const torneoSvc = require('./torneos/torneoService');
const rk = require('./torneos/rankingService');

const { PlayerAccess, PlayerTournamentIndex, PlayerAccessLog, Torneo, TorneoJugador, TorneoPareja, TorneoLiga, TorneoCategoria, PadelJugador, RankingPunto, Complex } = m;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const limpiarDni = (v) => String(v || '').replace(/\D/g, '').slice(0, 20);
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;
const INDICE_TTL_MS = 5 * 60 * 1000;
const ESTADOS_VISIBLES = ['inscripcion', 'zonas', 'llaves', 'finalizado', 'cancelado'];
const TORNEO_PUBLICO = ['id', 'id_tenant', 'liga_id', 'nombre', 'descripcion', 'categoria', 'genero', 'estado', 'fecha_inicio', 'fecha_fin', 'tipo', 'parejas_por_zona', 'clasifican_por_zona', 'imagen_evento'];

// ── Auditoría (no bloquea la respuesta) ───────────────────────
function log(req, accion, { dni, recurso, recurso_id, status } = {}) {
  PlayerAccessLog.create({
    dni: dni ?? req?.jugadorDni ?? null, accion, recurso: recurso ?? null,
    recurso_id: Number.isFinite(Number(recurso_id)) ? Number(recurso_id) : null, status: status ?? null,
    ip: String(req?.ip || '').slice(0, 64) || null, user_agent: String(req?.headers?.['user-agent'] || '').slice(0, 255) || null,
  }).catch(() => {});
}

// ── Índice DNI → torneos ──────────────────────────────────────
/** ¿Este DNI aparece como jugador en algún torneo? (directo o por padel_jugadores) */
async function jugadorIdsDe(dni) {
  return (await PadelJugador.findAll({ where: { dni }, attributes: ['id'], raw: true })).map(r => r.id);
}

/** Reconstruye el índice del DNI desde torneo_jugadores (3 consultas, sin N+1). */
async function reconstruirIndice(dni) {
  const pids = await jugadorIdsDe(dni);
  const jugadores = await TorneoJugador.findAll({
    where: { [Op.or]: [{ dni }, ...(pids.length ? [{ jugador_id: pids }] : [])] },
    attributes: ['pareja_id', 'jugador_id'], raw: true,
  });
  const parejas = jugadores.length ? await TorneoPareja.findAll({
    where: { id: [...new Set(jugadores.map(j => j.pareja_id))], estado_pago: { [Op.ne]: 'cancelado' } },
    attributes: ['id', 'torneo_id', 'categoria_id'], raw: true,
  }) : [];
  const torneos = parejas.length ? await Torneo.findAll({ where: { id: [...new Set(parejas.map(p => p.torneo_id))] }, attributes: ['id', 'id_tenant', 'liga_id', 'fecha_inicio'], raw: true }) : [];
  const filas = new Map();
  for (const p of parejas) {
    const t = torneos.find(x => x.id === p.torneo_id);
    if (!t || filas.has(t.id)) continue;
    const j = jugadores.find(x => x.pareja_id === p.id);
    filas.set(t.id, {
      dni, tournament_id: t.id, player_id: j?.jugador_id || null, pareja_id: p.id, categoria_id: p.categoria_id,
      league_id: t.liga_id, season_id: t.fecha_inicio ? Number(String(t.fecha_inicio).slice(0, 4)) : null, complex_id: t.id_tenant,
    });
  }
  await m.sequelize.transaction(async (transaction) => {
    await PlayerTournamentIndex.destroy({ where: { dni }, transaction });
    if (filas.size) await PlayerTournamentIndex.bulkCreate([...filas.values()], { transaction });
  });
  await PlayerAccess.update({ indice_actualizado: new Date() }, { where: { dni } });
  return [...filas.values()];
}

async function indiceDe(acceso) {
  const viejo = !acceso.indice_actualizado || Date.now() - new Date(acceso.indice_actualizado).getTime() > INDICE_TTL_MS;
  if (viejo) { await reconstruirIndice(acceso.dni); acceso.indice_actualizado = new Date(); }
  return PlayerTournamentIndex.findAll({ where: { dni: acceso.dni }, raw: true });
}

/** Ids de torneos visibles: jugados + de sus mismas ligas (no borrador). */
async function visibles(acceso) {
  const idx = await indiceDe(acceso);
  const jugados = new Set(idx.map(r => r.tournament_id));
  const ligas = [...new Set(idx.map(r => r.league_id).filter(Boolean))];
  const deLiga = ligas.length ? await Torneo.findAll({ where: { liga_id: ligas, estado: ESTADOS_VISIBLES }, attributes: ['id'], raw: true }) : [];
  return { idx, jugados, ligas: new Set(ligas), todos: new Set([...jugados, ...deLiga.map(t => t.id)]) };
}

async function exigirTorneo(acceso, torneoId) {
  const id = Number(torneoId);
  const v = await visibles(acceso);
  if (!v.todos.has(id)) throw httpError(403, 'No participás en este torneo ni en su liga.');
  const torneo = await Torneo.findByPk(id);
  if (!torneo) throw httpError(404, 'Torneo no encontrado');
  return { torneo, v, mia: v.idx.find(r => r.tournament_id === id) || null };
}

// ── Autenticación ─────────────────────────────────────────────
/**
 * Login con DNI. Si es la primera vez y el DNI juega algún torneo, se crea el acceso con
 * clave inicial = DNI y cambio obligatorio. Bloqueo temporal tras 5 intentos fallidos.
 */
async function login(dniRaw, password, req) {
  const dni = limpiarDni(dniRaw);
  if (!dni || !password) throw httpError(400, 'Ingresá DNI y contraseña.');
  let acceso = await PlayerAccess.findOne({ where: { dni } });
  if (!acceso) {
    const pids = await jugadorIdsDe(dni);
    const juega = await TorneoJugador.count({ where: { [Op.or]: [{ dni }, ...(pids.length ? [{ jugador_id: pids }] : [])] } });
    if (!juega || String(password) !== dni) { log(req, 'login_fail', { dni, status: 401 }); throw httpError(401, 'DNI o contraseña incorrectos'); }
    acceso = await PlayerAccess.create({ dni, password_hash: await bcrypt.hash(dni, 10), must_change_password: true });
  }
  if (!acceso.activo) { log(req, 'login_fail', { dni, status: 403 }); throw httpError(403, 'Tu acceso está deshabilitado. Consultá con el club.'); }
  if (acceso.bloqueado_hasta && new Date(acceso.bloqueado_hasta) > new Date()) {
    log(req, 'login_bloqueado', { dni, status: 429 });
    throw httpError(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
  }
  if (!(await bcrypt.compare(String(password), acceso.password_hash))) {
    const n = acceso.intentos_fallidos + 1;
    await acceso.update({ intentos_fallidos: n >= MAX_INTENTOS ? 0 : n, bloqueado_hasta: n >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MIN * 60000) : null });
    log(req, 'login_fail', { dni, status: 401 });
    throw httpError(401, 'DNI o contraseña incorrectos');
  }
  await acceso.update({ intentos_fallidos: 0, bloqueado_hasta: null, ultimo_login: new Date() });
  await reconstruirIndice(dni);
  log(req, 'login_ok', { dni, status: 200 });
  return acceso;
}

function validarClave(dni, nueva) {
  const p = String(nueva || '');
  if (p.length < 6) throw httpError(400, 'La contraseña debe tener al menos 6 caracteres.');
  if (p === dni) throw httpError(400, 'La contraseña no puede ser tu DNI.');
  return p;
}

async function cambiarClave(acceso, actual, nueva, req) {
  if (!(await bcrypt.compare(String(actual || ''), acceso.password_hash))) throw httpError(400, 'La contraseña actual no es correcta.');
  const p = validarClave(acceso.dni, nueva);
  await acceso.update({ password_hash: await bcrypt.hash(p, 10), must_change_password: false, reset_token_hash: null, reset_expira: null });
  log(req, 'password_change', { status: 200 });
}

/** Recuperación: envía un enlace (1 h) al email que el jugador dejó en sus inscripciones. */
async function solicitarRecuperacion(dniRaw, req) {
  const dni = limpiarDni(dniRaw);
  const acceso = dni && await PlayerAccess.findOne({ where: { dni, activo: true } });
  log(req, 'password_forgot', { dni: dni || null });
  if (!acceso) return;   // respuesta genérica: no revela si el DNI existe
  const conEmail = await PadelJugador.findOne({ where: { dni, email: { [Op.ne]: null } }, order: [['updated_at', 'DESC']], attributes: ['email', 'nombre'] })
    || await TorneoJugador.findOne({ where: { dni, email: { [Op.ne]: null } }, order: [['id', 'DESC']], attributes: ['email', 'nombre'] });
  if (!conEmail?.email) return;
  const token = crypto.randomBytes(32).toString('hex');
  await acceso.update({ reset_token_hash: sha(token), reset_expira: new Date(Date.now() + 60 * 60000) });
  const { frontendUrl } = require('../config/urls');
  const link = frontendUrl(`/jugador/recuperar?token=${token}`);
  const { sendMail } = require('../config/mailer');
  await sendMail({
    to: conEmail.email, subject: 'Recuperá tu acceso al Portal de Jugador',
    html: `<p>Hola ${conEmail.nombre || ''}:</p><p>Para elegir una nueva contraseña entrá a este enlace (vale 1 hora):</p><p><a href="${link}">${link}</a></p><p>Si no lo pediste, ignorá este correo.</p>`,
  }).catch(() => {});
}

async function restablecer(token, nueva, req) {
  const acceso = token && await PlayerAccess.findOne({ where: { reset_token_hash: sha(token), reset_expira: { [Op.gt]: new Date() } } });
  if (!acceso) throw httpError(400, 'El enlace no es válido o venció.');
  const p = validarClave(acceso.dni, nueva);
  await acceso.update({ password_hash: await bcrypt.hash(p, 10), must_change_password: false, reset_token_hash: null, reset_expira: null, intentos_fallidos: 0, bloqueado_hasta: null });
  log(req, 'password_reset', { dni: acceso.dni, status: 200 });
}

// ── Lecturas ──────────────────────────────────────────────────
async function serialTorneos(torneos, v) {
  if (!torneos.length) return [];
  const ids = torneos.map(t => t.id);
  const [cats, ligas, clubs] = await Promise.all([
    TorneoCategoria.findAll({ where: { torneo_id: ids }, attributes: ['torneo_id', 'categoria_id', 'estado'], raw: true }),
    TorneoLiga.findAll({ where: { id: [...new Set(torneos.map(t => t.liga_id))] }, attributes: ['id', 'nombre'], raw: true }),
    Complex.findAll({ where: { id: [...new Set(torneos.map(t => t.id_tenant))] }, attributes: ['id', 'nombre', 'ciudad'], raw: true }),
  ]);
  return torneos.map(t => {
    const mia = v.idx.find(r => r.tournament_id === t.id);
    return {
      ...Object.fromEntries(TORNEO_PUBLICO.map(k => [k, t[k]])),
      liga: ligas.find(l => l.id === t.liga_id) || null,
      club: clubs.find(c => c.id === t.id_tenant) || null,
      categorias: cats.filter(c => c.torneo_id === t.id).map(c => ({ categoria_id: c.categoria_id, nombre: rk.nombreCat(c.categoria_id), estado: c.estado })),
      participa: Boolean(mia), mi_categoria_id: mia?.categoria_id ?? null,
    };
  });
}

const pag = (q) => {
  const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
  const page = Math.max(1, Number(q.page) || 1);
  return { limit, page, offset: (page - 1) * limit };
};

async function dashboard(acceso) {
  const v = await visibles(acceso);
  const pids = await jugadorIdsDe(acceso.dni);
  const [fichas, ranking, proximos] = await Promise.all([
    PadelJugador.findAll({ where: { dni: acceso.dni }, attributes: ['id', 'id_tenant', 'nombre', 'categoria_actual', 'genero'], order: [['updated_at', 'DESC']], raw: true }),
    pids.length ? RankingPunto.findAll({ where: { jugador_id: pids }, order: [['temporada', 'DESC'], ['puntos', 'DESC']], limit: 10, raw: true }) : [],
    Torneo.findAll({ where: { id: [...v.jugados], estado: ['inscripcion', 'zonas', 'llaves'] }, order: [['fecha_inicio', 'ASC']], limit: 5 }),
  ]);
  const nombre = fichas[0]?.nombre || (await TorneoJugador.findOne({ where: { dni: acceso.dni }, attributes: ['nombre'], order: [['id', 'DESC']] }))?.nombre || '';
  const [clubs, ligas] = await Promise.all([
    Complex.findAll({ where: { id: [...new Set([...fichas.map(f => f.id_tenant), ...v.idx.map(r => r.complex_id)])] }, attributes: ['id', 'nombre', 'ciudad'], raw: true }),
    TorneoLiga.findAll({ where: { id: [...new Set([...v.ligas, ...ranking.map(r => r.liga_id)])] }, attributes: ['id', 'nombre'], raw: true }),
  ]);
  // Posición dentro de cada combinación del ranking (una consulta por combinación, máx. 10)
  const posiciones = await Promise.all(ranking.map(r => RankingPunto.count({
    where: { id_tenant: r.id_tenant, liga_id: r.liga_id, categoria_id: r.categoria_id, genero: r.genero, temporada: r.temporada, puntos: { [Op.gt]: r.puntos } },
  }).then(n => n + 1)));
  const cat = fichas[0]?.categoria_actual;
  return {
    jugador: {
      nombre, dni: acceso.dni, categoria: cat ? rk.nombreCat(cat) : null, genero: fichas[0]?.genero || null,
      clubes: clubs.filter(c => fichas.some(f => f.id_tenant === c.id) || v.idx.some(r => r.complex_id === c.id)),
      must_change_password: acceso.must_change_password,
    },
    ranking: ranking.map((r, i) => ({
      liga: ligas.find(l => l.id === r.liga_id)?.nombre || null, liga_id: r.liga_id, categoria: rk.nombreCat(r.categoria_id),
      genero: r.genero, temporada: r.temporada, puntos: r.puntos, posicion: posiciones[i],
    })),
    resumen: { torneos_jugados: v.jugados.size, ligas: v.ligas.size },
    proximos: await serialTorneos(proximos, v),
    ligas: ligas.filter(l => v.ligas.has(l.id)),
  };
}

async function torneos(acceso, q = {}) {
  const v = await visibles(acceso);
  const { limit, page, offset } = pag(q);
  const where = { id: [...(q.todos === '1' ? v.todos : v.jugados)] };
  if (q.liga_id) where.liga_id = Number(q.liga_id);
  if (q.estado) where.estado = String(q.estado);
  if (!where.id.length) return { items: [], total: 0, page, limit };
  const { rows, count } = await Torneo.findAndCountAll({ where, order: [['fecha_inicio', 'DESC'], ['id', 'DESC']], limit, offset });
  return { items: await serialTorneos(rows, v), total: count, page, limit };
}

// Caché de consultas históricas (torneos finalizados/cancelados no cambian)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
async function cacheado(torneo, clave, fn) {
  if (!['finalizado', 'cancelado'].includes(torneo.estado)) return fn();
  const k = `${torneo.id}:${clave}`;
  const hit = cache.get(k);
  if (hit && hit.exp > Date.now()) return hit.v;
  const val = await fn();
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(k, { v: val, exp: Date.now() + CACHE_TTL });
  return val;
}

/** Fixture público (sin DNI ni teléfonos) de la categoría pedida o la del jugador. */
async function fixtureDe(torneo, mia, categoriaId) {
  const cat = categoriaId || mia?.categoria_id || undefined;
  return cacheado(torneo, `fx:${cat || ''}`, () => torneoSvc.fixture(torneo, { publico: true, categoria_id: cat }));
}

async function torneo(acceso, id, q = {}) {
  const { torneo: t, v, mia } = await exigirTorneo(acceso, id);
  const [info] = await serialTorneos([t], v);
  const fx = await fixtureDe(t, mia, q.categoria_id);
  return { torneo: info, mi_pareja_id: mia?.pareja_id ?? null, ...fx };
}

async function standings(acceso, id, q = {}) {
  const { torneo: t, mia } = await exigirTorneo(acceso, id);
  const cat = q.categoria_id || mia?.categoria_id || null;
  return cacheado(t, `rk:${cat || ''}`, () => torneoSvc.rankingJugadores(t, cat));
}

async function groups(acceso, id, q = {}) {
  const { torneo: t, mia } = await exigirTorneo(acceso, id);
  const fx = await fixtureDe(t, mia, q.categoria_id);
  return { categoria_id: fx.categoria_id, categorias: fx.categorias, zonas: fx.zonas, mi_pareja_id: mia?.pareja_id ?? null };
}

async function brackets(acceso, id, q = {}) {
  const { torneo: t, mia } = await exigirTorneo(acceso, id);
  const fx = await fixtureDe(t, mia, q.categoria_id);
  return { categoria_id: fx.categoria_id, categorias: fx.categorias, llave: fx.llave, llave_prevista: fx.llave_prevista, campeon: fx.campeon, mi_pareja_id: mia?.pareja_id ?? null };
}

async function matches(acceso, id, q = {}) {
  const { torneo: t, mia } = await exigirTorneo(acceso, id);
  const fx = await fixtureDe(t, mia, q.categoria_id);
  let partidos = [...fx.zonas.flatMap(z => z.partidos), ...fx.llave.flatMap(r => r.partidos)].filter(p => !p.es_bye);
  if (q.mios === '1' && mia) partidos = partidos.filter(p => p.pareja1?.id === mia.pareja_id || p.pareja2?.id === mia.pareja_id);
  partidos.sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')) || String(a.hora || '').localeCompare(String(b.hora || '')));
  return { categoria_id: fx.categoria_id, categorias: fx.categorias, partidos, mi_pareja_id: mia?.pareja_id ?? null };
}

async function exigirLiga(acceso, ligaId) {
  const id = Number(ligaId);
  const v = await visibles(acceso);
  if (!v.ligas.has(id)) throw httpError(403, 'No participás en esta liga.');
  const liga = await TorneoLiga.findByPk(id, { attributes: ['id', 'id_tenant', 'nombre', 'estado'] });
  if (!liga) throw httpError(404, 'Liga no encontrada');
  return { liga, v };
}

async function liga(acceso, id) {
  const { liga: l, v } = await exigirLiga(acceso, id);
  const fechas = await Torneo.findAll({ where: { liga_id: l.id, estado: ESTADOS_VISIBLES }, order: [['fecha_inicio', 'DESC']], limit: 100 });
  const club = await Complex.findByPk(l.id_tenant, { attributes: ['id', 'nombre', 'ciudad'], raw: true });
  const temporadas = [...new Set(fechas.map(t => Number(String(t.fecha_inicio).slice(0, 4))))];
  return { liga: { id: l.id, nombre: l.nombre, estado: l.estado, club }, temporadas, fechas: await serialTorneos(fechas, v) };
}

async function ligaHistorial(acceso, id, q = {}) {
  const { liga: l, v } = await exigirLiga(acceso, id);
  const { limit, page, offset } = pag(q);
  const where = { liga_id: l.id, estado: ['finalizado', 'cancelado'] };
  if (q.temporada) where.fecha_inicio = { [Op.between]: [`${Number(q.temporada)}-01-01`, `${Number(q.temporada)}-12-31`] };
  const { rows, count } = await Torneo.findAndCountAll({ where, order: [['fecha_inicio', 'DESC']], limit, offset });
  return { items: await serialTorneos(rows, v), total: count, page, limit };
}

module.exports = {
  login, cambiarClave, solicitarRecuperacion, restablecer, log, reconstruirIndice,
  dashboard, torneos, torneo, standings, groups, brackets, matches, liga, ligaHistorial,
  limpiarDni, _cache: cache,
};
