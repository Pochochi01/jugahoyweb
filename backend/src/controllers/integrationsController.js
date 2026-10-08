'use strict';
/**
 * controllers/integrationsController.js
 * Administración de las credenciales por club (multi-tenant).
 *
 * Rutas (montadas bajo /api/settings/:complexId, con los mismos guards que el
 * resto de configuración: acceso al complejo + permiso `configuracion`):
 *   GET   /api/settings/:complexId/integrations         → estado (tokens ENMASCARADOS)
 *   PUT   /api/settings/:complexId/integrations         → alta/actualización
 *   POST  /api/settings/:complexId/integrations/renew-meta → renueva el token de Meta
 *
 * Seguridad: los tokens NUNCA se devuelven completos, solo un flag + últimos 4
 * caracteres. Se escriben, no se leen.
 */
const integrations = require('../services/integrations.service');

/** '••••1234' — nunca devolvemos el token completo */
function mask(token) {
  if (!token) return null;
  const s = String(token);
  return `••••${s.slice(-4)}`;
}

// ── GET estado de las integraciones del club ─────────────────
async function getIntegrations(req, res) {
  try {
    const clubId = Number(req.params.complexId);
    const integ  = await integrations.getIntegration(clubId);
    const meta   = await integrations.getMetaCredentials(clubId, { soloMeta: true });
    const mp     = await require('../services/mercadopagoOAuth.service').estado(clubId);

    res.json({
      club_id: clubId,
      whatsapp: {
        configurado:      meta.configured,
        origen:           meta.source,                 // 'club' | 'env' | 'none'
        phone_number_id:  meta.phoneNumberId || null,  // no es secreto
        access_token:     mask(meta.accessToken),
        token_origen:     meta.tokenSource || null,    // 'club' | 'env'
        token_automatico: meta.tokenSource === 'env',  // asignado desde la plataforma
        // ¿Hay un System User token de plataforma disponible para autoasignar?
        token_plataforma: Boolean(process.env.META_ACCESS_TOKEN),
        verify_token_set: Boolean(integ?.meta_webhook_verify_token),
        app_secret_set:   Boolean(integ?.meta_app_secret),
        vencido:          meta.expired,
      },
      // MercadoPago: conexión OAuth del complejo (solo lectura; se conecta desde Configuración)
      mercadopago: { conectado: mp.conectado, estado: mp.estado, correo_vinculado: mp.correo_vinculado, expires_at: mp.expires_at },
      wa_provider: integ?.wa_provider || 'meta',
      fecha_expiracion_token: integ?.fecha_expiracion_token || null,
      activo: integ?.activo ?? true,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

// ── PUT alta/actualización ───────────────────────────────────
async function updateIntegrations(req, res) {
  try {
    const clubId = Number(req.params.complexId);
    const {
      meta_phone_number_id, meta_access_token, meta_webhook_verify_token, meta_app_secret,
      fecha_expiracion_token, activo,
      wa_provider,
    } = req.body || {};

    if (wa_provider !== undefined && !['meta', 'baileys'].includes(wa_provider)) {
      return res.status(400).json({ message: 'wa_provider debe ser "meta" o "baileys".' });
    }

    // Validaciones básicas de formato (evita guardar basura silenciosamente)
    if (meta_phone_number_id !== undefined && meta_phone_number_id !== null
        && !/^\d{5,}$/.test(String(meta_phone_number_id).trim())) {
      return res.status(400).json({ message: 'meta_phone_number_id debe ser numérico (ID del número en Meta).' });
    }

    const row = await integrations.upsertIntegration(clubId, {
      meta_phone_number_id, meta_access_token, meta_webhook_verify_token, meta_app_secret,
      fecha_expiracion_token, activo,
      wa_provider,
    });

    res.json({ ok: true, club_id: row.club_id, message: 'Integraciones actualizadas.' });
  } catch (err) {
    // phone_number_id duplicado → ya lo usa otro club
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Ese número de WhatsApp ya está asignado a otro club.' });
    }
    res.status(err.status || 500).json({ message: err.message });
  }
}

// ── POST renovar token de Meta ───────────────────────────────
async function renewMeta(req, res) {
  try {
    const clubId = Number(req.params.complexId);
    const result = await integrations.renewMetaLongLivedToken(clubId);
    res.json({ ok: true, fecha_expiracion_token: result.expira, message: 'Token de Meta renovado.' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

// ── Baileys (WhatsApp Web) ───────────────────────────────────
const baileys = require('../services/baileysService');

async function baileysEstado(req, res) {
  try { res.json(await baileys.estado(req.params.complexId)); }
  catch (err) { res.status(err.status || 500).json({ message: err.message }); }
}

/** Inicia la sesión; el QR aparece en GET …/baileys a los pocos segundos. */
async function baileysConectar(req, res) {
  try {
    await baileys.conectar(req.params.complexId);
    res.json(await baileys.estado(req.params.complexId));
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
}

async function baileysDesconectar(req, res) {
  try {
    await baileys.desconectar(req.params.complexId);
    res.json({ ok: true });
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
}

// ── Configuración de Chatbot (administrador del complejo) ────
/**
 * GET /api/settings/:complexId/chatbot → proveedor elegido + estado de cada uno.
 * Los tokens nunca se devuelven completos.
 */
async function getChatbot(req, res) {
  try {
    const clubId = Number(req.params.complexId);
    const integ = await integrations.getIntegration(clubId);
    const meta = await integrations.getMetaCredentials(clubId, { soloMeta: true });
    res.json({
      chat_provider: integ?.wa_provider || 'meta',
      meta: {
        configurado: meta.configured && meta.source === 'club',
        phone_number_id: integ?.meta_phone_number_id || null,
        access_token: mask(integ?.meta_access_token),
        token_plataforma: !integ?.meta_access_token && Boolean(process.env.META_ACCESS_TOKEN),
        vencido: meta.expired,
      },
      baileys: await baileys.estado(clubId),
    });
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
}

/**
 * PUT /api/settings/:complexId/chatbot { chat_provider, meta_phone_number_id?, meta_access_token? }
 * Cambiar de proveedor NO borra las credenciales del otro: un club que vuelve a
 * Meta sigue con su número y token tal cual estaban.
 */
async function updateChatbot(req, res) {
  try {
    const clubId = Number(req.params.complexId);
    const { chat_provider, meta_phone_number_id, meta_access_token } = req.body || {};
    if (!['meta', 'baileys'].includes(chat_provider)) return res.status(400).json({ message: 'Elegí el proveedor: Meta API o Baileys.' });
    const integ = await integrations.getIntegration(clubId);
    const data = { wa_provider: chat_provider };
    if (chat_provider === 'meta') {
      const phone = meta_phone_number_id !== undefined ? String(meta_phone_number_id || '').trim() : integ?.meta_phone_number_id;
      if (!phone || !/^\d{5,}$/.test(phone)) return res.status(400).json({ message: 'Ingresá el Phone Number ID de Meta (numérico).' });
      const tieneToken = (meta_access_token && String(meta_access_token).trim()) || integ?.meta_access_token || process.env.META_ACCESS_TOKEN;
      if (!tieneToken) return res.status(400).json({ message: 'Ingresá el Access Token de Meta.' });
      data.meta_phone_number_id = phone;
      if (meta_access_token && String(meta_access_token).trim()) data.meta_access_token = String(meta_access_token).trim();
    }
    await integrations.upsertIntegration(clubId, data);
    if (chat_provider === 'baileys') baileys.conectar(clubId).catch(() => {});   // abre la sesión (QR si no hay)
    res.json({ ok: true, chat_provider, message: chat_provider === 'baileys'
      ? 'Chatbot configurado con Baileys. Escaneá el QR para vincular el teléfono.'
      : 'Chatbot configurado con la API oficial de Meta.' });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ese número de WhatsApp ya está asignado a otro complejo.' });
    res.status(err.status || 500).json({ message: err.message });
  }
}

module.exports = { getChatbot, updateChatbot, getIntegrations, updateIntegrations, renewMeta, baileysEstado, baileysConectar, baileysDesconectar };
