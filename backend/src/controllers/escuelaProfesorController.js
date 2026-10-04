'use strict';
/**
 * controllers/escuelaProfesorController.js — Escuela: pantalla del ENTRENADOR
 *
 * El entrenador entra con su DNI (mismo login que los profesores de pádel) y,
 * en el complejo elegido, ve y gestiona SOLO sus categorías asignadas:
 *   - alumnos (con contacto del responsable y estado de la cuota del mes)
 *   - horarios de entrenamiento (alta / cambio / baja)
 *   - avisos de actividad normal / suspendida
 * Rutas: /api/escuela/profesor/club/:complexId/...
 */
const {
  Field, Escuela, EscuelaCategoria, EscuelaAlumno, EscuelaHorario, EscuelaPago, EscuelaAviso, EscuelaProfesorCategoria,
} = require('../models');
const svc = require('../services/escuela/escuelaService');
const { datosAviso } = require('./escuelaController');

const handler = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
};

async function misCategoriaIds(req) {
  const filas = await EscuelaProfesorCategoria.findAll({ where: { profesor_id: req.profesor.id }, attributes: ['categoria_id'], raw: true });
  return filas.map(f => f.categoria_id);
}
async function exigirCategoria(req, categoriaId) {
  if (!(await misCategoriaIds(req)).includes(Number(categoriaId))) throw svc.httpError(403, 'Esa categoría no está asignada a vos.');
}

/** GET /resumen → mis categorías con horarios, alumnos (y cuota del mes) y avisos próximos. */
const resumen = handler(async (req, res) => {
  const ids = await misCategoriaIds(req);
  const periodo = svc.periodoActual();
  const [categorias, avisos, canchas] = await Promise.all([
    EscuelaCategoria.findAll({
      where: { id: ids, complex_id: req.clubId },
      include: [
        { model: Escuela, as: 'escuela', attributes: ['id', 'nombre', 'deporte'] },
        { model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['id', 'nombre', 'identificador'] }] },
        { model: EscuelaAlumno, as: 'alumnos', where: { estado: 'activo' }, required: false,
          attributes: ['id', 'nombre', 'fecha_nacimiento', 'genero', 'responsable_nombre', 'responsable_whatsapp', 'categoria_id', 'token_portal'],
          include: [{ model: EscuelaPago, as: 'pagos', where: { periodo }, required: false }] },
      ],
      order: [['edad_min', 'ASC']],
    }),
    EscuelaAviso.findAll({ where: { complex_id: req.clubId, fecha: { [require('sequelize').Op.gte]: svc.hoy() } }, order: [['fecha', 'ASC']] }),
    Field.findAll({ where: { complex_id: req.clubId, activa: true }, attributes: ['id', 'nombre', 'identificador', 'deporte'] }),
  ]);
  const misEscuelas = [...new Set(categorias.map(c => c.escuela_id).filter(Boolean))];
  const deportes = new Set(categorias.map(c => c.escuela?.deporte || 'futbol'));
  res.json({
    periodo,
    canchas: canchas.filter(f => deportes.has(f.deporte)),
    avisos: avisos.filter(a => ids.includes(a.categoria_id) || (a.categoria_id == null && (a.escuela_id == null || misEscuelas.includes(a.escuela_id)))),
    categorias: categorias.map(c => {
      const j = c.toJSON();
      j.horarios.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));
      j.alumnos = c.alumnos.map(a => {
        const { estado, pago } = svc.estadoPago(a.pagos, periodo);
        return {
          id: a.id, nombre: a.nombre, edad: svc.edad(a.fecha_nacimiento), genero: a.genero, categoria_id: a.categoria_id,
          responsable_nombre: a.responsable_nombre, responsable_whatsapp: a.responsable_whatsapp,
          pago_estado: estado, pago, portal_url: svc.portalUrl(a),
        };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre));
      return j;
    }),
  });
});

const createHorario = handler(async (req, res) => {
  await exigirCategoria(req, req.body?.categoria_id);
  res.status(201).json(await svc.crearHorario(req.clubId, req.body || {}, null));
});
async function miHorario(req) {
  const h = await EscuelaHorario.findOne({ where: { id: req.params.id }, include: [{ model: EscuelaCategoria, as: 'categoria', where: { complex_id: req.clubId } }] });
  if (!h) throw svc.httpError(404, 'Horario no encontrado');
  await exigirCategoria(req, h.categoria_id);
  return h;
}
const updateHorario = handler(async (req, res) => {
  const h = await miHorario(req);
  if (req.body?.categoria_id) await exigirCategoria(req, req.body.categoria_id);
  res.json(await svc.actualizarHorario(req.clubId, h, req.body || {}, null));
});
const deleteHorario = handler(async (req, res) => { await svc.borrarHorario(req.clubId, await miHorario(req)); res.json({ ok: true }); });

/** POST /avisos — el entrenador avisa normal/suspendida SOLO para sus categorías. */
const createAviso = handler(async (req, res) => {
  const d = datosAviso(req.body || {});
  if (!d.categoria_id) throw svc.httpError(400, 'Elegí la categoría del aviso.');
  await exigirCategoria(req, d.categoria_id);
  const cat = await EscuelaCategoria.findByPk(d.categoria_id, { attributes: ['escuela_id'] });
  res.status(201).json(await EscuelaAviso.create({ ...d, complex_id: req.clubId, escuela_id: cat?.escuela_id ?? null, autor: `Prof. ${req.profesor.nombre} ${req.profesor.apellido}` }));
});

/** GET /alumnos/:id/contexto → datos para los mensajes de WhatsApp (solo alumnos de sus categorías). */
const contextoAlumno = handler(async (req, res) => {
  const a = await EscuelaAlumno.findOne({ where: { id: req.params.id, complex_id: req.clubId }, include: [{ model: EscuelaCategoria, as: 'categoria' }] });
  if (!a) throw svc.httpError(404, 'Alumno no encontrado');
  await exigirCategoria(req, a.categoria_id);
  res.json(await svc.contextoAlumno(a));
});

module.exports = { resumen, createHorario, updateHorario, deleteHorario, createAviso, contextoAlumno };
