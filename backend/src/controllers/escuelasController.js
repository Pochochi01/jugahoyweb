'use strict';
/**
 * controllers/escuelasController.js — CRUD de las ESCUELAS de un complejo
 * Rutas: /api/escuela/club/:complexId/escuelas[/:id]
 *
 * Un complejo puede tener varias escuelas, cada una de un deporte (escuela de
 * fútbol, de tenis…). La escuela usa solo las canchas de su deporte, por eso
 * para crearla el complejo tiene que tener al menos una cancha de ese deporte.
 * Categorías, alumnos, horarios, cuotas y avisos se gestionan por escuela
 * (escuelaController con ?escuela_id=).
 */
const { Escuela, EscuelaCategoria, EscuelaAlumno, EscuelaHorario, EscuelaProfesor } = require('../models');
const { DEPORTES } = require('../models/Escuela');
const svc = require('../services/escuela/escuelaService');

const cid = (req) => Number(req.params.complexId);
const handler = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
};

function validar(b, actual = {}) {
  const v = { ...actual, ...b };
  const d = {};
  d.nombre = String(v.nombre || '').trim();
  if (d.nombre.length < 3) throw svc.httpError(400, 'Nombre de la escuela requerido (mín. 3 letras).');
  d.deporte = v.deporte;
  if (!DEPORTES.includes(d.deporte)) throw svc.httpError(400, 'Deporte inválido.');
  d.descripcion = String(v.descripcion || '').trim().slice(0, 2000) || null;
  d.estado = v.estado || 'activa';
  if (!['activa', 'inactiva'].includes(d.estado)) throw svc.httpError(400, 'Estado: activa o inactiva.');
  if (b.whatsapp_oficial !== undefined) {
    d.whatsapp_oficial = String(b.whatsapp_oficial || '').replace(/\D/g, '') || null;
    if (d.whatsapp_oficial && !/^\d{10,15}$/.test(d.whatsapp_oficial)) throw svc.httpError(400, 'WhatsApp oficial inválido: con código de país.');
  }
  if (b.dia_vencimiento !== undefined) {
    d.dia_vencimiento = parseInt(b.dia_vencimiento, 10);
    if (!(d.dia_vencimiento >= 1 && d.dia_vencimiento <= 28)) throw svc.httpError(400, 'Día de vencimiento: 1 a 28.');
  }
  return d;
}

// Que el complejo tenga canchas habilitadas del deporte lo valida el middleware
// requireDeporteDisponible en las rutas (misma regla que los torneos).

/** GET /escuelas → escuelas del complejo con totales. */
const list = handler(async (req, res) => {
  const escuelas = await Escuela.findAll({
    where: { complex_id: cid(req) },
    include: [{ model: EscuelaCategoria, as: 'categorias', attributes: ['id'] }],
    order: [['estado', 'ASC'], ['nombre', 'ASC']],
  });
  const out = [];
  for (const e of escuelas) {
    const catIds = e.categorias.map(c => c.id);
    const j = e.toJSON();
    delete j.categorias;
    out.push({
      ...j,
      categorias: catIds.length,
      alumnos: catIds.length ? await EscuelaAlumno.count({ where: { categoria_id: catIds, estado: 'activo' } }) : 0,
      pendientes: catIds.length ? await EscuelaAlumno.count({ where: { categoria_id: catIds, estado: 'pendiente' } }) : 0,
      profesores: await EscuelaProfesor.count({ where: { escuela_id: e.id } }),
    });
  }
  res.json(out);
});

const create = handler(async (req, res) => {
  const d = validar(req.body || {});
  res.status(201).json(await Escuela.create({ ...d, complex_id: cid(req) }));
});

const cargar = async (req) => {
  const e = await Escuela.findOne({ where: { id: req.params.id, complex_id: cid(req) } });
  if (!e) throw svc.httpError(404, 'Escuela no encontrada');
  return e;
};

const update = handler(async (req, res) => {
  const e = await cargar(req);
  const d = validar(req.body || {}, e.toJSON());
  if (d.deporte !== e.deporte) {
    // Cambiar el deporte dejaría horarios en canchas de otro deporte
    const catIds = (await EscuelaCategoria.findAll({ where: { escuela_id: e.id }, attributes: ['id'], raw: true })).map(c => c.id);
    if (catIds.length && await EscuelaHorario.count({ where: { categoria_id: catIds } })) {
      throw svc.httpError(409, 'La escuela tiene horarios cargados: borralos antes de cambiar el deporte.');
    }
  }
  await e.update(d);
  res.json(e);
});

/** Con alumnos (activos o con historial) se desactiva; vacía se elimina con sus categorías y horarios. */
const remove = handler(async (req, res) => {
  const e = await cargar(req);
  const cats = await EscuelaCategoria.findAll({ where: { escuela_id: e.id } });
  const catIds = cats.map(c => c.id);
  if (catIds.length && await EscuelaAlumno.count({ where: { categoria_id: catIds } })) {
    await e.update({ estado: 'inactiva' });
    return res.json({ ok: true, desactivada: true, message: 'La escuela tiene alumnos: quedó inactiva (se conserva el historial).' });
  }
  for (const h of catIds.length ? await EscuelaHorario.findAll({ where: { categoria_id: catIds } }) : []) await svc.borrarHorario(cid(req), h);
  await EscuelaProfesor.destroy({ where: { escuela_id: e.id } });
  for (const c of cats) await c.destroy();
  await e.destroy();
  res.json({ ok: true });
});

module.exports = { list, create, update, remove, validar };
