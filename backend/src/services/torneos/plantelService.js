'use strict';
/**
 * services/torneos/plantelService.js — "Editar plantel" de una inscripción (pareja de pádel).
 *
 * Una pareja tiene exactamente 2 jugadores (cupo del reglamento). Se puede modificar un
 * jugador, eliminarlo (queda 1 lugar libre) y agregar el reemplazo. Validaciones:
 *  - DNI único dentro del torneo (parejas activas).
 *  - Posición (drive / revés) única dentro de la pareja (equivalente al número de camiseta).
 *  - Categoría del jugador ≥ categoría en la que juega la pareja (nivel, no edad).
 *  - Género según el torneo (masculino / femenino / mixto = un hombre y una mujer).
 *  - Cupo: máximo 2 jugadores.
 *  - No se elimina a quien ya tiene participación (partidos jugados de la pareja).
 * Cada alta / modificación / baja queda en torneo_jugador_cambios (datos anteriores y nuevos) y en la
 * auditoría de inscripciones. Con las inscripciones cerradas (zonas armadas) no se agregan, eliminan ni
 * cambian integrantes (DNI / nombre); sí se corrigen datos de contacto.
 */
const { Op } = require('sequelize');
const { sequelize, Torneo, TorneoPareja, TorneoJugador, TorneoPartido, TorneoTicket, TorneoJugadorCambio, TorneoCategoria } = require('../../models');
const inscr = require('./inscripcionesService');

/** 409 si la categoría de la pareja tiene las inscripciones cerradas. */
async function asegurarAbiertas(torneo, pareja, transaction) {
  inscr.asegurarAbiertas(await TorneoCategoria.findOne({ where: { torneo_id: torneo.id, categoria_id: pareja.categoria_id || torneo.categoria }, transaction }));
}
const rk = require('./rankingService');

function httpError(status, message) { return Object.assign(new Error(message), { status }); }
const CUPO = 2;
const CAMPOS = ['nombre', 'dni', 'whatsapp', 'email', 'categoria', 'genero', 'fecha_nacimiento', 'posicion', 'observaciones'];
const snapshot = (j) => (j ? Object.fromEntries(CAMPOS.map(k => [k, j[k] ?? null])) : null);
const ACTIVAS = ['pendiente', 'pagado'];

