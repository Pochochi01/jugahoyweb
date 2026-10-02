'use strict';
/**
 * controllers/mercadopagoAuthController.js — conexión OAuth + PKCE de cada complejo
 *
 *   GET    /api/auth/mercadopago/connect?complex_id=&code_challenge=  → { url } de autorización
 *   GET    /api/auth/mercadopago/callback?code&state   ← MercadoPago vuelve acá (MP_REDIRECT_URI)
 *                                                        → reenvía al frontend /mercadopago/callback
 *   POST   /api/auth/mercadopago/callback { code, state, code_verifier } → canjea y guarda tokens
 *   GET    /api/auth/mercadopago/:complexId/estado     → conectado, correo, vencimiento
 *   POST   /api/auth/mercadopago/:complexId/renovar    → renovar el token ahora (verificación)
 *   DELETE /api/auth/mercadopago/:complexId            → desvincular la cuenta
 *
 * PKCE: el code_verifier lo genera y guarda el NAVEGADOR (localStorage), por eso
 * el canje no puede hacerse en el redirect del backend: la vuelta pasa por una
 * página del frontend que lee el verifier y lo manda acá junto con el código.
 *
 * Por qué /connect devuelve la URL en vez de redirigir: el panel se autentica con
 * Bearer token, que un navegador no envía al seguir un link.
 */
const mp = require('../services/mercadopagoOAuth.service');
const { frontendUrl } = require('../config/urls');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });

async function connect(req, res) {
  try {
    const complexId = Number(req.params.complexId || req.query.complex_id);
    res.json({ url: mp.urlAutorizacion(complexId, req.user.id, req.query.code_challenge) });
  } catch (err) { send(res, err); }
}

/**
 * Vuelta desde MercadoPago (navegador). No canjea nada: reenvía code/state/error
 * a la página del frontend, que tiene el code_verifier y termina la conexión.
 * Así la Redirect URL configurada en MercadoPago sigue siendo la del backend.
 */
function callbackRedirect(req, res) {
  const params = new URLSearchParams();
  for (const k of ['code', 'state', 'error', 'error_description']) if (req.query[k]) params.set(k, String(req.query[k]));
  res.redirect(frontendUrl(`/mercadopago/callback?${params}`));
}

/** POST { code, state, code_verifier } — lo llama la página /mercadopago/callback (con la sesión del usuario). */
async function callbackCanje(req, res) {
  try {
    const { code, state, code_verifier: verifier } = req.body || {};
    const r = await mp.conectar(code, state, verifier, req.user.id);
    res.json({ ok: true, complex_id: r.complex_id, correo_vinculado: r.correo_vinculado });
  } catch (err) {
    console.error('[MP OAuth] callback:', err.message);
    send(res, err);
  }
}

/** Para mostrar el complejo correcto aunque la autorización haya fallado. */
function complejoDelState(req, res) {
  try { res.json({ complex_id: mp.leerState(req.query.state).complex_id }); } catch { res.json({ complex_id: null }); }
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

module.exports = { connect, callbackRedirect, callbackCanje, complejoDelState, estado, renovar, desconectar };
