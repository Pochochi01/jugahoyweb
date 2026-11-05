'use strict';
/**
 * services/notifications/NotificationService.js — Notificaciones push de torneos.
 *
 * Flujo desacoplado:
 *   evento (jobs de torneos) → encolar()  → notification_logs (estado 'pendiente', dedupe_key única)
 *   procesarCola() (worker)   → envía por lotes con límite de velocidad, reintentos y backoff
 *   Service Worker            → registrarSeguimiento(): 'entregado' al recibir, 'abierto' al tocar
 *
 * Reglas:
 *  - Solo dispositivos con la PWA INSTALADA (installed = true) y activos.
 *  - Respeta notification_preferences por tipo. Sin destinatario válido → 'omitido' (queda auditado).
 *  - Un mismo evento nunca se encola dos veces (índice único dedupe_key + INSERT IGNORE).
 *  - Tokens / suscripciones inválidas se dan de baja automáticamente.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const m = require('../../models');
const tpl = require('./templates');
const transport = require('./transport');

const { NotificationLog, NotificationPreference, PlayerPushSubscription } = m;

const LOTE = 200;                 // notificaciones por pasada del worker
const CONCURRENCIA = 25;          // envíos simultáneos
const PAUSA_MS = 200;             // pausa entre tandas (≈ 125 envíos/s como máximo)
const MAX_INTENTOS = 3;
const BACKOFF_MIN = [1, 5, 15];   // reintentos: 1, 5 y 15 minutos
const LEASE_MIN = 5;              // si un worker cae, lo tomado vuelve a la cola a los 5 min

const limpiarDni = (v) => String(v || '').replace(/\D/g, '').slice(0, 20);
const secreto = () => process.env.JWT_SECRET || 'jugahoy';
const firmar = (id) => crypto.createHmac('sha256', secreto()).update(`notif:${id}`).digest('hex').slice(0, 32);

// ── Encolado ──────────────────────────────────────────────────
/**
 * Encola notificaciones. Cada item: { tipo, dni, nombre, dedupe, torneo, partido_id, pareja_id, ctx }
 * Aplica preferencias y filtro de PWA instalada en bloque (2 consultas para todo el lote).
 * @returns {Promise<{ encoladas: number, omitidas: number }>}
 */
async function encolar(items) {
  const lista = (items || []).map(i => ({ ...i, dni: limpiarDni(i.dni) })).filter(i => i.dni && i.dedupe);
  if (!lista.length) return { encoladas: 0, omitidas: 0 };
  // Descarta en memoria lo ya registrado (evita trabajo; el índice único es la garantía final)
  const ya = new Set((await NotificationLog.findAll({ where: { dedupe_key: lista.map(i => i.dedupe) }, attributes: ['dedupe_key'], raw: true })).map(r => r.dedupe_key));
  const nuevos = lista.filter(i => !ya.has(i.dedupe));
  if (!nuevos.length) return { encoladas: 0, omitidas: 0 };

  const dnis = [...new Set(nuevos.map(i => i.dni))];
  const [prefs, subs] = await Promise.all([
    NotificationPreference.findAll({ where: { dni: dnis }, raw: true }),
    PlayerPushSubscription.findAll({ where: { dni: dnis, activo: true, installed: true }, attributes: ['dni'], raw: true }),
  ]);
  const prefDe = new Map(prefs.map(p => [p.dni, p]));
  const conApp = new Set(subs.map(s => s.dni));

  let encoladas = 0, omitidas = 0;
  const filas = nuevos.map(i => {
    const r = tpl.render(i.tipo, { ...i.ctx, nombre: i.nombre, torneo: i.torneo, pareja_id: i.pareja_id });
    const campo = tpl.PREFERENCIA[i.tipo];
    const pref = prefDe.get(i.dni);
    const motivo = campo && pref && !Number(pref[campo]) ? 'Desactivado por el jugador en sus preferencias'
      : !conApp.has(i.dni) ? 'El jugador no tiene la PWA instalada con notificaciones activas' : null;
    if (motivo) omitidas++; else encoladas++;
    return {
      dni: i.dni, nombre: i.nombre || null, id_tenant: i.torneo?.id_tenant ?? i.id_tenant ?? null,
      titulo: r.titulo.slice(0, 120), mensaje: r.mensaje, tipo: i.tipo, url: r.url,
      estado: motivo ? 'omitido' : 'pendiente', motivo,
      torneo_id: i.torneo?.id ?? null, partido_id: i.partido_id ?? null, pareja_id: i.pareja_id ?? null,
      payload_json: { actions: r.actions || [], ...(i.extra || {}) }, dedupe_key: i.dedupe.slice(0, 150),
      reenvio_de: i.reenvio_de ?? null,
    };
  });
  await NotificationLog.bulkCreate(filas, { ignoreDuplicates: true });   // INSERT IGNORE por dedupe_key
  if (encoladas) setImmediate(() => procesarCola().catch(e => console.error('[notif] cola', e.message)));
  return { encoladas, omitidas };
}

