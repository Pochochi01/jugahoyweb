'use strict';
/**
 * controllers/profesoresController.js
 * Panel del ADMINISTRADOR del complejo: CRUD de profesores, ventanas de
 * canchas/horarios habilitadas para clases y agenda de cada profesor.
 * Rutas: /api/profesores/club/:complexId/...
 */
const bcrypt = require('bcryptjs');
const {
  Profesor, ProfesorCancha, HorarioProfesor, Field, Escuela, EscuelaProfesor, EscuelaCategoria, EscuelaProfesorCategoria,
  Torneo, TorneoProfesor,
} = require('../models');
const { DEPORTES } = require('../models/Escuela');
const { ensenaDeporte } = require('../services/escuela/escuelaService');
const svc = require('../services/profesores/profesorService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });
// Canchas donde un profesor puede dar clases: cualquier deporte
const DEPORTES_CLASES = DEPORTES;

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
  if (body.deportes !== undefined) {
    const ds = Array.isArray(body.deportes) ? [...new Set(body.deportes)] : [];
    if (ds.some(d => !DEPORTES.includes(d))) throw svc.httpError(400, 'Deporte inválido.');
    out.deportes = ds.length ? ds : null;
  }
  return out;
}

const cargar = (req, id) => Profesor.findOne({ where: { id, id_tenant: req.clubId } });

async function list(req, res) {
  try {
    const profes = await Profesor.findAll({
      where: { id_tenant: req.clubId },
      include: [
        { model: ProfesorCancha, as: 'disponibilidad' },
        { model: Escuela, as: 'escuelas', attributes: ['id', 'nombre', 'deporte'], through: { attributes: [] } },
        { model: Torneo, as: 'torneos', attributes: ['id', 'nombre', 'deporte', 'estado'], through: { attributes: ['rol'] } },
      ],
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
    where: { complex_id: req.clubId, deporte: DEPORTES_CLASES },
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
    const ok = await Field.count({ where: { id: ids, complex_id: req.clubId, deporte: DEPORTES_CLASES } });
    if (ok !== ids.length) return res.status(400).json({ message: 'Alguna cancha no es de pádel/fútbol o no pertenece al complejo.' });
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

/**
 * GET /:id/asignaciones → escuelas y torneos del complejo, marcando los asignados.
 * Un profesor puede estar en varias escuelas y torneos, siempre de SU complejo.
 */
async function getAsignaciones(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    const [escuelas, torneos, mias, misTorneos] = await Promise.all([
      Escuela.findAll({ where: { complex_id: req.clubId }, attributes: ['id', 'nombre', 'deporte', 'estado'], order: [['nombre', 'ASC']] }),
      Torneo.findAll({ where: { id_tenant: req.clubId, deporte: 'padel' }, attributes: ['id', 'nombre', 'deporte', 'estado', 'fecha_inicio'], order: [['fecha_inicio', 'DESC']] }),
      EscuelaProfesor.findAll({ where: { profesor_id: p.id }, raw: true }),
      TorneoProfesor.findAll({ where: { profesor_id: p.id }, raw: true }),
    ]);
    res.json({
      deportes: p.deportes || [],
      escuelas: escuelas.map(e => ({ ...e.toJSON(), asignado: mias.some(m => m.escuela_id === e.id), deporte_ok: ensenaDeporte(p, e.deporte) })),
      torneos: torneos.map(t => {
        const m = misTorneos.find(x => x.torneo_id === t.id);
        return { ...t.toJSON(), asignado: Boolean(m), rol: m?.rol || null, deporte_ok: ensenaDeporte(p, t.deporte) };
      }),
    });
  } catch (err) { send(res, err); }
}

/**
 * PUT /:id/asignaciones { escuela_ids: [], torneos: [{ torneo_id, rol? }] }
 * Reemplaza las asignaciones. Valida que cada escuela/torneo sea de este
 * complejo y de un deporte que el profesor enseña. Al sacarlo de una escuela
 * se quitan también sus categorías de esa escuela.
 */
async function setAsignaciones(req, res) {
  try {
    const p = await cargar(req, req.params.id);
    if (!p) return res.status(404).json({ message: 'Profesor no encontrado' });
    const escuelaIds = [...new Set((req.body?.escuela_ids || []).map(Number))];
    const torneosIn = (req.body?.torneos || []).map(t => ({ torneo_id: Number(t?.torneo_id ?? t), rol: String(t?.rol || '').trim().slice(0, 40) || null }));
    const torneoIds = [...new Set(torneosIn.map(t => t.torneo_id))];

    const [escuelas, torneos] = await Promise.all([
      Escuela.findAll({ where: { id: escuelaIds, complex_id: req.clubId } }),
      Torneo.findAll({ where: { id: torneoIds, id_tenant: req.clubId, deporte: 'padel' } }),
    ]);
    if (escuelas.length !== escuelaIds.length) return res.status(400).json({ message: 'Alguna escuela no pertenece a este complejo.' });
    if (torneos.length !== torneoIds.length) return res.status(400).json({ message: 'Algún torneo no pertenece a este complejo.' });
    const fuera = [...escuelas, ...torneos].filter(x => !ensenaDeporte(p, x.deporte));
    if (fuera.length) {
      return res.status(400).json({ message: `${p.nombre} ${p.apellido} no enseña ${[...new Set(fuera.map(x => x.deporte))].join(', ')}: agregá el deporte al profesor o quitá ${fuera.map(x => x.nombre).join(', ')}.` });
    }

    await Profesor.sequelize.transaction(async (t) => {
      const antes = (await EscuelaProfesor.findAll({ where: { profesor_id: p.id }, raw: true, transaction: t })).map(x => x.escuela_id);
      const quitadas = antes.filter(id => !escuelaIds.includes(id));
      if (quitadas.length) {
        const cats = (await EscuelaCategoria.findAll({ where: { escuela_id: quitadas }, attributes: ['id'], raw: true, transaction: t })).map(c => c.id);
        if (cats.length) await EscuelaProfesorCategoria.destroy({ where: { profesor_id: p.id, categoria_id: cats }, transaction: t });
      }
      await EscuelaProfesor.destroy({ where: { profesor_id: p.id }, transaction: t });
      await EscuelaProfesor.bulkCreate(escuelaIds.map(escuela_id => ({ escuela_id, profesor_id: p.id })), { transaction: t });
      await TorneoProfesor.destroy({ where: { profesor_id: p.id }, transaction: t });
      await TorneoProfesor.bulkCreate(torneoIds.map(torneo_id => ({ torneo_id, profesor_id: p.id, rol: torneosIn.find(x => x.torneo_id === torneo_id).rol })), { transaction: t });
    });
    return getAsignaciones(req, res);
  } catch (err) { send(res, err); }
}

module.exports = { getAsignaciones, setAsignaciones, list, get, create, update, remove, canchas, setDisponibilidad, grilla, cancelarClase };
