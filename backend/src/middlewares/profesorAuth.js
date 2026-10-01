'use strict';
/**
 * middlewares/profesorAuth.js
 * Sesión de profesor: JWT { tipo: 'profesor', dni }. Un mismo DNI puede tener
 * un registro en cada complejo; el token identifica a la PERSONA y cada ruta
 * /club/:complexId resuelve el registro de ese complejo (aislamiento por tenant).
 *
 * Deja: req.profesorDni, req.profesores (todos sus registros activos) y, en
 * rutas de complejo, req.profesor + req.clubId.
 */
const jwt = require('jsonwebtoken');
const { Profesor, Field } = require('../models');

const signProfesor = (dni) => jwt.sign({ tipo: 'profesor', dni }, process.env.JWT_SECRET, { expiresIn: '12h' });

async function authProfesor(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token requerido' });
  let payload;
  try { payload = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET); } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
  if (payload.tipo !== 'profesor' || !payload.dni) return res.status(401).json({ message: 'Token no válido para profesores' });
  try {
    const profesores = await Profesor.findAll({ where: { dni: payload.dni, activo: true } });
    if (!profesores.length) return res.status(401).json({ message: 'Tu acceso fue dado de baja.' });
    req.profesorDni = payload.dni;
    req.profesores = profesores;
    next();
  } catch (err) { next(err); }
}

/** Resuelve el registro del profesor en :complexId (403 si no trabaja ahí). */
function profesorEnClub(req, res, next) {
  const clubId = Number(req.params.complexId);
  const p = req.profesores.find(x => x.id_tenant === clubId);
  if (!p) return res.status(403).json({ message: 'No trabajás en este complejo.' });
  req.profesor = p;
  req.clubId = clubId;
  next();
}

/** @deprecated usar requireModulo('profesores') de middlewares/canchas (pádel o fútbol). */
async function requirePadel(req, res, next) {
  const n = await Field.count({ where: { complex_id: Number(req.params.complexId), deporte: 'padel' } });
  if (!n) return res.status(400).json({ message: 'El complejo no tiene canchas de pádel.', code: 'SIN_PADEL' });
  next();
}

module.exports = { signProfesor, authProfesor, profesorEnClub, requirePadel };
