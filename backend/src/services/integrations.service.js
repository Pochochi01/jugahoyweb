'use strict';
/**
 * services/integrations.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Punto ÚNICO de resolución de credenciales por club (multi-tenant).
 *
 * Nadie más debe leer process.env.META_* ni MP_ACCESS_TOKEN: todos los servicios
 * (WhatsApp, MercadoPago) piden las credenciales acá pasando el `clubId`.
 *
 * Orden de resolución (cascada), pensado para que dev y prod convivan sin
 * múltiples archivos .env:
 *   1) club_integrations  → credenciales propias del club  (fuente principal)
 *   2) complexes.mercadopago_token → compatibilidad con lo ya cargado (solo MP)
 *   3) process.env        → fallback de plataforma / desarrollo
 *
 * Incluye caché en memoria con TTL para no golpear la BD en cada mensaje de
 * WhatsApp, e invalidación explícita al actualizar una integración.
 */
const axios = require('axios');
const { ClubIntegration, Complex } = require('../models');

const CACHE_TTL_MS = 60_000; // 1 minuto
const cacheByClub  = new Map(); // clubId          → { data, exp }
const cacheByPhone = new Map(); // phoneNumberId   → { clubId, exp }

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

// ── Caché ────────────────────────────────────────────────────
function cacheGet(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) { map.delete(key); return null; }
  return hit;
}
function cacheSet(map, key, value) {
  map.set(key, { ...value, exp: Date.now() + CACHE_TTL_MS });
}
/** Invalida la caché de un club (llamar al guardar credenciales) */
function invalidate(clubId) {
  cacheByClub.delete(Number(clubId));
  for (const [phone, v] of cacheByPhone) if (v.clubId === Number(clubId)) cacheByPhone.delete(phone);
}

// ── Lectura base ─────────────────────────────────────────────
/** Fila de club_integrations del club (o null). Cacheada. */
async function getIntegration(clubId) {
  if (!clubId) return null;
  const id = Number(clubId);
  const hit = cacheGet(cacheByClub, id);
  if (hit) return hit.data;

  const row = await ClubIntegration.findOne({ where: { club_id: id } });
  const data = row ? row.toJSON() : null;
  cacheSet(cacheByClub, id, { data });
  return data;
}

/** ¿El token del club está vencido? (solo si tiene fecha cargada) */
function isExpired(integration) {
  if (!integration?.fecha_expiracion_token) return false;
  return new Date(integration.fecha_expiracion_token).getTime() <= Date.now();
}

// ── Meta / WhatsApp ──────────────────────────────────────────
/**
 * Credenciales de WhatsApp del club. Nunca lanza: devuelve flags para que el
 * llamador decida (el webhook entrante no debe romper por un club mal configurado).
 * @returns {Promise<{phoneNumberId, accessToken, appSecret, verifyToken, configured:boolean, expired:boolean, source:'club'|'env'|'none'}>}
 */
