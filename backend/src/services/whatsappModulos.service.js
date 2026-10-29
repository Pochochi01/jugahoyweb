'use strict';
/**
 * services/whatsappModulos.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Asignación de WhatsApp por MÓDULO. Un número del club (club_integrations) solo
 * puede usarse para los módulos habilitados en club_whatsapp_modulos; sin fila se
 * toma el valor por defecto del catálogo whatsapp_modulos (agenda, reservas y
 * recordatorios ON; torneos, escuelas, profesores, etc. OFF).
 *
 * Todo envío automático pide sus credenciales con credencialesPara(clubId, modulo),
 * que valida en orden:
 *   1. Club activo · 2. WhatsApp habilitado · 3. Número conectado
 *   4. Sesión válida (token no vencido) · 5. Módulo autorizado
 * Si algo falla registra el motivo y devuelve credenciales BLOQUEADAS
 * ({ bloqueado: true }): wa.sendMessage las descarta sin enviar y sin lanzar,
 * así ningún flujo del sistema se rompe por un permiso.
 *
 * Preparado para varios números por club: los permisos cuelgan del id de la
 * integración (número), no del club.
 */
const { WhatsappModulo, ClubWhatsappModulo, Complex } = require('../models');
const integrations = require('./integrations.service');

const CACHE_TTL_MS = 60_000;
const cache = new Map();          // clubId → { modulos: {clave: bool}, exp }
let catalogoCache = null;         // { filas, exp }
const LOG_CADA_MS = 10 * 60_000;  // el mismo bloqueo se registra a lo sumo cada 10 min (los crons corren seguido)
const ultimoLog = new Map();

async function catalogo() {
  if (catalogoCache && catalogoCache.exp > Date.now()) return catalogoCache.filas;
  const filas = await WhatsappModulo.findAll({ where: { activo: true }, order: [['orden', 'ASC']], raw: true });
  catalogoCache = { filas, exp: Date.now() + CACHE_TTL_MS };
  return filas;
}

function invalidar(clubId) {
  if (clubId === undefined) cache.clear(); else cache.delete(Number(clubId));
}

/** Mapa { modulo: habilitado } del número del club (defaults del catálogo + filas propias). */
async function permisosDe(clubId) {
  const id = Number(clubId);
  const hit = cache.get(id);
  if (hit && hit.exp > Date.now()) return hit.modulos;
  const cat = await catalogo();
  const modulos = Object.fromEntries(cat.map(m => [m.clave, m.canal !== 'manual' && Boolean(m.habilitado_por_defecto)]));
  const manuales = new Set(cat.filter(m => m.canal === 'manual').map(m => m.clave));
  const integ = await integrations.getIntegration(id);
  if (integ?.id) {
    const filas = await ClubWhatsappModulo.findAll({ where: { club_integration_id: integ.id }, raw: true });
    // Los módulos de canal manual nunca quedan habilitados, haya o no fila
    for (const f of filas) if (f.modulo in modulos && !manuales.has(f.modulo)) modulos[f.modulo] = Boolean(f.habilitado);
  }
  cache.set(id, { modulos, exp: Date.now() + CACHE_TTL_MS });
  return modulos;
}

/** ¿El número del club puede usarse para `modulo`? Módulo desconocido = NO. */
async function autorizado(clubId, modulo) {
  if (!clubId) return false;
  try {
    const p = await permisosDe(clubId);
    return p[modulo] === true;
  } catch (err) {
    console.error(`[WhatsApp][módulos] club ${clubId}: no se pudieron leer permisos (${err.message}) → se bloquea "${modulo}".`);
    return false;
  }
}

/** Listado para el panel: catálogo con el estado del número del club. */
async function listar(clubId) {
  const [cat, p] = await Promise.all([catalogo(), permisosDe(clubId)]);
  return cat.map(m => ({ clave: m.clave, nombre: m.nombre, descripcion: m.descripcion, canal: m.canal || 'automatico', habilitado: p[m.clave] === true, por_defecto: Boolean(m.habilitado_por_defecto) }));
}

/**
 * Guarda los permisos del número del club. `cambios` = { modulo: boolean }.
 * Crea la integración si no existe (los permisos cuelgan de ella).
 */
