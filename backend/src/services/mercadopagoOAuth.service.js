'use strict';
/**
 * services/mercadopagoOAuth.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Conexión OFICIAL con MercadoPago por OAuth (Marketplace / "Conectar cuenta").
 * Cada complejo vincula SU cuenta; la plataforma nunca ve ni pide su contraseña
 * y ya no existen access tokens pegados a mano.
 *
 * Flujo (OAuth 2.0 + PKCE S256):
 *   1. El navegador genera code_verifier (aleatorio, queda en localStorage) y
 *      code_challenge = BASE64URL(SHA256(verifier)).
 *   2. urlAutorizacion(complexId, userId, codeChallenge) → https://auth.mercadopago.com/authorization
 *      con code_challenge + code_challenge_method=S256 y `state` firmado
 *      (complejo + usuario + challenge + nonce, vence en 10 min).
 *   3. MP redirige a MP_REDIRECT_URI (/api/auth/mercadopago/callback), que reenvía
 *      el navegador a la página /mercadopago/callback del frontend (ahí está el verifier).
 *   4. El frontend envía code + state + code_verifier → conectar() verifica que
 *      SHA256(verifier) coincida con el challenge firmado → POST /oauth/token
 *      (authorization_code + code_verifier) → access_token + refresh_token +
 *      expires_in, y GET /users/me → email.
 *      Se guarda todo CIFRADO en mercadopago_tokens (1 fila por complejo).
 *   4. accessTokenValido(complexId) → token listo para usar. Si vence dentro del
 *      margen, lo RENUEVA antes (POST /oauth/token grant_type=refresh_token).
 *      Renovaciones concurrentes del mismo complejo se unifican en una sola
 *      (MP invalida el refresh_token usado: dos renovaciones a la vez romperían
 *      la conexión).
 *   5. renovarProximosAVencer() → el scheduler renueva proactivamente.
 *
 * Variables de entorno:
 *   MP_CLIENT_ID, MP_CLIENT_SECRET   credenciales de la app (MercadoPago Developers)
 *   MP_REDIRECT_URI                  ej. https://api.jugahoy.com.ar/api/auth/mercadopago/callback
 *                                    (debe coincidir EXACTO con la configurada en la app)
 *   MP_TOKEN_ENCRYPTION_KEY          clave de cifrado de tokens (ver utils/cifrado.js)
 *   MP_AUTH_URL / MP_API_URL         solo para pruebas (mock); por defecto los de MP
 */
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { MercadoPagoToken } = require('../models');
const { cifrar, descifrar } = require('../utils/cifrado');

const AUTH_URL = () => process.env.MP_AUTH_URL || 'https://auth.mercadopago.com/authorization';
const API_URL  = () => process.env.MP_API_URL || 'https://api.mercadopago.com';
const MARGEN_RENOVACION_MS = 7 * 24 * 3600 * 1000;   // renovar si vence en menos de 7 días
const STATE_TTL = '10m';

function httpError(status, message, code) { return Object.assign(new Error(message), { status, code }); }

function credenciales() {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  const redirectUri = process.env.MP_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw httpError(503, 'MercadoPago no está configurado en el servidor (MP_CLIENT_ID, MP_CLIENT_SECRET, MP_REDIRECT_URI).', 'MP_OAUTH_NO_CONFIG');
  }
  return { clientId, clientSecret, redirectUri };
}
const configurado = () => Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET && process.env.MP_REDIRECT_URI);

// ── PKCE (RFC 7636) ───────────────────────────────────────────
// code_verifier: 43–128 caracteres [A-Z a-z 0-9 - . _ ~]
// code_challenge = BASE64URL(SHA256(code_verifier)) → 43 caracteres (método S256)
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;
const challengeDe = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url');

// ── 1. URL de autorización ────────────────────────────────────
/**
 * El code_challenge lo genera el NAVEGADOR (que guarda el verifier en localStorage).
 * Se firma dentro del `state` para que el callback pueda comprobar que el verifier
 * que llega corresponde a ESTA solicitud (no a otra) antes de canjear el código.
 */
function urlAutorizacion(complexId, userId, codeChallenge) {
  const { clientId, redirectUri } = credenciales();
  if (!CHALLENGE_RE.test(String(codeChallenge || ''))) {
    throw httpError(400, 'Falta el code_challenge (PKCE S256) o es inválido.', 'MP_PKCE_INVALIDO');
  }
  const state = jwt.sign(
    { tipo: 'mp_oauth', complex_id: Number(complexId), user_id: userId, cc: codeChallenge, nonce: crypto.randomBytes(8).toString('hex') },
    process.env.JWT_SECRET, { expiresIn: STATE_TTL },
  );
  const params = new URLSearchParams({
    client_id: clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri,
    code_challenge: codeChallenge, code_challenge_method: 'S256',
  });
  return `${AUTH_URL()}?${params}`;
}