// ── Worker de la cola ─────────────────────────────────────────
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function tomarLote() {
  const ahora = new Date();
  const ids = (await NotificationLog.findAll({
    where: {
      [Op.or]: [
        { estado: 'pendiente', [Op.or]: [{ proximo_intento: null }, { proximo_intento: { [Op.lte]: ahora } }] },
        { estado: 'procesando', proximo_intento: { [Op.lt]: ahora } },   // lease vencido
      ],
    },
    attributes: ['id'], order: [['id', 'ASC']], limit: LOTE, raw: true,
  })).map(r => r.id);
  if (!ids.length) return [];
  // Lote único: solo este worker se queda con lo que marcó; el lease vence a los LEASE_MIN minutos
  const lote = crypto.randomUUID();
  await NotificationLog.update({ estado: 'procesando', lote, proximo_intento: new Date(ahora.getTime() + LEASE_MIN * 60000) }, { where: { id: ids, estado: ['pendiente', 'procesando'] } });
  return NotificationLog.findAll({ where: { lote, estado: 'procesando' } });
}

/** Envía un log a todos los dispositivos instalados del jugador. */
async function enviarLog(log) {
  const subs = await PlayerPushSubscription.findAll({ where: { dni: log.dni, activo: true, installed: true } });
  if (!subs.length) return log.update({ estado: 'omitido', motivo: 'Sin dispositivos con la PWA instalada', proximo_intento: null });
  const payload = {
    titulo: log.titulo, body: log.mensaje, url: log.url || '/jugador/dashboard', tipo: log.tipo,
    log_id: String(log.id), t: firmar(log.id), actions: log.payload_json?.actions || [],
    tag: `${log.tipo}-${log.partido_id || log.torneo_id || log.id}`,
  };
  const res = await Promise.all(subs.map(async (s) => {
    const r = await transport.send(s, payload);
    if (!r.ok && r.invalido) await s.update({ activo: false }).catch(() => {});
    return r;
  }));
  const ok = res.filter(r => r.ok).length;
  if (ok) return log.update({ estado: 'enviado', fecha_envio: new Date(), dispositivos: ok, intentos: log.intentos + 1, motivo: null, proximo_intento: null });
  const intentos = log.intentos + 1;
  const error = res.map(r => r.error).filter(Boolean).join(' | ').slice(0, 255);
  const reintentable = res.some(r => !r.invalido);
  if (reintentable && intentos < MAX_INTENTOS) {
    return log.update({ estado: 'pendiente', intentos, motivo: error, proximo_intento: new Date(Date.now() + BACKOFF_MIN[intentos - 1] * 60000) });
  }
  return log.update({ estado: 'fallido', intentos, motivo: error || 'Suscripciones inválidas', proximo_intento: null });
}

/**
 * Procesa la cola hasta vaciarla (en tandas con límite de velocidad). Si ya hay una corrida en
 * curso, el pedido no se pierde: se encadena UNA pasada más al terminar (lo encolado mientras
 * tanto se envía sin esperar al próximo tick del scheduler).
 */
let corrida = null;
let otraPasada = null;
function procesarCola() {
  if (corrida) {
    otraPasada ||= corrida.then(() => { otraPasada = null; return procesarCola(); });
    return otraPasada;
  }
  corrida = vaciarCola().finally(() => { corrida = null; });
  return corrida;
}
async function vaciarCola() {
  let total = 0;
  for (;;) {
    const lote = await tomarLote();
    if (!lote.length) break;
    for (let i = 0; i < lote.length; i += CONCURRENCIA) {
      const tanda = lote.slice(i, i + CONCURRENCIA);
      await Promise.all(tanda.map(l => enviarLog(l).catch(err => {
        console.error('[notif] envío', l.id, err.message);
        return l.update({ estado: 'pendiente', motivo: String(err.message).slice(0, 255), proximo_intento: new Date(Date.now() + 60000) }).catch(() => {});
      })));
      total += tanda.length;
      await esperar(PAUSA_MS);
    }
  }
  return total;
}

// ── Seguimiento (Service Worker) ──────────────────────────────
/** evento: 'entregado' (push recibido en el dispositivo) | 'abierto' (tocó la notificación) */
async function registrarSeguimiento(id, t, evento) {
  if (!id || !t || firmar(id) !== String(t)) return false;
  const log = await NotificationLog.findByPk(id);
  if (!log) return false;
  const ahora = new Date();
  if (evento === 'abierto') await log.update({ estado: 'abierto', abierto_at: log.abierto_at || ahora, entregado_at: log.entregado_at || ahora });
  else if (evento === 'entregado' && log.estado === 'enviado') await log.update({ estado: 'entregado', entregado_at: ahora });
  return true;
}

