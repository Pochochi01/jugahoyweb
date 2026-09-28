'use strict';
/**
 * controllers/profesoresController.js
 * Panel del ADMINISTRADOR del complejo: CRUD de profesores, ventanas de
 * canchas/horarios habilitadas para clases y agenda de cada profesor.
 * Rutas: /api/profesores/club/:complexId/...
 */
const bcrypt = require('bcryptjs');
const { Profesor, ProfesorCancha, HorarioProfesor, Field } = require('../models');
const svc = require('../services/profesores/profesorService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

function validar(body, parcial = false) {
  const out = {};
  const req = (k) => !parcial || body[k] !== undefined;
  if (req('nombre')) { out.nombre = String(body.nombre || '').trim(); if (out.nombre.length < 2) throw svc.httpError(400, 'Nombre requerido.'); }
  if (req('apellido')) { out.apellido = String(body.apellido || '').trim(); if (out.apellido.length < 2) throw svc.httpError(400, 'Apellido requerido.'); }
  if (req('dni')) {
    out.dni = String(body.dni || '').replace(/\D/g, '');
    if (!/^\d{7,9}$/.test(out.dni)) throw svc.httpError(400, 'DNI inválido (7 a 9 dígitos).');
  }
  if (body.whatsapp !== undefined) out.whatsapp = String(body.whatsapp || '').replace(/\D/g, '') || null;
  if (body.activo !== undefined) out.activo = Boolean(body.activo);
  return out;
}

const cargar = (req, id) => Profesor.findOne({ where: { id, id_tenant: req.clubId } });

async function list(req, res) {
  try {
    const profes = await Profesor.findAll({
      where: { id_tenant: req.clubId },
      include: [{ model: ProfesorCancha, as: 'disponibilidad' }],
      order: [['apellido', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(profes);
  } catch (err) { send(res, err); }
}

async function get(req, res) {
  const p = await Profesor.findOne({ where: { id: req.params.id, id_tenant: req.clubId }, include: [{ model: ProfesorCancha, as: 'disponibilidad' }] });
  if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
  res.json(p);
}

/** Alta: usuario = DNI y password = DNI (hasheado). */
async function create(req, res) {
  try {
    const d = validar(req.body);
    const p = await Profesor.create({ ...d, id_tenant: req.clubId, password: await bcrypt.hash(d.dni, 10) });
    res.status(201).json(await Profesor.findByPk(p.id));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ya hay un profesor con ese DNI en este complejo.' });
    send(res, err);
  }
}

async function update(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    const d = validar(req.body, true);
    if (d.dni && d.dni !== p.dni) d.password = await bcrypt.hash(d.dni, 10);   // la clave sigue siendo el DNI
    await p.update(d);
    res.json(await Profesor.findByPk(p.id));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ya hay un profesor con ese DNI en este complejo.' });
    send(res, err);
  }
}

/** Baja: cancela sus clases futuras (libera canchas) y elimina el registro. */
async function remove(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    const { Op } = require('sequelize');
    const futuras = await HorarioProfesor.findAll({ where: { profesor_id: p.id, estado: 'ocupado', fecha: { [Op.gte]: svc.hoyISO() } } });
    for (const c of futuras) await svc.cancelarClase([p.id], c.id);
    await p.destroy();
    res.json({ ok: true, clases_canceladas: futuras.length });
  } catch (err) { send(res, err); }
}

/** GET canchas de pádel del complejo (para asignar). */
async function canchas(req, res) {
  const fields = await Field.findAll({
    where: { complex_id: req.clubId, deporte: 'padel' },
    attributes: ['id', 'nombre', 'identificador', 'activa', 'hora_apertura', 'hora_cierre'],
    order: [['nombre', 'ASC']],
  });
  res.json(fields);
}

/**
 * PUT /:id/disponibilidad — reemplaza las ventanas del profesor.
 * body: { ventanas: [{ field_id, dia_semana (0-6), hora_desde 'HH:00', hora_hasta 'HH:00' }] }
 * Las clases ya cargadas se conservan aunque queden fuera de las nuevas ventanas.
 */
async function setDisponibilidad(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    const ventanas = svc.validarVentanas(req.body?.ventanas);
    const ids = [...new Set(ventanas.map(v => v.field_id))];
    const ok = await Field.count({ where: { id: ids, complex_id: req.clubId, deporte: 'padel' } });
    if (ok !== ids.length) return res.status(400).json({ message: 'Alguna cancha no es de pádel o no pertenece al complejo.' });
    await Profesor.sequelize.transaction(async (t) => {
      await ProfesorCancha.destroy({ where: { profesor_id: p.id }, transaction: t });
      await ProfesorCancha.bulkCreate(ventanas.map(v => ({ ...v, profesor_id: p.id })), { transaction: t });
    });
    res.json(await ProfesorCancha.findAll({ where: { profesor_id: p.id } }));
  } catch (err) { send(res, err); }
}

/** GET /:id/grilla — la misma grilla que ve el profesor (solo este complejo). */
async function grilla(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    res.json(await svc.grilla(p, req.query));
  } catch (err) { send(res, err); }
}

/** DELETE /:id/clases/:claseId — el admin también puede cancelar una clase. */
async function cancelarClase(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    res.json(await svc.cancelarClase([p.id], req.params.claseId));
  } catch (err) { send(res, err); }
}

module.exports = { list, get, create, update, remove, canchas, setDisponibilidad, grilla, cancelarClase };