async function guardar(clubId, cambios = {}, userId = null) {
  const cat = await catalogo();
  const validas = new Set(cat.map(m => m.clave));
  const entradas = Object.entries(cambios);
  const invalida = entradas.find(([k, v]) => !validas.has(k) || typeof v !== 'boolean');
  if (invalida) { const e = new Error(`Módulo o valor inválido: ${invalida[0]}.`); e.status = 400; throw e; }
  const manual = entradas.find(([k, v]) => v && cat.find(m => m.clave === k)?.canal === 'manual');
  if (manual) {
    const e = new Error(`${cat.find(m => m.clave === manual[0]).nombre} se comunica solo desde el WhatsApp del dispositivo: no puede usar el número del club.`);
    e.status = 400; throw e;
  }

  const integ = await integrations.upsertIntegration(clubId, {});
  for (const [modulo, habilitado] of entradas) {
    const [fila, creada] = await ClubWhatsappModulo.findOrCreate({
      where: { club_integration_id: integ.id, modulo },
      defaults: { club_integration_id: integ.id, modulo, habilitado, updated_by: userId },
    });
    if (!creada && fila.habilitado !== habilitado) await fila.update({ habilitado, updated_by: userId });
  }
  invalidar(clubId);
  console.log(`[WhatsApp][módulos] club ${clubId}: permisos actualizados por usuario ${userId ?? '?'} → ${entradas.map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(', ')}`);
  return listar(clubId);
}

/** ¿El módulo solo se comunica desde el WhatsApp del dispositivo? (canal = manual en el catálogo) */
async function esManual(modulo) {
  return (await catalogo()).some(m => m.clave === modulo && m.canal === 'manual');
}

/** Credenciales que wa.sendMessage descarta sin enviar. Conservan appSecret/verifyToken (webhook). */
function bloqueadas(base, modulo, motivo) {
  return { ...(base || {}), phoneNumberId: null, accessToken: null, configured: false, bloqueado: true, modulo, motivo };
}

/**
 * Credenciales de envío para un MÓDULO. Nunca lanza.
 * @param {number} clubId
 * @param {string} modulo — clave de whatsapp_modulos ('agenda', 'reservas', 'recordatorios', 'torneos', …)
 * @param {{ creds?: object }} [opts] — credenciales ya resueltas (evita re-leerlas)
 */
async function credencialesPara(clubId, modulo, opts = {}) {
  const log = (motivo) => {
    const k = `${clubId}|${modulo}|${motivo}`;
    if ((ultimoLog.get(k) || 0) > Date.now() - LOG_CADA_MS) return;
    ultimoLog.set(k, Date.now());
    console.warn(`[WhatsApp][módulos] envío BLOQUEADO · club ${clubId ?? '?'} · módulo "${modulo}" · ${motivo}`);
  };
  let creds = opts.creds || null;
  try {
    // Módulos de canal manual: nunca usan el número del club (ni chatbot, ni Meta, ni Baileys)
    if ((await esManual(modulo))) { log('módulo de canal manual (solo WhatsApp del dispositivo)'); return bloqueadas(null, modulo, 'solo_manual'); }
    if (!clubId) { log('sin club'); return bloqueadas(null, modulo, 'sin_club'); }
    const club = await Complex.findByPk(clubId, { attributes: ['id', 'activo'], raw: true });
    if (!club || club.activo === false || club.activo === 0) { log('club inactivo o inexistente'); return bloqueadas(null, modulo, 'club_inactivo'); }

    const integ = await integrations.getIntegration(clubId);
    if (integ && integ.activo === false) { log('WhatsApp deshabilitado en la integración'); return bloqueadas(null, modulo, 'whatsapp_deshabilitado'); }

    creds = creds || await integrations.getMetaCredentials(clubId);
    if (!creds?.configured) { log('número no conectado'); return bloqueadas(creds, modulo, 'sin_numero'); }
    if (creds.expired) { log('sesión inválida (token vencido)'); return bloqueadas(creds, modulo, 'sesion_invalida'); }
    if (creds.provider === 'baileys') {
      const est = await require('./baileysService').estado(clubId).catch(() => null);
      if (est?.estado !== 'conectado') { log(`sesión de WhatsApp Web no conectada (${est?.estado || 'desconocido'})`); return bloqueadas(creds, modulo, 'sesion_invalida'); }
    }

    if (!(await autorizado(clubId, modulo))) { log('módulo no autorizado para este número'); return bloqueadas(creds, modulo, 'modulo_no_autorizado'); }
    return { ...creds, modulo };
  } catch (err) {
    log(`error validando (${err.message})`);
    return bloqueadas(creds, modulo, 'error');
  }
}

module.exports = { esManual, catalogo, permisosDe, autorizado, listar, guardar, credencialesPara, invalidar };