// ── Suscripciones del dispositivo ─────────────────────────────
function tipoDispositivo(ua = '') {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  return /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
}
function navegador(ua = '') {
  return /SamsungBrowser/i.test(ua) ? 'samsung' : /Edg/i.test(ua) ? 'edge' : /CriOS|Chrome/i.test(ua) ? 'chrome'
    : /Firefox|FxiOS/i.test(ua) ? 'firefox' : /Safari/i.test(ua) ? 'safari' : 'otro';
}

/**
 * Registra o actualiza el dispositivo (también rota el token de FCM).
 * body: { proveedor: 'fcm', fcm_token } | { subscription: { endpoint, keys } } + { installed }
 */
async function registrarDispositivo(dni, body = {}, userAgent = '') {
  const comun = {
    dni, installed: Boolean(body.installed), activo: true, last_active: new Date(),
    device_type: tipoDispositivo(userAgent), browser: navegador(userAgent), user_agent: String(userAgent).slice(0, 255) || null,
  };
  let where, datos;
  if (body.proveedor === 'fcm') {
    const token = String(body.fcm_token || '').trim();
    if (token.length < 20 || token.length > 512) throw Object.assign(new Error('Token FCM inválido.'), { status: 400 });
    where = { fcm_token: token };
    datos = { ...comun, proveedor: 'fcm', fcm_token: token };
    // Token rotado: el anterior del mismo dispositivo se reemplaza
    if (body.token_anterior && body.token_anterior !== token) await PlayerPushSubscription.destroy({ where: { fcm_token: String(body.token_anterior) } });
  } else {
    const s = body.subscription;
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) throw Object.assign(new Error('Suscripción push inválida.'), { status: 400 });
    where = { endpoint: s.endpoint };
    datos = { ...comun, proveedor: 'webpush', endpoint: s.endpoint, keys: s.keys };
  }
  const [row, creada] = await PlayerPushSubscription.findOrCreate({ where, defaults: datos });
  if (!creada) await row.update(datos);
  return row;
}

async function quitarDispositivo(dni, { endpoint, fcm_token } = {}) {
  const where = fcm_token ? { dni, fcm_token } : endpoint ? { dni, endpoint } : null;
  return where ? PlayerPushSubscription.destroy({ where }) : 0;
}

// ── Preferencias ──────────────────────────────────────────────
const CAMPOS_PREF = ['recordatorio_partidos', 'recordatorio_pagos', 'resultado_partidos', 'clasificaciones', 'finales', 'promociones'];
async function preferencias(dni) {
  const p = await NotificationPreference.findOne({ where: { dni }, raw: true });
  const def = { recordatorio_partidos: true, recordatorio_pagos: true, resultado_partidos: true, clasificaciones: true, finales: true, promociones: false };
  return Object.fromEntries(CAMPOS_PREF.map(k => [k, p ? Boolean(p[k]) : def[k]]));
}
async function guardarPreferencias(dni, body = {}) {
  const datos = Object.fromEntries(CAMPOS_PREF.filter(k => k in body).map(k => [k, Boolean(body[k])]));
  const [row, creada] = await NotificationPreference.findOrCreate({ where: { dni }, defaults: { dni, ...datos } });
  if (!creada) await row.update(datos);
  return preferencias(dni);
}

// ── API de alto nivel (usada por los jobs) ────────────────────
/** Envío directo a un jugador (fuera de los eventos automáticos; ej. aviso del club). */
function sendPush({ dni, nombre, titulo, mensaje, url, torneo, dedupe }) {
  return encolar([{ tipo: 'manual', dni, nombre, torneo, dedupe: dedupe || `manual:${limpiarDni(dni)}:${Date.now()}`, ctx: { titulo, mensaje, url } }]);
}
/** Notificación de torneo a una lista de destinatarios (mismo tipo / contexto). */
const sendTournamentNotification = (tipo, torneo, destinatarios, base = {}) =>
  encolar(destinatarios.map(d => ({ tipo, torneo, ...base, ...d })));
const sendMatchReminder = (torneo, destinatarios, ctx) => sendTournamentNotification('recordatorio_partido', torneo, destinatarios, { ctx });
const sendPaymentReminder = (torneo, destinatarios) => sendTournamentNotification('recordatorio_pago', torneo, destinatarios);
const sendChampionNotification = (torneo, destinatarios) => sendTournamentNotification('campeon', torneo, destinatarios);
const sendRunnerUpNotification = (torneo, destinatarios) => sendTournamentNotification('subcampeon', torneo, destinatarios);

