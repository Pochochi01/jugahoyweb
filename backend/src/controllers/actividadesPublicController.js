'use strict';
/**
 * controllers/actividadesPublicController.js — Escuelas, profesores y torneos (público)
 *
 *   GET  /api/public/complexes/:id/actividades?deporte=tenis
 *        Catálogo del complejo: escuelas activas (categorías, cupos, horarios,
 *        entrenadores), profesores y torneos visibles con sus inscripciones.
 *   POST /api/public/complexes/:id/escuelas/:escuelaId/inscripcion
 *        Pre‑inscripción de un alumno: queda 'pendiente' (no ocupa cupo) hasta
 *        que el club la confirma desde el panel (Escuela → Alumnos).
 *
 * La inscripción de jugadores a torneos ya existe en /api/torneos/public/:torneoId/inscripciones.
 */
const { Op } = require('sequelize');
const { Complex, Escuela, EscuelaCategoria, EscuelaAlumno } = require('../models');
const act = require('../services/actividadesService');
const esc = require('../services/escuela/escuelaService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

async function complejoVisible(id) {
  const c = await Complex.findByPk(Number(id), { attributes: ['id', 'nombre', 'activo'] });
  if (!c || c.activo === false) throw esc.httpError(404, 'Complejo no encontrado');
  return c;
}

async function getActividades(req, res) {
  try {
    const c = await complejoVisible(req.params.id);
    const deporte = req.query.deporte ? act.deporteDeTexto(req.query.deporte) || String(req.query.deporte) : null;
    res.json({ complex: { id: c.id, nombre: c.nombre }, ...(await act.catalogoComplejo(c.id, deporte)) });
  } catch (err) { send(res, err); }
}

async function preinscripcion(req, res) {
  try {
    const c = await complejoVisible(req.params.id);
    const escuela = await Escuela.findOne({ where: { id: Number(req.params.escuelaId), complex_id: c.id, estado: 'activa' } });
    if (!escuela) throw esc.httpError(404, 'Escuela no encontrada');
    const b = req.body || {};

    // Categoría elegida o, si no, la que corresponde por edad
    let categoriaId = b.categoria_id ? Number(b.categoria_id) : null;
    if (!categoriaId) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_nacimiento || '')) throw esc.httpError(400, 'Fecha de nacimiento inválida.');
      const e = esc.edad(b.fecha_nacimiento);
      const cat = await EscuelaCategoria.findOne({ where: { escuela_id: escuela.id, activa: true, edad_min: { [Op.lte]: e }, edad_max: { [Op.gte]: e } }, order: [['edad_min', 'ASC']] });
      if (!cat) throw esc.httpError(400, `No hay una categoría para ${e} años en ${escuela.nombre}.`);
      categoriaId = cat.id;
    }
    const d = await esc.validarAlumno(c.id, { ...b, categoria_id: categoriaId, estado: 'pendiente' }, null, escuela.id);
    d.estado = 'pendiente';

    const repetido = await EscuelaAlumno.findOne({
      where: {
        complex_id: c.id, categoria_id: categoriaId, estado: ['activo', 'pendiente'],
        [Op.or]: [...(d.dni ? [{ dni: d.dni }] : []), { nombre: d.nombre, responsable_whatsapp: d.responsable_whatsapp }],
      },
    });
    if (repetido) throw esc.httpError(409, `${d.nombre} ya está ${repetido.estado === 'activo' ? 'inscripto' : 'pre‑inscripto'} en esta categoría.`);

    const a = await EscuelaAlumno.create({ ...d, complex_id: c.id, token_portal: esc.nuevoToken() });
    const cat = await EscuelaCategoria.findByPk(categoriaId);
    res.status(201).json({
      ok: true, estado: 'pendiente', alumno: { id: a.id, nombre: a.nombre },
      escuela: { id: escuela.id, nombre: escuela.nombre }, categoria: { id: cat.id, nombre: cat.nombre },
      message: `Pre‑inscripción enviada: ${escuela.nombre} · ${cat.nombre}. El club se va a comunicar al ${d.responsable_whatsapp} para confirmarla.`,
    });
  } catch (err) { send(res, err); }
}

module.exports = { getActividades, preinscripcion };