async function getMetaCredentials(clubId) {
  const integ = await getIntegration(clubId);

  // ── Escenario A (números propios de la plataforma) ──────────────────────────
  // El NÚMERO es propio del club (su meta_phone_number_id). El access token puede
  // ser uno propio del club o, si no cargó, el System User COMPARTIDO de plataforma
  // (.env META_ACCESS_TOKEN), que se asigna AUTOMÁTICAMENTE. Nunca se toma el
  // NÚMERO del env para un club: eso respondería desde el número equivocado.
  if (integ?.meta_phone_number_id && integ.activo !== false) {
    const clubToken = integ.meta_access_token && String(integ.meta_access_token).trim();
    const token = clubToken || process.env.META_ACCESS_TOKEN || null;
    if (token) {
      return {
        phoneNumberId: integ.meta_phone_number_id,
        accessToken:   token,
        appSecret:     integ.meta_app_secret || process.env.META_APP_SECRET || null,
        verifyToken:   integ.meta_webhook_verify_token || process.env.META_WEBHOOK_VERIFY_TOKEN || null,
        configured:    true,
        // El token de plataforma (System User) no vence; solo se evalúa el del club.
        expired:       clubToken ? isExpired(integ) : false,
        source:        'club',                          // el número es del club
        tokenSource:   clubToken ? 'club' : 'env',      // de dónde salió el token
      };
    }
  }

  // Fallback de plataforma (desarrollo / instalación single-tenant).
  // MULTI-TENANT: SOLO se usa para el complejo declarado en CHATBOT_COMPLEX_ID
  // (o cuando no se pidió un club puntual). NUNCA para otro club, porque
  // devolver el número/token de .env respondería DESDE EL NÚMERO EQUIVOCADO
  // (síntoma "todos los mensajes caen al primer número").
  const envPhone = process.env.META_PHONE_NUMBER_ID;
  const envToken = process.env.META_ACCESS_TOKEN;
  const envComplexId = process.env.CHATBOT_COMPLEX_ID ? parseInt(process.env.CHATBOT_COMPLEX_ID) : null;
  // Para un club puntual, el fallback de .env SOLO aplica si es el complejo del env.
  const permiteEnvFallback = !clubId || (envComplexId !== null && Number(clubId) === envComplexId);
  if (envPhone && envToken && permiteEnvFallback) {
    return {
      phoneNumberId: envPhone,
      accessToken:   envToken,
      appSecret:     process.env.META_APP_SECRET || null,
      verifyToken:   process.env.META_WEBHOOK_VERIFY_TOKEN || null,
      configured:    true,
      expired:       false,
      source:        'env',
      tokenSource:   'env',
    };
  }

  return {
    phoneNumberId: null, accessToken: null,
    appSecret:     process.env.META_APP_SECRET || null,
    verifyToken:   process.env.META_WEBHOOK_VERIFY_TOKEN || null,
    configured: false, expired: false, source: 'none',
  };
}

/** Igual que getMetaCredentials pero lanza si no se pueden usar. */
async function requireMetaCredentials(clubId) {
  const creds = await getMetaCredentials(clubId);
  if (!creds.configured) {
    const e = new Error('Este club no tiene WhatsApp configurado.'); e.status = 400; e.code = 'META_NOT_CONFIGURED';
    throw e;
  }
  if (creds.expired) {
    const e = new Error('El token de WhatsApp del club está vencido. Renovalo en Integraciones.');
    e.status = 401; e.code = 'META_TOKEN_EXPIRED';
    throw e;
  }
  return creds;
}

/**
 * Enrutado del webhook ENTRANTE: Meta manda `metadata.phone_number_id`, que
 * identifica el número → y por lo tanto el club. Cacheado.
 * @returns {Promise<number|null>} club_id
 */
async function findClubIdByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const key = String(phoneNumberId);
  const hit = cacheGet(cacheByPhone, key);
  if (hit) return hit.clubId;

  const row = await ClubIntegration.findOne({
    where: { meta_phone_number_id: key },
    attributes: ['club_id'],
  });
  let clubId = row ? row.club_id : null;

  // Compat: instalación single-tenant con el número en .env
  if (!clubId && process.env.META_PHONE_NUMBER_ID === key && process.env.CHATBOT_COMPLEX_ID) {
    clubId = parseInt(process.env.CHATBOT_COMPLEX_ID);
  }

  cacheSet(cacheByPhone, key, { clubId });
  return clubId;
}

// ── MercadoPago ──────────────────────────────────────────────
/**
 * Access token de MercadoPago del club (cascada: integración → complexes → env).
 * @returns {Promise<string|null>}
 */
async function getMercadoPagoToken(clubId) {
  const integ = await getIntegration(clubId);
  if (integ?.mercadopago_access_token && integ.activo !== false && !isExpired(integ)) {
    return integ.mercadopago_access_token.trim();
  }

  // Compatibilidad con el token cargado desde el panel (complexes.mercadopago_token)
  if (clubId) {
    const complex = await Complex.findByPk(clubId, { attributes: ['mercadopago_token'] });
    const legacy = complex?.mercadopago_token;
    if (legacy && legacy.trim()) return legacy.trim();
  }

  return process.env.MP_ACCESS_TOKEN || null;
}

