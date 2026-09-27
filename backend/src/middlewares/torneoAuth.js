'use strict';
/**
 * middlewares/torneoAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Autenticación + aislamiento multi-tenant del módulo Torneos.
 *
 * Dos tipos de credencial conviven en /api/torneos/club/:complexId/...
 *   1. JWT de User (general_admin, complex_admin, collaborator con permiso 'torneos')
 *   2. JWT de Organizador  → payload { id, tipo: 'organizador', id_tenant }
 *
 * En ambos casos queda:
 *   req.clubId       → complejo (tenant) sobre el que se opera
 *   req.organizador  → instancia de TorneoOrganizador (solo organizadores)
 *   req.torneo       → cargado por loadTorneo, SIEMPRE filtrado por id_tenant
 */
const jwt = require('jsonwebtoken');
const { User, Torneo, TorneoOrganizador } = require('../models');
const { requireComplexAccess, requirePermission } = require('./roles');

const ORG_TOKEN_TTL = '12h';

function signOrganizador(org) {
  return jwt.sign({ id: org.id, tipo: 'organizador', id_tenant: org.id_tenant }, process.env.JWT_SECRET, { expiresIn: ORG_TOKEN_TTL });
}

function leerToken(req) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.split(' ')[1] : null;
}

/** Acepta User u Organizador; valida acceso al :complexId de la ruta. */
async function authTorneoStaff(req, res, next) {
  const token = leerToken(req);
  if (!token) return res.status(401).json({ message: 'Token requerido' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
  const complexId = Number(req.params.complexId);

  try {
    if (payload.tipo === 'organizador') {
      const org = await TorneoOrganizador.findByPk(payload.id);
      if (!org || !org.activo) return res.status(401).json({ message: 'Organizador no válido' });
      if (org.id_tenant !== complexId) return res.status(403).json({ message: 'Sin acceso a este club' });
      req.organizador = org;
      req.clubId = complexId;
      return next();
    }

    const user = await User.findByPk(payload.id);
    if (!user || !user.activo) return res.status(401).json({ message: 'Usuario no válido' });
    req.user = user;
    req.clubId = complexId;
    // Reutiliza los guards existentes: acceso al complejo + permiso de colaborador
    return requireComplexAccess(req, res, (err) => {
      if (err) return next(err);
      return requirePermission('torneos')(req, res, next);
    });
  } catch (err) {
    next(err);
  }
}

/** Solo administradores del club (no organizadores): p. ej. CRUD de organizadores. */
function requireClubAdmin(req, res, next) {
  if (req.organizador) return res.status(403).json({ message: 'Solo el administrador del club puede hacer esto.' });
  next();
}

/** Carga :torneoId garantizando que pertenezca al club de la request. */
async function loadTorneo(req, res, next) {
  try {
    const torneo = await Torneo.findOne({ where: { id: req.params.torneoId, id_tenant: req.clubId } });
    if (!torneo) return res.status(404).json({ message: 'Torneo no encontrado' });
    req.torneo = torneo;
    next();
  } catch (err) { next(err); }
}

/** Auth opcional para endpoints públicos (asocia user_id a la inscripción si hay sesión). */
async function optionalUser(req, _res, next) {
  const token = leerToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.tipo !== 'organizador') req.user = await User.findByPk(payload.id);
    } catch { /* anónimo */ }
  }
  next();
}

module.exports = { signOrganizador, authTorneoStaff, requireClubAdmin, loadTorneo, optionalUser };