/** Valida el `state` del callback (firma, tipo y vencimiento). */
function leerState(state) {
  try {
    const p = jwt.verify(String(state || ''), process.env.JWT_SECRET);
    if (p.tipo !== 'mp_oauth' || !p.complex_id) throw new Error('tipo');
    return p;
  } catch {
    throw httpError(400, 'La solicitud de conexión venció o no es válida. Volvé a intentar desde el panel.', 'MP_STATE_INVALIDO');
  }
}

// ── Llamadas a la API de OAuth ────────────────────────────────
async function pedirToken(body) {
  const { clientId, clientSecret } = credenciales();
  try {
    const { data } = await axios.post(`${API_URL()}/oauth/token`,
      { client_id: clientId, client_secret: clientSecret, ...body },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    if (!data?.access_token || !data?.refresh_token) throw new Error('Respuesta sin tokens');
    return data;
  } catch (err) {
    const mp = err.response?.data;
    const e = httpError(err.response?.status === 400 ? 400 : 502,
      `MercadoPago rechazó la solicitud: ${mp?.message || mp?.error || err.message}`, mp?.error === 'invalid_grant' ? 'MP_INVALID_GRANT' : 'MP_OAUTH_ERROR');
    e.mp = mp;
    throw e;
  }
}

async function datosCuenta(accessToken) {
  try {
    const { data } = await axios.get(`${API_URL()}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });
    return { email: data.email || null, id: data.id != null ? String(data.id) : null };
  } catch {
    return { email: null, id: null };   // no bloquea la conexión: el email es informativo
  }
}

function filaDesdeToken(data, extra = {}) {
  const expiresIn = Number(data.expires_in) || 15552000;   // MP: 180 días
  return {
    access_token: cifrar(data.access_token),
    refresh_token: cifrar(data.refresh_token),
    expires_in: expiresIn,
    expires_at: new Date(Date.now() + expiresIn * 1000),
    public_key: data.public_key || null,
    live_mode: data.live_mode !== false,
    scope: data.scope || null,
    estado: 'conectado',
    ultimo_error: null,
    ...extra,
  };
}

// ── 3. Callback: code → tokens ────────────────────────────────
/**
 * Canjea el código por tokens (PKCE).
 * @param {string} code          authorization_code que devolvió MercadoPago
 * @param {string} state         state firmado (complejo + usuario + code_challenge)
 * @param {string} codeVerifier  el que el navegador guardó al iniciar la conexión
 * @param {number} usuarioActual quien completa la conexión (debe ser quien la inició)
 * @returns {Promise<{complex_id, correo_vinculado}>}
 */
async function conectar(code, state, codeVerifier, usuarioActual) {
  const { complex_id: complexId, user_id: userId, cc } = leerState(state);
  if (!code) throw httpError(400, 'MercadoPago no devolvió el código de autorización.', 'MP_SIN_CODE');
  if (usuarioActual != null && Number(usuarioActual) !== Number(userId)) {
    throw httpError(403, 'La conexión la tiene que terminar el mismo usuario que la inició.', 'MP_USUARIO_DISTINTO');
  }
  // PKCE: el verifier debe ser el que generó el challenge firmado en el state
  if (!VERIFIER_RE.test(String(codeVerifier || '')) || challengeDe(codeVerifier) !== cc) {
    throw httpError(400, 'No se pudo validar la conexión (PKCE). Volvé a tocar "Conectar con MercadoPago" desde el mismo navegador.', 'MP_PKCE_INVALIDO');
  }
  const { redirectUri } = credenciales();
  const data = await pedirToken({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri, code_verifier: codeVerifier });
  const cuenta = await datosCuenta(data.access_token);
  const fila = filaDesdeToken(data, {
    correo_vinculado: cuenta.email,
    mp_user_id: cuenta.id || (data.user_id != null ? String(data.user_id) : null),
    conectado_por: userId || null,
    renovado_at: new Date(),
  });
  const [row, creado] = await MercadoPagoToken.findOrCreate({ where: { complex_id: complexId }, defaults: { complex_id: complexId, ...fila } });
  if (!creado) await row.update(fila);
  invalidarCache(complexId);
  return { complex_id: complexId, correo_vinculado: fila.correo_vinculado };
}

// ── 4. Token válido (con renovación automática) ───────────────
const renovando = new Map();   // complexId → Promise (renovación en curso)
const cache = new Map();       // complexId → { token, exp } (evita descifrar en cada request)
function invalidarCache(complexId) { cache.delete(Number(complexId)); }

/** Renueva el access_token del complejo con su refresh_token (una sola vez aunque lo pidan varios). */
function renovar(complexId) {
  const id = Number(complexId);
  if (renovando.has(id)) return renovando.get(id);
  const p = (async () => {
    const row = await MercadoPagoToken.scope('conTokens').findOne({ where: { complex_id: id } });
    if (!row || row.estado !== 'conectado') throw httpError(400, 'El complejo no tiene MercadoPago conectado.', 'MP_NOT_CONNECTED');
    try {
      const data = await pedirToken({ grant_type: 'refresh_token', refresh_token: descifrar(row.refresh_token) });
      await row.update(filaDesdeToken(data, { renovado_at: new Date() }));
      invalidarCache(id);
      console.log(`[MP OAuth] token renovado · complejo ${id} · vence ${row.expires_at.toISOString().slice(0, 10)}`);
      return data.access_token;
    } catch (err) {
      // invalid_grant = el usuario revocó el permiso o el refresh_token ya no sirve → reconectar
      if (err.code === 'MP_INVALID_GRANT') {
        await row.update({ estado: 'revocado', ultimo_error: 'La autorización fue revocada o venció. Volvé a conectar la cuenta.' });
        invalidarCache(id);
        throw httpError(401, 'La conexión con MercadoPago se perdió: hay que volver a conectar la cuenta.', 'MP_REVOCADO');
      }
      await row.update({ ultimo_error: String(err.message).slice(0, 255) });
      throw err;
    }
  })().finally(() => renovando.delete(id));
  renovando.set(id, p);
  return p;
}

/**
 * Access token listo para usar con el SDK/API de MercadoPago.
 * @throws 400 MP_NOT_CONNECTED · 401 MP_REVOCADO
 */
async function accessTokenValido(complexId) {
  const id = Number(complexId);
  if (!id) throw httpError(400, 'Falta el complejo para cobrar con MercadoPago.', 'MP_NOT_CONNECTED');
  const hit = cache.get(id);
  if (hit && hit.exp - Date.now() > MARGEN_RENOVACION_MS) return hit.token;

  const row = await MercadoPagoToken.scope('conTokens').findOne({ where: { complex_id: id } });
  if (!row) throw httpError(400, 'Este complejo no conectó su cuenta de MercadoPago.', 'MP_NOT_CONNECTED');
  if (row.estado !== 'conectado') throw httpError(401, 'La conexión con MercadoPago se perdió: hay que volver a conectar la cuenta.', 'MP_REVOCADO');

  if (new Date(row.expires_at).getTime() - Date.now() <= MARGEN_RENOVACION_MS) return renovar(id);
  const token = descifrar(row.access_token);
  cache.set(id, { token, exp: new Date(row.expires_at).getTime() });
  return token;
}

/** ¿Puede cobrar online? (para mostrar u ocultar "pagar con MercadoPago") */
async function puedeCobrar(complexId) {
  const n = await MercadoPagoToken.count({ where: { complex_id: complexId, estado: 'conectado' } });
  return n > 0;
}

/** Estado para el panel (sin tokens). */
async function estado(complexId) {
  const row = await MercadoPagoToken.findOne({ where: { complex_id: complexId } });
  return {
    oauth_configurado: configurado(),
    conectado: Boolean(row && row.estado === 'conectado'),
    estado: row?.estado || 'desconectado',
    correo_vinculado: row?.correo_vinculado || null,
    mp_user_id: row?.mp_user_id || null,
    live_mode: row ? row.live_mode : null,
    expires_at: row?.expires_at || null,
    renovado_at: row?.renovado_at || null,
    ultimo_error: row?.ultimo_error || null,
    conectado_desde: row?.created_at || row?.createdAt || null,
  };
}

/** Desvincula la cuenta (borra los tokens de la base). */
async function desconectar(complexId) {
  await MercadoPagoToken.destroy({ where: { complex_id: complexId } });
  invalidarCache(complexId);
}

// ── 5. Renovación proactiva (scheduler) ───────────────────────
async function renovarProximosAVencer({ dias = 15 } = {}) {
  const limite = new Date(Date.now() + dias * 24 * 3600 * 1000);
  const filas = await MercadoPagoToken.findAll({ where: { estado: 'conectado', expires_at: { [Op.lte]: limite } }, attributes: ['complex_id'] });
  const resultado = { renovados: 0, fallidos: 0 };
  for (const f of filas) {
    try { await renovar(f.complex_id); resultado.renovados++; }
    catch (err) { resultado.fallidos++; console.error(`[MP OAuth] no se pudo renovar complejo ${f.complex_id}:`, err.message); }
  }
  return resultado;
}

function iniciarRenovacionAutomatica(horas = 12) {
  const correr = () => renovarProximosAVencer().catch(err => console.error('[MP OAuth] scheduler:', err.message));
  setTimeout(correr, 30 * 1000).unref?.();
  return setInterval(correr, horas * 3600 * 1000).unref?.();
}

module.exports = {
  configurado, urlAutorizacion, leerState, conectar,
  accessTokenValido, renovar, puedeCobrar, estado, desconectar,
  renovarProximosAVencer, iniciarRenovacionAutomatica, invalidarCache,
};
