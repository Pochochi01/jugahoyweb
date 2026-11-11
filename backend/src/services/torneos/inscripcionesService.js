'use strict';
/**
 * services/torneos/inscripcionesService.js — Inscripciones inteligentes.
 *
 *  - normalizarJugador / completarDatos: autocompleta DNI, email y teléfono faltantes con el registro
 *    del club (padel_jugadores) y los usuarios registrados.
 *  - exigirDatos: email y teléfono obligatorios para el público; el panel (administrativo) puede seguir sin ellos.
 *  - verificarDuplicados: DNI, email, teléfono y jugador únicos entre las parejas activas del torneo.
 *  - inconsistencias: controles previos al armado de zonas (bloquea si hay problemas).
 *  - Bloqueo: torneo_categorias.inscripciones_cerradas se activa al armar zonas; solo Administrador General,
 *    administrador del club o el organizador del torneo pueden reabrir (con motivo y auditoría).
 *  - auditar / historial: torneo_inscripcion_eventos.
 */
const { Op } = require('sequelize');
const m = require('../../models');

const httpError = (status, message, extra) => Object.assign(new Error(message), { status }, extra);
const ACTIVAS = ['pendiente', 'pagado'];
const MSG_CERRADAS = 'Las zonas ya fueron generadas. Las inscripciones se encuentran cerradas.';

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const emailLimpio = (v) => (v ? String(v).trim().toLowerCase() : '') || null;
/** Teléfono comparable: últimos 10 dígitos (3811234567 == 5493811234567). */
const telClave = (v) => { const d = soloDigitos(v); return d.length >= 8 ? d.slice(-10) : null; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Autocompletado ────────────────────────────────────────────
/**
 * Completa DNI / email / teléfono faltantes de un jugador con lo que ya existe en la base:
 *   1) padel_jugadores del club (por DNI, o por nombre exacto si no hay DNI y es único)
 *   2) usuarios registrados (por email o teléfono)
 * Nunca pisa un dato cargado. @returns {{ jugador, completados: string[] }}
 */
async function completarDatos(clubId, j, transaction) {
  const out = { ...j };
  const completados = [];
  const poner = (k, v) => { if (!out[k] && v) { out[k] = v; completados.push(k); } };
  let reg = null;
  if (out.dni) reg = await m.PadelJugador.findOne({ where: { id_tenant: clubId, dni: out.dni }, transaction });
  else if (out.nombre) {
    const mismos = await m.PadelJugador.findAll({ where: { id_tenant: clubId, nombre: out.nombre }, limit: 2, transaction });
    if (mismos.length === 1) reg = mismos[0];
  }
  if (!reg && (out.email || out.whatsapp)) {
    const or = [];
    if (out.email) or.push({ email: out.email });
    if (telClave(out.whatsapp)) or.push({ whatsapp: { [Op.like]: `%${telClave(out.whatsapp)}` } });
    const cands = await m.PadelJugador.findAll({ where: { id_tenant: clubId, [Op.or]: or }, limit: 2, transaction });
    if (cands.length === 1) reg = cands[0];
  }
  if (reg) { poner('dni', reg.dni); poner('email', emailLimpio(reg.email)); poner('whatsapp', soloDigitos(reg.whatsapp) || null); }
  if (!out.email || !out.whatsapp) {
    const or = [];
    if (out.email) or.push({ email: out.email });
    if (telClave(out.whatsapp)) or.push({ telefono: { [Op.like]: `%${telClave(out.whatsapp)}` } });
    const u = or.length ? await m.User.findOne({ where: { [Op.or]: or }, attributes: ['email', 'telefono'], transaction }) : null;
    if (u) { poner('email', emailLimpio(u.email)); poner('whatsapp', soloDigitos(u.telefono) || null); }
  }
  return { jugador: out, completados };
}

/**
 * Datos obligatorios. Público: DNI, email y teléfono. Panel (administrativo): DNI (identidad del
 * jugador para ranking y portal); email y teléfono pueden quedar vacíos.
 */
function exigirDatos(j, i, { admin }) {
  const n = `Jugador ${i + 1}${j.nombre ? ` (${j.nombre})` : ''}`;
  if (!/^\d{7,9}$/.test(j.dni || '')) throw httpError(400, `${n}: DNI inválido o faltante.`);
  if (j.email && !EMAIL_RE.test(j.email)) throw httpError(400, `${n}: email inválido.`);
  if (j.whatsapp && !/^\d{10,15}$/.test(j.whatsapp)) throw httpError(400, `${n}: WhatsApp inválido (con código de país, ej. 549381...).`);
  if (!admin) {
    const faltan = [!j.email && 'email', !j.whatsapp && 'teléfono'].filter(Boolean);
    if (faltan.length) throw httpError(400, `${n}: completá ${faltan.join(' y ')} para finalizar la inscripción.`, { faltantes: faltan });
  }
}

// ── Duplicados ────────────────────────────────────────────────
/**
 * Conflictos entre los jugadores nuevos y los ya inscriptos (parejas activas del torneo) y entre sí.
 * @param {Array<{dni, email, whatsapp, nombre}>} nuevos
 * @param {{ excluirJugadorIds?: number[], transaction? }} opts
 * @throws 409 con el primer conflicto (mensaje claro) y `conflictos` con todos
 */
async function verificarDuplicados(torneo, nuevos, { excluirJugadorIds = [], transaction } = {}) {
  const conflictos = [];
  // Entre los propios jugadores de la inscripción
  for (let a = 0; a < nuevos.length; a++) for (let b = a + 1; b < nuevos.length; b++) {
    const x = nuevos[a], y = nuevos[b];
    if (x.dni && x.dni === y.dni) conflictos.push({ campo: 'dni', mensaje: 'Los dos jugadores no pueden tener el mismo DNI.' });
    if (x.email && x.email === y.email) conflictos.push({ campo: 'email', mensaje: 'Los dos jugadores no pueden tener el mismo email.' });
    if (telClave(x.whatsapp) && telClave(x.whatsapp) === telClave(y.whatsapp)) conflictos.push({ campo: 'telefono', mensaje: 'Los dos jugadores no pueden tener el mismo teléfono.' });
  }
  const inscriptos = await m.TorneoJugador.findAll({
    where: excluirJugadorIds.length ? { id: { [Op.notIn]: excluirJugadorIds } } : {},
    include: [{ model: m.TorneoPareja, as: 'pareja', where: { torneo_id: torneo.id, estado_pago: ACTIVAS }, attributes: ['id', 'categoria_id'] }],
    attributes: ['id', 'nombre', 'dni', 'email', 'whatsapp', 'jugador_id'],
    transaction,
  });
  for (const j of nuevos) {
    for (const o of inscriptos) {
      if (j.dni && o.dni === j.dni) conflictos.push({ campo: 'dni', mensaje: `El DNI ${j.dni} ya pertenece a un participante de este torneo (${o.nombre}).`, pareja_id: o.pareja.id });
      else if (j.jugador_id && o.jugador_id === j.jugador_id) conflictos.push({ campo: 'jugador', mensaje: `${j.nombre || 'El jugador'} ya está inscripto en otra pareja de este torneo.`, pareja_id: o.pareja.id });
      if (j.email && emailLimpio(o.email) === j.email) conflictos.push({ campo: 'email', mensaje: `El email ${j.email} ya se encuentra registrado en una pareja inscripta (${o.nombre}).`, pareja_id: o.pareja.id });
      if (telClave(j.whatsapp) && telClave(o.whatsapp) === telClave(j.whatsapp)) conflictos.push({ campo: 'telefono', mensaje: `El teléfono ${j.whatsapp} ya pertenece a otro jugador anotado (${o.nombre}).`, pareja_id: o.pareja.id });
    }
  }
  if (conflictos.length) throw httpError(409, conflictos[0].mensaje, { conflictos });
}

/**
 * Controles previos al armado de zonas: duplicados de DNI / email / teléfono / jugador, parejas
 * completas y datos obligatorios. @returns {string[]} problemas (vacío = OK)
 */
function inconsistencias(parejas) {
  const problemas = [];
  const nombreP = (p) => [...(p.jugadores || [])].map(j => j.nombre).join(' / ') || `#${p.id}`;
  const vistos = { dni: new Map(), email: new Map(), tel: new Map(), jugador: new Map() };
  const etiqueta = { dni: 'DNI', email: 'email', tel: 'teléfono', jugador: 'jugador' };
  for (const p of parejas) {
    if ((p.jugadores || []).length !== 2) problemas.push(`Pareja ${nombreP(p)}: incompleta (${(p.jugadores || []).length} de 2 jugadores).`);
    for (const j of p.jugadores || []) {
      if (!String(j.nombre || '').trim()) problemas.push(`Pareja ${nombreP(p)}: un jugador no tiene nombre.`);
      if (!/^\d{7,9}$/.test(j.dni || '')) problemas.push(`${j.nombre || 'Jugador'} (${nombreP(p)}): DNI faltante o inválido.`);
      if (!j.categoria || !j.genero) problemas.push(`${j.nombre || 'Jugador'} (${nombreP(p)}): falta categoría o género.`);
      const claves = { dni: j.dni || null, email: emailLimpio(j.email), tel: telClave(j.whatsapp), jugador: j.jugador_id || null };
      for (const [k, v] of Object.entries(claves)) {
        if (!v) continue;
        const prev = vistos[k].get(v);
        if (!prev) { vistos[k].set(v, { nombre: j.nombre, pareja: p.id, dni: j.dni }); continue; }
        if (k === 'jugador' && prev.dni === j.dni) continue;   // ya informado como DNI repetido
        const que = k === 'jugador' ? `El jugador ${j.nombre}` : `El ${etiqueta[k]} ${v}`;
        problemas.push(`${que} está repetido: ${prev.nombre} y ${j.nombre}${prev.pareja === p.id ? ' (misma pareja)' : ''}.`);
      }
    }
  }
  return [...new Set(problemas)];
}

// ── Bloqueo / reapertura ──────────────────────────────────────
/** 409 si las inscripciones de la categoría están cerradas (zonas generadas y no reabiertas). */
function asegurarAbiertas(tc) {
  if (tc?.inscripciones_cerradas) throw httpError(409, MSG_CERRADAS, { codigo: 'INSCRIPCIONES_CERRADAS' });
}

/** Administrador General, administrador del club u organizador del torneo. */
const puedeReabrir = (req) => ['general_admin', 'complex_admin'].includes(req.user?.rol) || Boolean(req.organizador);

async function auditar(torneo, { categoria_id = null, pareja_id = null, accion, detalle = null, motivo = null, usuario = {} }, transaction) {
  await m.TorneoInscripcionEvento.create({
    torneo_id: torneo.id, categoria_id, pareja_id, accion, detalle, motivo,
    usuario_id: usuario?.id || null, usuario: usuario?.nombre || null,
  }, { transaction });
}

async function cerrar(torneo, tc, usuario, transaction) {
  if (tc.inscripciones_cerradas) return;
  await tc.update({ inscripciones_cerradas: true }, { transaction });
  await auditar(torneo, { categoria_id: tc.categoria_id, accion: 'inscripciones_bloqueadas', detalle: { causa: 'zonas_generadas' }, usuario }, transaction);
}

async function reabrir(torneo, categoriaId, { motivo, usuario }) {
  const texto = String(motivo || '').trim();
  if (texto.length < 5) throw httpError(400, 'Indicá el motivo de la reapertura (mínimo 5 caracteres).');
  return m.sequelize.transaction(async (t) => {
    const cats = await m.TorneoCategoria.findAll({ where: { torneo_id: torneo.id, ...(categoriaId && { categoria_id: Number(categoriaId) }) }, transaction: t, lock: t.LOCK.UPDATE });
    if (!cats.length) throw httpError(404, 'Categoría no encontrada en el torneo.');
    const cerradas = cats.filter(c => c.inscripciones_cerradas);
    if (!cerradas.length) throw httpError(409, 'Las inscripciones ya están abiertas.');
    if (['finalizado', 'cancelado'].includes(torneo.estado)) throw httpError(409, `El torneo está ${torneo.estado}.`);
    for (const c of cerradas) {
      if (['llaves', 'finalizado'].includes(c.estado)) throw httpError(409, 'La categoría ya está en la fase de llaves: no se pueden reabrir las inscripciones.');
      await c.update({ inscripciones_cerradas: false }, { transaction: t });
      await auditar(torneo, { categoria_id: c.categoria_id, accion: 'inscripciones_reabiertas', motivo: texto.slice(0, 500), usuario }, t);
    }
    return { reabiertas: cerradas.map(c => c.categoria_id) };
  });
}

function historial(torneo, { categoria_id, limite = 300 } = {}) {
  return m.TorneoInscripcionEvento.findAll({
    where: { torneo_id: torneo.id, ...(categoria_id && { categoria_id: Number(categoria_id) }) },
    order: [['id', 'DESC']], limit: Math.min(Number(limite) || 300, 1000),
  });
}

// ── Búsqueda de jugadores (panel) ─────────────────────────────
/**
 * Sugerencias por nombre, DNI, email o teléfono: registro del club + usuarios registrados.
 * Incluye ranking (liga y categoría del torneo) y categoría habitual.
 */
async function buscarJugadores(clubId, q, { torneo } = {}) {
  const txt = String(q || '').trim();
  if (txt.length < 2) return [];
  const like = `%${txt}%`;
  const dig = soloDigitos(txt);
  const or = [{ nombre: { [Op.like]: like } }, { email: { [Op.like]: like } }];
  if (dig.length >= 3) or.push({ dni: { [Op.like]: `${dig}%` } }, { whatsapp: { [Op.like]: `%${dig}%` } });
  const regs = await m.PadelJugador.findAll({ where: { id_tenant: clubId, [Op.or]: or }, order: [['nombre', 'ASC']], limit: 10 });
  const puntos = new Map();
  if (torneo && regs.length) {
    const temporada = Number(String(torneo.fecha_inicio).slice(0, 4));
    const filas = await m.RankingPunto.findAll({ where: { jugador_id: regs.map(r => r.id), liga_id: torneo.liga_id, temporada }, raw: true });
    for (const f of filas) puntos.set(f.jugador_id, Math.max(puntos.get(f.jugador_id) || 0, f.puntos));
  }
  const res = regs.map(r => {
    const partes = String(r.nombre).trim().split(/\s+/);
    return {
      origen: 'club', jugador_id: r.id, nombre: r.nombre, apellido: partes.length > 1 ? partes.slice(1).join(' ') : '',
      dni: r.dni, email: r.email || null, whatsapp: r.whatsapp || null, genero: r.genero || null,
      categoria: r.categoria_actual || null, ranking: puntos.get(r.id) ?? null,
    };
  });
  if (res.length < 10) {
    const uor = [{ nombre: { [Op.like]: like } }, { apellido: { [Op.like]: like } }, { email: { [Op.like]: like } }];
    if (dig.length >= 3) uor.push({ telefono: { [Op.like]: `%${dig}%` } });
    const users = await m.User.findAll({ where: { [Op.or]: uor, activo: true }, attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'], limit: 10 - res.length });
    for (const u of users) {
      if (res.some(r => r.email && r.email.toLowerCase() === String(u.email).toLowerCase())) continue;
      res.push({ origen: 'usuario', user_id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), apellido: u.apellido, dni: null, email: u.email, whatsapp: soloDigitos(u.telefono) || null, genero: null, categoria: null, ranking: null });
    }
  }
  return res;
}

module.exports = {
  ACTIVAS, MSG_CERRADAS, soloDigitos, emailLimpio, telClave,
  completarDatos, exigirDatos, verificarDuplicados, inconsistencias,
  asegurarAbiertas, puedeReabrir, auditar, cerrar, reabrir, historial, buscarJugadores,
};
