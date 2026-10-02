'use strict';
/**
 * controllers/mercadopagoAuthController.js — conexión OAuth de cada complejo
 *
 *   GET    /api/auth/mercadopago/connect?complex_id=   → { url } de autorización
 *   GET    /api/auth/mercadopago/callback?code&state   → guarda tokens y vuelve al panel
 *   GET    /api/auth/mercadopago/:complexId/estado     → conectado, correo, vencimiento
 *   POST   /api/auth/mercadopago/:complexId/renovar    → renovar el token ahora (verificación)
 *   DELETE /api/auth/mercadopago/:complexId            → desvincular la cuenta
 *
 * Por qué /connect devuelve la URL en vez de redirigir: el panel se autentica con
 * Bearer token, que un navegador no envía al seguir un link. El frontend pide la
 * URL (autenticado) y recién ahí navega a MercadoPago.
 */
const mp = require('../services/mercadopagoOAuth.service');
const { frontendUrl } = require('../config/urls');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });

async function connect(req, res) {
  try {
    const complexId = Number(req.params.complexId || req.query.complex_id);
    res.json({ url: mp.urlAutorizacion(complexId, req.user.id) });
  } catch (err) { send(res, err); }
}

/** Vuelta desde MercadoPago. Siempre redirige al panel con el resultado (nunca muestra JSON al usuario). */
async function callback(req, res) {
  const volver = (params) => res.redirect(frontendUrl(`/dashboard?${new URLSearchParams(params)}`));
  try {
    // El usuario canceló o MP devolvió error
    if (req.query.error) {
      const complexId = (() => { try { return mp.leerState(req.query.state).complex_id; } catch { return ''; } })();
      return volver({ mp: 'error', mp_msg: req.query.error === 'access_denied' ? 'Cancelaste la autorización en MercadoPago.' : `MercadoPago: ${req.query.error_description || req.query.error}`, complex: complexId });
    }
    const r = await mp.conectar(req.query.code, req.query.state);
    return volver({ mp: 'conectado', complex: r.complex_id, mp_email: r.correo_vinculado || '' });
  } catch (err) {
    console.error('[MP OAuth] callback:', err.message);
    return volver({ mp: 'error', mp_msg: err.message });
  }
}

async function estado(req, res) {
  try { res.json(await mp.estado(Number(req.params.complexId))); } catch (err) { send(res, err); }
}

async function renovar(req, res) {
  try {
    await mp.renovar(Number(req.params.complexId));
    res.json({ ok: true, ...(await mp.estado(Number(req.params.complexId))) });
  } catch (err) { send(res, err); }
}

async function desconectar(req, res) {
  try { await mp.desconectar(Number(req.params.complexId)); res.json({ ok: true }); } catch (err) { send(res, err); }
}

module.exports = { connect, callback, estado, renovar, desconectar };
