'use strict';
/**
 * utils/inasistencias.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista de incumplidos por reiteradas inasistencias (por complejo).
 *
 * ENTRADA a la lista: al marcar un "no asistido", si el jugador alcanzó el máximo
 *   configurado (complexes.max_inasistencias_mes) en los últimos 30 días.
 * SALIDA de la lista (solo dos formas):
 *   a) Manual: el complex_admin lo habilita desde el panel.
 *   b) Automática: pasaron 30 días desde el último "no asistido" sin nuevas faltas
 *      Y el jugador tiene al menos 2 turnos asistidos en ese período.
 *
 * El jugador se identifica por user_id y/o por los últimos 10 dígitos del teléfono
 * (formato-agnóstico), igual que en "Mis turnos".
 */
const { Op } = require('sequelize');
const { Booking, Field, Complex, Blacklist } = require('../models');
const { todayAR } = require('./time');

const MSG_BLOQUEO   = 'No puede agendar turnos por reiteradas inasistencias. Comuníquese con la cancha.';
const VENTANA_DIAS  = 30;   // ventana para acumular inasistencias
const SALIDA_DIAS   = 30;   // días sin faltas para la salida automática
const SALIDA_ASIST  = 2;    // turnos asistidos requeridos para la salida automática

// ── Helpers de fecha (AR) ──
function hoy() { return todayAR(); }
function haceDias(n) {
  const [y, m, d] = todayAR().split('-').map(Number);
  const dt = new Date(y, m - 1, d - n);
  const p = x => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function diasDesde(fechaStr) {
  const [y, m, d]    = String(fechaStr).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = todayAR().split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y, m - 1, d)) / 86_400_000);
}

// ── Identidad ──
function telKey(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-10) : null;
}
function bookingMatch({ userId, key }) {
  const or = [];
  if (userId) or.push({ user_id: userId });
  if (key)    or.push({ telefono_cliente: { [Op.like]: `%${key}%` } });
  return or;
}
function blacklistMatch({ userId, key }) {
  const or = [];
  if (userId) or.push({ user_id: userId });
  if (key)    or.push({ tel_key: key });
  return or;
}

// ── Consultas base ──
async function fieldIdsDe(complexId) {
  const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
  return fields.map(f => f.id);
}
async function limiteDe(complexId) {
  const c = await Complex.findByPk(complexId, { attributes: ['max_inasistencias_mes'] });
  return Math.max(1, parseInt(c?.max_inasistencias_mes ?? 2, 10) || 2);
}
async function noShowsUltimos30(fieldIds, or) {
  if (!or.length) return 0;
  return Booking.count({
    where: { field_id: { [Op.in]: fieldIds }, estado: 'no_asistido', fecha: { [Op.gte]: haceDias(VENTANA_DIAS) }, [Op.or]: or },
  });
}
async function ultimoNoShow(fieldIds, or) {
  if (!or.length) return null;
  const b = await Booking.findOne({
    where: { field_id: { [Op.in]: fieldIds }, estado: 'no_asistido', [Op.or]: or },
    attributes: ['fecha'], order: [['fecha', 'DESC']],
  });
  return b?.fecha ? String(b.fecha).slice(0, 10) : null;
}
async function asistidosDesde(fieldIds, or, fecha) {
  if (!or.length) return 0;
  return Booking.count({
    where: { field_id: { [Op.in]: fieldIds }, estado: 'confirmado', fecha: { [Op.gt]: fecha, [Op.lt]: hoy() }, [Op.or]: or },
  });
}
async function identidadReciente(fieldIds, or) {
  const b = await Booking.findOne({
    where: { field_id: { [Op.in]: fieldIds }, [Op.or]: or },
    attributes: ['nombre_cliente', 'telefono_cliente', 'user_id'], order: [['id', 'DESC']],
  });
  return b || {};
}

/**
 * Se llama al marcar un "no asistido". Si el jugador alcanzó el máximo en 30 días,
 * lo incorpora (o reactiva) en la lista. Una nueva falta limpia la habilitación manual.
 */