// ── Panel administrativo ──────────────────────────────────────
async function listar(idTenant, q = {}) {
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const page = Math.max(1, Number(q.page) || 1);
  const where = { id_tenant: idTenant };
  if (q.torneo_id) where.torneo_id = Number(q.torneo_id);
  if (q.estado) where.estado = String(q.estado).split(',');
  if (q.tipo) where.tipo = String(q.tipo);
  if (q.jugador) {
    const j = String(q.jugador).trim();
    where[Op.or] = [{ dni: { [Op.like]: `${limpiarDni(j) || j}%` } }, { nombre: { [Op.like]: `%${j}%` } }];
  }
  const { rows, count } = await NotificationLog.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset: (page - 1) * limit });
  return { items: rows, total: count, page, limit };
}

async function metricas(idTenant, q = {}) {
  const where = { id_tenant: idTenant, ...(q.torneo_id && { torneo_id: Number(q.torneo_id) }) };
  const filas = await NotificationLog.findAll({
    where, attributes: ['estado', 'tipo', [m.sequelize.fn('COUNT', m.sequelize.col('id')), 'n']], group: ['estado', 'tipo'], raw: true,
  });
  const c = (estados) => filas.filter(f => estados.includes(f.estado)).reduce((a, f) => a + Number(f.n), 0);
  const enviadas = c(['enviado', 'entregado', 'abierto']);
  const entregadas = c(['entregado', 'abierto']);
  const abiertas = c(['abierto']);
  const fallidas = c(['fallido']);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  // Jugadores del club (por torneos del club) con la PWA instalada y notificaciones activas
  const [[{ instalados }]] = await m.sequelize.query(
    `SELECT COUNT(DISTINCT s.dni) instalados FROM player_push_subscriptions s
       WHERE s.activo = 1 AND s.installed = 1 AND s.dni IN (
         SELECT j.dni FROM torneo_jugadores j JOIN torneo_parejas p ON p.id = j.pareja_id JOIN torneos t ON t.id = p.torneo_id
         WHERE t.id_tenant = :club ${q.torneo_id ? 'AND t.id = :torneo' : ''})`,
    { replacements: { club: idTenant, torneo: Number(q.torneo_id) || 0 } });
  const porTipo = {};
  for (const f of filas) {
    porTipo[f.tipo] ||= { total: 0, enviadas: 0, abiertas: 0, fallidas: 0, omitidas: 0 };
    const t = porTipo[f.tipo]; const n = Number(f.n);
    t.total += n;
    if (['enviado', 'entregado', 'abierto'].includes(f.estado)) t.enviadas += n;
    if (f.estado === 'abierto') t.abiertas += n;
    if (f.estado === 'fallido') t.fallidas += n;
    if (f.estado === 'omitido') t.omitidas += n;
  }
  return {
    total: c(['pendiente', 'procesando', 'enviado', 'entregado', 'abierto', 'fallido', 'omitido']),
    enviadas, entregadas, abiertas, fallidas, omitidas: c(['omitido']), pendientes: c(['pendiente', 'procesando']),
    ctr: pct(abiertas, entregadas), tasa_entrega: pct(entregadas, enviadas + fallidas),
    usuarios_pwa: Number(instalados) || 0, por_tipo: porTipo,
    proveedor: transport.fcmActivo() ? 'fcm' : 'webpush', disponible: transport.disponible(),
  };
}

/** Reenvía una notificación (nuevo registro enlazado al original; vuelve a validar destinatario). */
async function reenviar(idTenant, id) {
  const o = await NotificationLog.findOne({ where: { id, id_tenant: idTenant } });
  if (!o) throw Object.assign(new Error('Notificación no encontrada'), { status: 404 });
  const conApp = await PlayerPushSubscription.count({ where: { dni: o.dni, activo: true, installed: true } });
  const nueva = await NotificationLog.create({
    dni: o.dni, nombre: o.nombre, id_tenant: o.id_tenant, titulo: o.titulo, mensaje: o.mensaje, tipo: o.tipo, url: o.url,
    torneo_id: o.torneo_id, partido_id: o.partido_id, pareja_id: o.pareja_id, payload_json: o.payload_json,
    estado: conApp ? 'pendiente' : 'omitido', motivo: conApp ? null : 'El jugador no tiene la PWA instalada con notificaciones activas',
    dedupe_key: `reenvio:${o.id}:${Date.now()}`, reenvio_de: o.id,
  });
  if (conApp) setImmediate(() => procesarCola().catch(() => {}));
  return nueva;
}

module.exports = {
  encolar, procesarCola, enviarLog, registrarSeguimiento, firmar,
  registrarDispositivo, quitarDispositivo, preferencias, guardarPreferencias,
  sendPush, sendTournamentNotification, sendMatchReminder, sendPaymentReminder, sendChampionNotification, sendRunnerUpNotification,
  listar, metricas, reenviar,
};
