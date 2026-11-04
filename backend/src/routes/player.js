'use strict';
/**
 * routes/player.js — Portal de Jugador, 100% SOLO LECTURA (montado en /api/player).
 *
 * Credenciales (únicas escrituras, y solo sobre player_access):
 *   POST /auth/login             { dni, password }  → token (clave inicial = DNI)
 *   POST /auth/change-password   { actual, nueva }  (obligatorio tras el primer ingreso)
 *   POST /auth/forgot            { dni }            → email con enlace de recuperación
 *   POST /auth/reset             { token, nueva }
 *   GET  /push/vapid-public-key · POST /push/subscribe { subscription } · POST /push/unsubscribe { endpoint }
 *
 * Lectura (ROLE_PLAYER; 403 si no participa en el torneo ni en su liga):
 *   GET /me · /dashboard · /tournaments?page&limit&liga_id&estado&todos=1
 *   GET /tournament/:id[?categoria_id] · /standings · /groups · /brackets · /matches?mios=1
 *   GET /league/:id · /league/:id/history?page&limit&temporada
 */
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const svc = require('../services/playerPortalService');
const { authJugador, claveAlDia, puedeVer, signJugador, ROLE_PLAYER, PERMISOS_JUGADOR } = require('../middlewares/playerAuth');

// Escrituras permitidas: solo credenciales y suscripción push del propio dispositivo (tablas del portal)
const AUTH = new Set(['/auth/login', '/auth/change-password', '/auth/forgot', '/auth/reset', '/push/subscribe', '/push/unsubscribe']);

// Candado de solo lectura: fuera de las credenciales, cualquier método que no sea GET → 405
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.method === 'POST' && AUTH.has(req.path)) return next();
  let dni = null;   // para la auditoría: DNI del token si es válido (no se exige sesión para bloquear)
  try { const p = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), process.env.JWT_SECRET); if (p.tipo === 'jugador') dni = p.dni; } catch { /* sin token válido */ }
  svc.log(req, 'write_blocked', { dni, recurso: `${req.method} ${req.path}`.slice(0, 60), status: 405 });
  return res.status(405).json({ message: 'El Portal de Jugador es de solo lectura.' });
});

const send = (req, res, err, recurso) => {
  const status = err.status || 500;
  if (status === 403) svc.log(req, 'denied', { recurso, recurso_id: req.params.id, status });
  if (status === 500) console.error('[player]', err);
  res.status(status).json({ message: status === 500 ? 'Error interno' : err.message });
};
const sesion = (acceso) => ({ token: signJugador(acceso), rol: ROLE_PLAYER, permisos: PERMISOS_JUGADOR, must_change_password: acceso.must_change_password });

router.post('/auth/login', async (req, res) => {
  try { res.json(sesion(await svc.login(req.body?.dni, req.body?.password, req))); } catch (e) { send(req, res, e, 'login'); }
});
router.post('/auth/forgot', async (req, res) => {
  try { await svc.solicitarRecuperacion(req.body?.dni, req); res.json({ message: 'Si el DNI tiene un email registrado, te enviamos un enlace para recuperar el acceso.' }); } catch (e) { send(req, res, e, 'forgot'); }
});
router.post('/auth/reset', async (req, res) => {
  try { await svc.restablecer(req.body?.token, req.body?.nueva, req); res.json({ message: 'Contraseña actualizada. Ya podés ingresar.' }); } catch (e) { send(req, res, e, 'reset'); }
});
router.post('/auth/change-password', authJugador, async (req, res) => {
  try { await svc.cambiarClave(req.playerAccess, req.body?.actual, req.body?.nueva, req); res.json(sesion(req.playerAccess)); } catch (e) { send(req, res, e, 'change-password'); }
});
// Web Push del dispositivo (no modifica datos de torneos)
const push = require('../services/playerPushService');
router.get('/push/vapid-public-key', (req, res) => res.json({ key: require('../services/notification.service').getVapidPublicKey() }));
router.post('/push/subscribe', authJugador, async (req, res) => {
  try { await push.suscribir(req.jugadorDni, req.body?.subscription, req.headers['user-agent']); svc.log(req, 'push_subscribe', { status: 201 }); res.status(201).json({ ok: true }); } catch (e) { send(req, res, e, 'push'); }
});
router.post('/push/unsubscribe', authJugador, async (req, res) => {
  try { await push.desuscribir(req.jugadorDni, req.body?.endpoint); res.json({ ok: true }); } catch (e) { send(req, res, e, 'push'); }
});
router.get('/me', authJugador, (req, res) => res.json({ dni: req.jugadorDni, rol: ROLE_PLAYER, permisos: PERMISOS_JUGADOR, must_change_password: req.playerAccess.must_change_password }));

// Lecturas: auditadas, con permiso explícito
const ver = (permiso, recurso, fn) => [authJugador, claveAlDia, puedeVer(permiso), async (req, res) => {
  try {
    const data = await fn(req);
    svc.log(req, 'view', { recurso, recurso_id: req.params.id, status: 200 });
    res.json(data);
  } catch (e) { send(req, res, e, recurso); }
}];

router.get('/dashboard',                    ...ver('CAN_VIEW_OWN_TOURNAMENTS', 'dashboard', r => svc.dashboard(r.playerAccess)));
router.get('/tournaments',                  ...ver('CAN_VIEW_OWN_TOURNAMENTS', 'tournaments', r => svc.torneos(r.playerAccess, r.query)));
router.get('/tournament/:id',               ...ver('CAN_VIEW_OWN_TOURNAMENTS', 'tournament', r => svc.torneo(r.playerAccess, r.params.id, r.query)));
router.get('/tournament/:id/standings',     ...ver('CAN_VIEW_STANDINGS', 'standings', r => svc.standings(r.playerAccess, r.params.id, r.query)));
router.get('/tournament/:id/groups',        ...ver('CAN_VIEW_STANDINGS', 'groups', r => svc.groups(r.playerAccess, r.params.id, r.query)));
router.get('/tournament/:id/brackets',      ...ver('CAN_VIEW_BRACKETS', 'brackets', r => svc.brackets(r.playerAccess, r.params.id, r.query)));
router.get('/tournament/:id/matches',       ...ver('CAN_VIEW_MATCHES', 'matches', r => svc.matches(r.playerAccess, r.params.id, r.query)));
router.get('/league/:id',                   ...ver('CAN_VIEW_OWN_LEAGUES', 'league', r => svc.liga(r.playerAccess, r.params.id)));
router.get('/league/:id/history',           ...ver('CAN_VIEW_OWN_LEAGUES', 'league-history', r => svc.ligaHistorial(r.playerAccess, r.params.id, r.query)));

module.exports = router;