/** Igual que getMercadoPagoToken pero lanza si no hay token usable. */
async function requireMercadoPagoToken(clubId) {
  const integ = await getIntegration(clubId);
  if (integ?.mercadopago_access_token && isExpired(integ)) {
    const e = new Error('El token de MercadoPago del club está vencido. Renovalo en Integraciones.');
    e.status = 401; e.code = 'MP_TOKEN_EXPIRED';
    throw e;
  }
  const token = await getMercadoPagoToken(clubId);
  if (!token) {
    const e = new Error('Este club no tiene MercadoPago configurado.'); e.status = 400; e.code = 'MP_NOT_CONFIGURED';
    throw e;
  }
  return token;
}

// ── Alta / actualización ─────────────────────────────────────
/**
 * Crea o actualiza las credenciales de un club. Solo pisa los campos enviados.
 * Invalida la caché para que el cambio tome efecto inmediato.
 */
async function upsertIntegration(clubId, data = {}) {
  const id = Number(clubId);
  const permitidos = [
    'meta_phone_number_id', 'meta_access_token', 'meta_webhook_verify_token', 'meta_app_secret',
    'mercadopago_access_token', 'mercadopago_refresh_token', 'fecha_expiracion_token', 'activo',
  ];
  const patch = {};
  for (const k of permitidos) if (data[k] !== undefined) patch[k] = data[k];

  const [row, created] = await ClubIntegration.findOrCreate({
    where: { club_id: id },
    defaults: { club_id: id, ...patch },
  });
  if (!created && Object.keys(patch).length) await row.update(patch);

  invalidate(id);
  return row;
}

// ── Vencimiento / renovación ─────────────────────────────────
/**
 * Integraciones cuyo token vence dentro de `dias` (para avisos o cron).
 */
async function getExpiringSoon(dias = 7) {
  const { Op } = require('sequelize');
  const limite = new Date(Date.now() + dias * 86_400_000);
  return ClubIntegration.findAll({
    where: { activo: true, fecha_expiracion_token: { [Op.ne]: null, [Op.lte]: limite } },
    include: [{ model: Complex, as: 'club', attributes: ['id', 'nombre', 'email'] }],
  });
}

/**
 * Renueva el token de Meta intercambiándolo por uno de larga duración (60 días).
 * Requiere META_APP_ID + META_APP_SECRET de la app de plataforma.
 *
 * ⚠️ Solo aplica a tokens de USUARIO. Los "System User Token" de Meta Business
 * son permanentes y NO se renuevan (ni lo necesitan): en ese caso dejá
 * `fecha_expiracion_token` en NULL y este método no se usa.
 */
async function renewMetaLongLivedToken(clubId) {
  const appId     = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    const e = new Error('Faltan META_APP_ID / META_APP_SECRET para renovar el token.');
    e.status = 400; e.code = 'META_APP_MISSING'; throw e;
  }
  const integ = await getIntegration(clubId);
  if (!integ?.meta_access_token) {
    const e = new Error('El club no tiene token de Meta cargado.'); e.status = 400; throw e;
  }

  const { data } = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: {
      grant_type:        'fb_exchange_token',
      client_id:         appId,
      client_secret:     appSecret,
      fb_exchange_token: integ.meta_access_token,
    },
    timeout: 8000,
  });

  const expira = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  await upsertIntegration(clubId, {
    meta_access_token:      data.access_token,
    fecha_expiracion_token: expira,
  });
  console.log(`[integrations] token de Meta renovado para club ${clubId}` +
    (expira ? ` (vence ${expira.toISOString()})` : ''));
  return { access_token: data.access_token, expira };
}

module.exports = {
  getIntegration,
  isExpired,
  invalidate,
  // Meta
  getMetaCredentials,
  requireMetaCredentials,
  findClubIdByPhoneNumberId,
  renewMetaLongLivedToken,
  // MercadoPago
  getMercadoPagoToken,
  requireMercadoPagoToken,
  // Administración
  upsertIntegration,
  getExpiringSoon,
};