async function registrarInasistencia(complexId, { userId, telefono, nombre } = {}) {
  const key = telKey(telefono);
  if (!userId && !key) return;
  const fieldIds = await fieldIdsDe(complexId);
  if (!fieldIds.length) return;

  const limite    = await limiteDe(complexId);
  const recientes = await noShowsUltimos30(fieldIds, bookingMatch({ userId, key }));
  if (recientes < limite) return;

  const bor   = blacklistMatch({ userId, key });
  let entry = await Blacklist.findOne({ where: { complex_id: complexId, [Op.or]: bor }, order: [['id', 'DESC']] });
  const datos = { activo: true, habilitado_manual: false, motivo_salida: null,
                  user_id: userId || entry?.user_id || null, tel_key: key || entry?.tel_key,
                  telefono: telefono || entry?.telefono, nombre: nombre || entry?.nombre };
  if (entry) await entry.update(datos);
  else       await Blacklist.create({ complex_id: complexId, ...datos });
}

/**
 * Verifica si el jugador está bloqueado. Mantiene la lista al día:
 *  - agrega si alcanzó el máximo en 30 días (salvo habilitación manual vigente),
 *  - saca automáticamente si cumple la condición b).
 * @returns {{ blocked:boolean, mensaje:string }}
 */
async function evaluarBloqueoInasistencias(complexId, { userId, telefono } = {}) {
  const key = telKey(telefono);
  const fieldIds = await fieldIdsDe(complexId);
  if (!fieldIds.length || (!userId && !key)) return { blocked: false, mensaje: MSG_BLOQUEO };

  const limite = await limiteDe(complexId);
  const or  = bookingMatch({ userId, key });
  const bor = blacklistMatch({ userId, key });

  let entry = await Blacklist.findOne({ where: { complex_id: complexId, [Op.or]: bor }, order: [['activo', 'DESC'], ['id', 'DESC']] });
  const recientes = await noShowsUltimos30(fieldIds, or);

  if (recientes >= limite) {
    // Respeta la habilitación manual hasta que llegue una NUEVA inasistencia.
    if (entry?.habilitado_manual && !entry.activo) return { blocked: false, mensaje: MSG_BLOQUEO };
    if (!entry) {
      const id = await identidadReciente(fieldIds, or);
      entry = await Blacklist.create({ complex_id: complexId, user_id: userId || id.user_id || null, tel_key: key, telefono: telefono || id.telefono_cliente, nombre: id.nombre_cliente, activo: true });
    } else if (!entry.activo) {
      await entry.update({ activo: true, motivo_salida: null });
    }
    return { blocked: true, mensaje: MSG_BLOQUEO };
  }

  // recientes < limite: si sigue activo, evaluar salida automática (regla b).
  if (entry?.activo) {
    const ult  = await ultimoNoShow(fieldIds, or);
    const dias = ult ? diasDesde(ult) : 999;
    const asis = ult ? await asistidosDesde(fieldIds, or, ult) : 0;
    if (dias >= SALIDA_DIAS && asis >= SALIDA_ASIST) {
      await entry.update({ activo: false, motivo_salida: 'auto' });
      return { blocked: false, mensaje: MSG_BLOQUEO };
    }
    return { blocked: true, mensaje: MSG_BLOQUEO };
  }

  return { blocked: false, mensaje: MSG_BLOQUEO };
}

/** Tras corregir un "no asistido" a "asistido": si ya no supera el límite, sale de la lista. */
async function reevaluarTrasCorreccion(complexId, { userId, telefono } = {}) {
  const key = telKey(telefono);
  const fieldIds = await fieldIdsDe(complexId);
  if (!fieldIds.length) return;
  const limite    = await limiteDe(complexId);
  const recientes = await noShowsUltimos30(fieldIds, bookingMatch({ userId, key }));
  if (recientes < limite) {
    const entry = await Blacklist.findOne({ where: { complex_id: complexId, activo: true, [Op.or]: blacklistMatch({ userId, key }) } });
    if (entry) await entry.update({ activo: false, motivo_salida: 'correccion' });
  }
}

/** Lista de incumplidos activos de un complejo. */
async function listarIncumplidos(complexId) {
  return Blacklist.findAll({ where: { complex_id: complexId, activo: true }, order: [['updatedAt', 'DESC']] });
}