async function cargarPareja(torneo, parejaId, transaction) {
  const p = await TorneoPareja.findOne({
    where: { id: parejaId, torneo_id: torneo.id },
    include: [{ model: TorneoJugador, as: 'jugadores' }], transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!p) throw httpError(404, 'Inscripción no encontrada.');
  return p;
}

/** Partidos jugados (con resultado) por la pareja: participación registrada. */
const partidosJugados = (parejaId, transaction) => TorneoPartido.count({
  where: { [Op.or]: [{ pareja1_id: parejaId }, { pareja2_id: parejaId }], estado: ['jugado', 'walkover'], es_bye: false }, transaction,
});

/**
 * Valida y normaliza los datos de un jugador (alta o modificación parcial).
 * @param {object} actual  jugador existente (para validar la combinación final)
 */
async function validar(torneo, pareja, body, { actual = null } = {}) {
  const v = { ...snapshot(actual), ...Object.fromEntries(CAMPOS.filter(k => body[k] !== undefined).map(k => [k, body[k]])) };
  v.nombre = String(v.nombre || '').trim();
  v.dni = String(v.dni || '').replace(/\D/g, '');
  v.whatsapp = String(v.whatsapp || '').replace(/\D/g, '') || null;   // opcional (alta administrativa)
  v.email = v.email ? String(v.email).trim().toLowerCase() : null;
  v.categoria = Number.parseInt(v.categoria, 10);
  v.posicion = v.posicion || null;
  v.observaciones = v.observaciones ? String(v.observaciones).trim().slice(0, 255) : null;
  v.fecha_nacimiento = v.fecha_nacimiento || null;

  if (v.nombre.length < 3 || v.nombre.length > 150) throw httpError(400, 'Nombre y apellido requeridos (3 a 150 caracteres).');
  if (!/^\d{7,9}$/.test(v.dni)) throw httpError(400, 'DNI inválido.');
  if (v.whatsapp && !/^\d{10,15}$/.test(v.whatsapp)) throw httpError(400, 'Teléfono / WhatsApp inválido (con código de país, ej. 549381…).');
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw httpError(400, 'Email inválido.');
  if (!['masculino', 'femenino'].includes(v.genero)) throw httpError(400, 'Género inválido.');
  if (v.posicion && !['drive', 'reves'].includes(v.posicion)) throw httpError(400, 'Posición inválida (drive o revés).');
  if (v.fecha_nacimiento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha_nacimiento) || Number.isNaN(Date.parse(v.fecha_nacimiento))) throw httpError(400, 'Fecha de nacimiento inválida.');
    const edad = (Date.now() - Date.parse(v.fecha_nacimiento)) / (365.25 * 864e5);
    if (edad < 5 || edad > 100) throw httpError(400, 'Fecha de nacimiento fuera de rango.');
  }
  const catPareja = pareja.categoria_id || torneo.categoria;
  if (!(v.categoria >= 1 && v.categoria <= 8)) throw httpError(400, 'Categoría inválida (1ª a 8ª).');
  if (v.categoria < catPareja) throw httpError(400, `Un jugador de ${v.categoria}ª no puede jugar la categoría ${catPareja}ª.`);

  // DNI, email y teléfono únicos en el torneo (parejas activas, incluido el compañero)
  // (en una modificación se controla solo lo que cambia: no traba datos históricos)
  const distinto = (k) => !actual || String(v[k] ?? '') !== String(actual[k] ?? '');
  const control = { nombre: v.nombre, dni: distinto('dni') ? v.dni : null, email: distinto('email') ? v.email : null, whatsapp: distinto('whatsapp') ? v.whatsapp : null };
  await inscr.verificarDuplicados(torneo, [control], { excluirJugadorIds: actual ? [actual.id] : [] });
  // Posición única dentro de la pareja
  const compañeros = pareja.jugadores.filter(j => j.id !== actual?.id);
  if (v.posicion && compañeros.some(j => j.posicion === v.posicion)) throw httpError(409, `Ya hay un jugador de ${v.posicion === 'drive' ? 'drive' : 'revés'} en la pareja.`);
  // Género según el torneo (con la pareja completa)
  const generos = [...compañeros.map(j => j.genero), v.genero];
  if (generos.length === CUPO) {
    const okGenero = { masculino: generos.every(g => g === 'masculino'), femenino: generos.every(g => g === 'femenino'), mixto: generos.includes('masculino') && generos.includes('femenino') }[torneo.genero];
    if (!okGenero) throw httpError(400, torneo.genero === 'mixto' ? 'En un torneo mixto la pareja debe ser un hombre y una mujer.' : `Este torneo es ${torneo.genero}.`);
  }
  return v;
}

async function registrarCambio(torneo, pareja, jugadorId, accion, anterior, nuevo, usuario, transaction) {
  await TorneoJugadorCambio.create({
    torneo_id: torneo.id, pareja_id: pareja.id, jugador_id: jugadorId, accion,
    datos_anteriores: anterior, datos_nuevos: nuevo, usuario_id: usuario?.id || null, usuario: usuario?.nombre || null,
  }, { transaction });
  await inscr.auditar(torneo, {
    categoria_id: pareja.categoria_id || null, pareja_id: pareja.id, accion: 'inscripcion_modificada',
    detalle: { plantel: accion, jugador_id: jugadorId, antes: anterior, despues: nuevo }, usuario,
  }, transaction);
}

async function listar(torneo, parejaId) {
  const p = await cargarPareja(torneo, parejaId);
  const jugados = await partidosJugados(p.id);
  return {
    pareja: { id: p.id, categoria_id: p.categoria_id, estado_pago: p.estado_pago, zona_id: p.zona_id },
    cupo: CUPO, participacion: jugados > 0, partidos_jugados: jugados,
    jugadores: p.jugadores.sort((a, b) => a.id - b.id).map(j => ({ id: j.id, ...snapshot(j) })),
  };
}

