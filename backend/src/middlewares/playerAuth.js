'use strict';
/**
 * middlewares/playerAuth.js — Sesión del Portal de Jugador.
 * JWT { tipo: 'jugador', dni, rol: 'ROLE_PLAYER' }. Los middlewares de staff (authenticate,
 * authTorneoStaff, authProfesor) rechazan este token: no trae `id` de usuario y su `tipo`
 * no es el de ellos, así que un jugador nunca llega a rutas de escritura.
 */
const jwt = require('jsonwebtoken');
const { PlayerAccess } = require('../models');

const ROLE_PLAYER = 'ROLE_PLAYER';
const PERMISOS_JUGADOR = Object.freeze(['CAN_VIEW_OWN_TOURNAMENTS', 'CAN_VIEW_OWN_LEAGUES', 'CAN_VIEW_BRACKETS', 'CAN_VIEW_STANDINGS', 'CAN_VIEW_MATCHES']);

const signJugador = (acceso) => jwt.sign({ tipo: 'jugador', dni: acceso.dni, rol: ROLE_PLAYER }, process.env.JWT_SECRET, { expiresIn: '12h' });

async function authJugador(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token requerido' });
  let payload;
  try { payload = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET); } catch {
    return res.status(401).json({ message: 'Sesión vencida. Ingresá de nuevo.' });
  }
  if (payload.tipo !== 'jugador' || !payload.dni) return res.status(401).json({ message: 'Token no válido para el portal de jugador' });
  try {
    const acceso = await PlayerAccess.findOne({ where: { dni: payload.dni } });
    if (!acceso || !acceso.activo) return res.status(401).json({ message: 'Tu acceso fue deshabilitado.' });
    req.jugadorDni = acceso.dni;
    req.playerAccess = acceso;
    req.permisos = PERMISOS_JUGADOR;
    next();
  } catch (err) { next(err); }
}

/** Cambio de contraseña pendiente → solo puede cambiarla (y ver su perfil). */
function claveAlDia(req, res, next) {
  if (req.playerAccess?.must_change_password) return res.status(403).json({ message: 'Tenés que cambiar tu contraseña antes de continuar.', code: 'MUST_CHANGE_PASSWORD' });
  next();
}

/** Exige un permiso de lectura del rol (todos los del rol son de solo lectura). */
const puedeVer = (permiso) => (req, res, next) => (req.permisos?.includes(permiso) ? next() : res.status(403).json({ message: 'Sin permiso' }));

module.exports = { authJugador, claveAlDia, puedeVer, signJugador, ROLE_PLAYER, PERMISOS_JUGADOR };
