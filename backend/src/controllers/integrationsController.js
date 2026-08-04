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
    const meta   = await integrations.getMetaCredentials(clubId);
    const mpTok  = await integrations.getMercadoPagoToken(clubId);

    res.json({
      club_id: clubId,
      whatsapp: {
        configurado:      meta.configured,
        origen:           meta.source,                 // 'club' | 'env' | 'none'
        phone_number_id:  meta.phoneNumberId || null,  // no es secreto
        access_token:     mask(meta.accessToken),
        verify_token_set: Boolean(integ?.meta_webhook_verify_token),
        app_secret_set:   Boolean(integ?.meta_app_secret),
        vencido:          meta.expired,
      },
      mercadopago: {
        configurado:  Boolean(mpTok),
        origen:       integ?.mercadopago_access_token ? 'club' : (mpTok ? 'legacy/env' : 'none'),
        access_token: mask(mpTok),
        ambiente:     mpTok ? (mpTok.startsWith('TEST-') ? 'sandbox' : 'production') : null,
      },
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
      mercadopago_access_token, mercadopago_refresh_token, fecha_expiracion_token, activo,
    } = req.body || {};

    // Validaciones básicas de formato (evita guardar basura silenciosamente)
    if (meta_phone_number_id !== undefined && meta_phone_number_id !== null
        && !/^\d{5,}$/.test(String(meta_phone_number_id).trim())) {
      return res.status(400).json({ message: 'meta_phone_number_id debe ser numérico (ID del número en Meta).' });
    }
    if (mercadopago_access_token) {
      const t = String(mercadopago_access_token).trim();
      if (!t.startsWith('TEST-') && !t.startsWith('APP_USR-')) {
        return res.status(400).json({ message: 'El token de MercadoPago debe empezar con TEST- o APP_USR-.' });
      }
    }

    const row = await integrations.upsertIntegration(clubId, {
      meta_phone_number_id, meta_access_token, meta_webhook_verify_token, meta_app_secret,
      mercadopago_access_token, mercadopago_refresh_token, fecha_expiracion_token, activo,
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

module.exports = { getIntegrations, updateIntegrations, renewMeta };
