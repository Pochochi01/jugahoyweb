'use strict';
/**
 * controllers/torneoOrganizadoresController.js
 * Login de organizadores + CRUD (solo lo administra el club).
 */
const bcrypt = require('bcryptjs');
const { TorneoOrganizador, Complex } = require('../models');
const { signOrganizador } = require('../middlewares/torneoAuth');

const USUARIO_RE = /^[a-z0-9._-]{4,80}$/;

// ── POST /api/torneos/organizador/login ───────────────────────
async function login(req, res) {
  try {
    const usuario = String(req.body?.usuario || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const org = await TorneoOrganizador.scope('withPassword').findOne({ where: { usuario } });
    if (!org || !org.activo || !(await bcrypt.compare(password, org.password))) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }
    const club = await Complex.findByPk(org.id_tenant, { attributes: ['id', 'nombre', 'ciudad'] });
    res.json({
      token: signOrganizador(org),
      organizador: { id: org.id, nombre: org.nombre, usuario: org.usuario, id_tenant: org.id_tenant },
      club,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── GET /api/torneos/club/:complexId/organizador/me ───────────
async function me(req, res) {
  if (!req.organizador) return res.status(400).json({ message: 'No es una sesión de organizador' });
  const club = await Complex.findByPk(req.clubId, { attributes: ['id', 'nombre', 'ciudad'] });
  res.json({ organizador: req.organizador, club });
}

// ── CRUD (/api/torneos/club/:complexId/organizadores) ─────────
async function list(req, res) {
  const rows = await TorneoOrganizador.findAll({ where: { id_tenant: req.clubId }, order: [['nombre', 'ASC']] });
  res.json(rows);
}

function validar(body, { parcial = false } = {}) {
  const out = {};
  if (body.usuario !== undefined || !parcial) {
    const u = String(body.usuario || '').trim().toLowerCase();
    if (!USUARIO_RE.test(u)) throw Object.assign(new Error('Usuario: 4 a 80 caracteres (letras, números, . _ -).'), { status: 400 });
    out.usuario = u;
  }
  if (body.password !== undefined && body.password !== '' || !parcial) {
    if (String(body.password || '').length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres.'), { status: 400 });
    out.password = body.password;
  }
  if (body.nombre !== undefined) out.nombre = String(body.nombre).trim() || null;
  if (body.whatsapp !== undefined) out.whatsapp = String(body.whatsapp).replace(/\D/g, '') || null;
  if (body.activo !== undefined) out.activo = Boolean(body.activo);
  return out;
}

async function create(req, res) {
  try {
    const data = validar(req.body);
    data.password = await bcrypt.hash(data.password, 10);
    const org = await TorneoOrganizador.create({ ...data, id_tenant: req.clubId });
    res.status(201).json(await TorneoOrganizador.findByPk(org.id));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ese usuario ya existe.' });
    res.status(err.status || 500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const org = await TorneoOrganizador.findOne({ where: { id: req.params.id, id_tenant: req.clubId } });
    if (!org) return res.status(404).json({ message: 'Organizador no encontrado' });
    const data = validar(req.body, { parcial: true });
    if (data.password) data.password = await bcrypt.hash(data.password, 10);
    await org.update(data);
    res.json(await TorneoOrganizador.findByPk(org.id));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ese usuario ya existe.' });
    res.status(err.status || 500).json({ message: err.message });
  }
}

async function remove(req, res) {
  const n = await TorneoOrganizador.destroy({ where: { id: req.params.id, id_tenant: req.clubId } });
  if (!n) return res.status(404).json({ message: 'Organizador no encontrado' });
  res.json({ ok: true });
}

module.exports = { login, me, list, create, update, remove };