/** Habilitación manual (complex_admin): saca al jugador de la lista. */
async function habilitarManual(complexId, id) {
  const entry = await Blacklist.findOne({ where: { id, complex_id: complexId } });
  if (!entry) return null;
  await entry.update({ activo: false, habilitado_manual: true, motivo_salida: 'manual' });
  return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LISTA GLOBAL (compartida entre todos los complejos activos)
//  La tabla blacklist registra en qué complejo se originó cada entrada
//  (complex_id = origen), pero el BLOQUEO vale en todos los complejos.
// ═══════════════════════════════════════════════════════════════════════════
const MSG_PAGO_ONLINE = 'Por reiteradas inasistencias, en este complejo solo podés reservar pagando online con Mercado Pago (seña o total), o pedirlo directamente a la cancha.';

/** Complejos donde la persona tiene una entrada en la lista (para reevaluarlos). */
async function complejosConEntrada({ userId, key }) {
  const or = blacklistMatch({ userId, key });
  if (!or.length) return [];
  const filas = await Blacklist.findAll({ where: { [Op.or]: or }, attributes: ['complex_id'], raw: true });
  return [...new Set(filas.map(f => f.complex_id))];
}

/**
 * ¿Está la persona en la lista global? Reevalúa (alta/salida automática) cada
 * complejo donde tiene historia + el complejo de destino.
 * @returns {{ blocked:boolean, origenes:number[] }}
 */
async function evaluarBloqueoGlobal(complexIdDestino, { userId, telefono } = {}) {
  const key = telKey(telefono);
  if (!userId && !key) return { blocked: false, origenes: [] };
  const ids = new Set([Number(complexIdDestino), ...(await complejosConEntrada({ userId, key }))].filter(Boolean));
  const origenes = [];
  for (const id of ids) {
    const r = await evaluarBloqueoInasistencias(id, { userId, telefono });
    if (r.blocked) origenes.push(id);
  }
  return { blocked: origenes.length > 0, origenes };
}

/**
 * Regla de acceso a turnos para el complejo de destino:
 *   - no incumplido → libre
 *   - incumplido y el complejo cobra con Mercado Pago → puede reservar SOLO pagando online
 *   - incumplido sin Mercado Pago → bloqueado: comunicarse con la cancha
 * @returns {{ blocked:boolean, soloPagoOnline:boolean, incumplido:boolean, mensaje:string, whatsapp:string|null }}
 */
async function accesoReserva(complexId, ident = {}) {
  const g = await evaluarBloqueoGlobal(complexId, ident);
  const complex = await Complex.findByPk(complexId, { attributes: ['whatsapp_contacto', 'telefono'] });
  const whatsapp = complex?.whatsapp_contacto ? String(complex.whatsapp_contacto).replace(/\D/g, '') : null;
  if (!g.blocked) return { blocked: false, soloPagoOnline: false, incumplido: false, mensaje: null, whatsapp };
  const mp = await require('../services/mercadopagoOAuth.service').puedeCobrar(complexId).catch(() => false);
  return mp
    ? { blocked: false, soloPagoOnline: true, incumplido: true, mensaje: MSG_PAGO_ONLINE, whatsapp }
    : { blocked: true, soloPagoOnline: false, incumplido: true, mensaje: MSG_BLOQUEO, whatsapp };
}

/** Lista global de incumplidos activos (opcional: solo los originados en un complejo). */
async function listarGlobal({ complexId } = {}) {
  return Blacklist.findAll({
    where: { activo: true, ...(complexId ? { complex_id: Number(complexId) } : {}) },
    include: [{ model: Complex, as: 'complejo', attributes: ['id', 'nombre'] }],
    order: [['updatedAt', 'DESC']],
  });
}

/**
 * Habilitación manual GLOBAL de una persona: desactiva todas sus entradas
 * activas (en cualquier complejo). Solo administradores.
 */
async function habilitarGlobal(id) {
  const entry = await Blacklist.findByPk(id);
  if (!entry) return null;
  const or = blacklistMatch({ userId: entry.user_id, key: entry.tel_key });
  await Blacklist.update({ activo: false, habilitado_manual: true, motivo_salida: 'manual' }, { where: { activo: true, [Op.or]: or } });
  return entry.reload();
}

module.exports = {
  evaluarBloqueoGlobal, accesoReserva, listarGlobal, habilitarGlobal, MSG_PAGO_ONLINE,
  evaluarBloqueoInasistencias, registrarInasistencia, reevaluarTrasCorreccion,
  listarIncumplidos, habilitarManual, telKey, MSG_BLOQUEO,
};
