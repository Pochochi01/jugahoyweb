'use strict';
/**
 * controllers/profesorPanelController.js
 * Panel del PROFESOR: login por DNI, selección de complejo, grilla de horarios,
 * alta/edición/baja de clases con alumnos y vista consolidada multi-complejo.
 */
const bcrypt = require('bcryptjs');
const { Profesor, Complex } = require('../models');
const svc = require('../services/profesores/profesorService');
const { signProfesor } = require('../middlewares/profesorAuth');
const { actividadesProfesor } = require('../services/actividadesService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

async function complejosDe(profesores) {
  const clubs = await Complex.findAll({ where: { id: profesores.map(p => p.id_tenant) }, attributes: ['id', 'nombre', 'ciudad', 'direccion'] });
  return profesores.map(p => ({ profesor_id: p.id, ...clubs.find(c => c.id === p.id_tenant)?.toJSON() }));
}

/** POST /api/profesores/login { dni, password } → token + complejos donde trabaja. */
async function login(req, res) {
  try {
    const dni = String(req.body?.dni || '').replace(/\D/g, '');
    const password = String(req.body?.password || '');
    if (!dni || !password) return res.status(400).json({ message: 'Ingresá DNI y contraseña.' });
    const registros = await Profesor.scope('withPassword').findAll({ where: { dni, activo: true } });
    // Cada complejo guarda su propio hash: entran solo los registros cuya clave coincide
    const validos = [];
    for (const r of registros) if (await bcrypt.compare(password, r.password)) validos.push(r);
    if (!validos.length) return res.status(401).json({ message: 'DNI o contraseña incorrectos' });
    res.json({
      token: signProfesor(dni),
      profesor: { dni, nombre: validos[0].nombre, apellido: validos[0].apellido },
      complejos: await complejosDe(validos),
    });
  } catch (err) { send(res, err); }
}

async function complejos(req, res) {
  try { res.json(await complejosDe(req.profesores)); } catch (err) { send(res, err); }
}

async function grilla(req, res) {
  try { res.json(await svc.grilla(req.profesor, req.query)); } catch (err) { send(res, err); }
}

async function consolidado(req, res) {
  try { res.json(await svc.consolidado(req.profesorDni, req.query)); } catch (err) { send(res, err); }
}

/** GET /me/actividades → escuelas (categorías + horarios) y torneos asignados, por complejo. */
async function actividades(req, res) {
  try { res.json(await actividadesProfesor(req.profesores)); } catch (err) { send(res, err); }
}

async function crearClase(req, res) {
  try { res.status(201).json(await svc.crearClase(req.profesor, req.body || {})); } catch (err) { send(res, err); }
}

async function editarClase(req, res) {
  try { res.json(await svc.editarClase(req.profesor, req.params.id, req.body || {})); } catch (err) { send(res, err); }
}

async function cancelarClase(req, res) {
  try { res.json(await svc.cancelarClase([req.profesor.id], req.params.id)); } catch (err) { send(res, err); }
}

module.exports = { login, complejos, grilla, consolidado, actividades, crearClase, editarClase, cancelarClase };