async function agregar(torneo, parejaId, body, usuario) {
  return sequelize.transaction(async (t) => {
    const p = await cargarPareja(torneo, parejaId, t);
    if (!ACTIVAS.includes(p.estado_pago)) throw httpError(409, 'La inscripción está cancelada.');
    await asegurarAbiertas(torneo, p, t);
    if (p.jugadores.length >= CUPO) throw httpError(409, `La pareja ya tiene ${CUPO} jugadores: eliminá uno antes de agregar otro.`);
    const v = await validar(torneo, p, body);
    const reg = await rk.upsertJugador(torneo.id_tenant, v, t);
    const j = await TorneoJugador.create({ ...v, pareja_id: p.id, jugador_id: reg.id }, { transaction: t });
    await registrarCambio(torneo, p, j.id, 'CREATE', null, snapshot(j), usuario, t);
    return j;
  }).then(async (j) => {
    // Pareja pagada: el jugador nuevo recibe su ticket (idempotente)
    const p = await TorneoPareja.findByPk(parejaId, { include: [{ model: TorneoJugador, as: 'jugadores' }] });
    if (p.estado_pago === 'pagado') await require('./torneoService').emitirTickets(torneo, p).catch(err => console.error('[plantel] ticket:', err.message));
    console.log(`[plantel] torneo ${torneo.id} · pareja ${parejaId}: alta de ${j.nombre} (DNI ${j.dni}) · ${usuario?.nombre || '?'}`);
    return listar(torneo, parejaId);
  });
}

async function modificar(torneo, parejaId, jugadorId, body, usuario) {
  await sequelize.transaction(async (t) => {
    const p = await cargarPareja(torneo, parejaId, t);
    const actual = p.jugadores.find(j => j.id === Number(jugadorId));
    if (!actual) throw httpError(404, 'El jugador no pertenece a esta pareja.');
    const antes = snapshot(actual);
    const v = await validar(torneo, p, body, { actual });
    // Con partidos jugados no se cambia el DNI (es otra persona: usar baja + alta antes de jugar)
    if (v.dni !== actual.dni && await partidosJugados(p.id, t)) throw httpError(409, 'El jugador posee participación registrada: no se puede cambiar por otra persona.');
    const cambios = Object.fromEntries(CAMPOS.filter(k => String(v[k] ?? '') !== String(antes[k] ?? '')).map(k => [k, v[k]]));
    if (!Object.keys(cambios).length) throw httpError(400, 'No hay cambios para guardar.');
    if (cambios.dni || cambios.nombre) await asegurarAbiertas(torneo, p, t);   // cambio de integrante
    if (cambios.dni || cambios.nombre) cambios.jugador_id = (await rk.upsertJugador(torneo.id_tenant, v, t)).id;
    await actual.update(cambios, { transaction: t });
    await registrarCambio(torneo, p, actual.id, 'UPDATE', antes, snapshot(actual), usuario, t);
  });
  console.log(`[plantel] torneo ${torneo.id} · pareja ${parejaId}: jugador ${jugadorId} modificado · ${usuario?.nombre || '?'}`);
  return listar(torneo, parejaId);
}

async function eliminar(torneo, parejaId, jugadorId, usuario) {
  await sequelize.transaction(async (t) => {
    const p = await cargarPareja(torneo, parejaId, t);
    const actual = p.jugadores.find(j => j.id === Number(jugadorId));
    if (!actual) throw httpError(404, 'El jugador no pertenece a esta pareja.');
    await asegurarAbiertas(torneo, p, t);
    if (await partidosJugados(p.id, t)) throw httpError(409, 'El jugador posee participación registrada y no puede eliminarse.');
    const antes = snapshot(actual);
    await TorneoTicket.destroy({ where: { jugador_id: actual.id }, transaction: t });
    await actual.destroy({ transaction: t });
    await registrarCambio(torneo, p, actual.id, 'DELETE', antes, null, usuario, t);
  });
  console.log(`[plantel] torneo ${torneo.id} · pareja ${parejaId}: baja del jugador ${jugadorId} · ${usuario?.nombre || '?'}`);
  return listar(torneo, parejaId);
}

function historial(torneo, parejaId) {
  return TorneoJugadorCambio.findAll({ where: { torneo_id: torneo.id, pareja_id: Number(parejaId) }, order: [['id', 'DESC']], limit: 200 });
}

module.exports = { CUPO, listar, agregar, modificar, eliminar, historial, Torneo };
