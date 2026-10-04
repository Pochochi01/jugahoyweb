'use strict';
/**
 * controllers/escuelaController.js — Escuelas (panel admin / colaborador)
 * Rutas: /api/escuela/club/:complexId/...?escuela_id=N
 *
 * Un complejo puede tener varias escuelas (fútbol, tenis…). Todo lo de abajo
 * opera sobre UNA escuela: la de ?escuela_id (o body.escuela_id); sin ese
 * parámetro, la primera del complejo (compatibilidad con la escuela única).
 * cargarEscuela valida que pertenezca al complejo → no hay cruce entre tenants.
 */
const { Op } = require('sequelize');
const {
  Field, Profesor, Escuela, EscuelaProfesor, EscuelaCategoria, EscuelaAlumno, EscuelaHorario, EscuelaPago, EscuelaAviso,
  EscuelaProfesorCategoria,
} = require('../models');
const svc = require('../services/escuela/escuelaService');

const send = (res, err) => {
  if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ya existe un registro con esos datos (nombre o DNI repetido).' });
  if (err.name === 'SequelizeForeignKeyConstraintError') return res.status(409).json({ message: 'No se puede borrar: tiene datos asociados.' });
  res.status(err.status || 500).json({ message: err.message });
};
const cid = (req) => Number(req.params.complexId);
const handler = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { send(res, err); } };
const no = (msg) => svc.httpError(404, msg);
const eid = (req) => req.escuela.id;

/** Middleware: deja req.escuela (de este complejo) y req.catIds (sus categorías). */
async function cargarEscuela(req, res, next) {
  try {
    const pedido = req.query.escuela_id ?? req.body?.escuela_id;
    const where = { complex_id: cid(req) };
    if (pedido != null && pedido !== '') where.id = Number(pedido);
    const escuela = await Escuela.findOne({ where, order: [['id', 'ASC']] });
    if (!escuela) {
      return res.status(pedido ? 404 : 409).json({
        message: pedido ? 'Escuela no encontrada en este complejo.' : 'El complejo todavía no tiene escuelas: creá una primero.',
        code: pedido ? 'ESCUELA_NO_ENCONTRADA' : 'SIN_ESCUELAS',
      });
    }
    req.escuela = escuela;
    req.catIds = (await EscuelaCategoria.findAll({ where: { escuela_id: escuela.id }, attributes: ['id'], raw: true })).map(c => c.id);
    next();
  } catch (err) { send(res, err); }
}
/** categoria_id del query/body, solo si es de la escuela activa. */
function categoriaDeLaEscuela(req, id) {
  if (!req.catIds.includes(Number(id))) throw svc.httpError(400, 'La categoría no pertenece a esta escuela.');
  return Number(id);
}

// ── Config ────────────────────────────────────────────────────
const getConfig = handler(async (req, res) => res.json(req.escuela));
const updateConfig = handler(async (req, res) => {
  const cfg = req.escuela;
  const b = req.body || {};
  const wa = b.whatsapp_oficial !== undefined ? String(b.whatsapp_oficial || '').replace(/\D/g, '') || null : cfg.whatsapp_oficial;
  if (wa && !/^\d{10,15}$/.test(wa)) throw svc.httpError(400, 'WhatsApp oficial inválido: con código de país (ej. 5493811234567).');
  const dia = b.dia_vencimiento !== undefined ? parseInt(b.dia_vencimiento, 10) : cfg.dia_vencimiento;
  if (!(dia >= 1 && dia <= 28)) throw svc.httpError(400, 'Día de vencimiento: 1 a 28.');
  await cfg.update({
    nombre: b.nombre !== undefined ? String(b.nombre).trim() || cfg.nombre : cfg.nombre,
    descripcion: b.descripcion !== undefined ? String(b.descripcion || '').trim() || null : cfg.descripcion,
    whatsapp_oficial: wa, dia_vencimiento: dia,
  });
  res.json(cfg);
});

/** Canchas del complejo del deporte de la escuela (las únicas que usa). */
const canchas = handler(async (req, res) => {
  res.json(await Field.findAll({ where: { complex_id: cid(req), deporte: req.escuela.deporte }, attributes: ['id', 'nombre', 'identificador', 'activa'], order: [['nombre', 'ASC']] }));
});

// ── Categorías ────────────────────────────────────────────────
const listCategorias = handler(async (req, res) => {
  const cats = await EscuelaCategoria.findAll({
    where: { complex_id: cid(req), escuela_id: eid(req) },
    include: [{ model: Profesor, as: 'profesores', attributes: ['id', 'nombre', 'apellido'], through: { attributes: [] } }],
    order: [['edad_min', 'ASC'], ['nombre', 'ASC']],
  });
  const inscriptos = await EscuelaAlumno.count({ where: { complex_id: cid(req), categoria_id: req.catIds, estado: 'activo' }, group: ['categoria_id'] });
  res.json(cats.map(c => ({ ...c.toJSON(), inscriptos: Number(inscriptos.find(i => i.categoria_id === c.id)?.count || 0) })));
});
const createCategoria = handler(async (req, res) => {
  res.status(201).json(await EscuelaCategoria.create({ ...svc.validarCategoria(req.body || {}), complex_id: cid(req), escuela_id: eid(req) }));
});
const updateCategoria = handler(async (req, res) => {
  const c = await EscuelaCategoria.findOne({ where: { id: req.params.id, complex_id: cid(req), escuela_id: eid(req) } });
  if (!c) throw no('Categoría no encontrada');
  const d = svc.validarCategoria({ ...c.toJSON(), ...req.body });
  const activos = await EscuelaAlumno.count({ where: { categoria_id: c.id, estado: 'activo' } });
  if (d.cupos < activos) throw svc.httpError(409, `Hay ${activos} alumnos activos: los cupos no pueden ser menos.`);
  await c.update(d);
  res.json(c);
});
const deleteCategoria = handler(async (req, res) => {
  const c = await EscuelaCategoria.findOne({ where: { id: req.params.id, complex_id: cid(req), escuela_id: eid(req) } });
  if (!c) throw no('Categoría no encontrada');
  if (await EscuelaAlumno.count({ where: { categoria_id: c.id } })) throw svc.httpError(409, 'La categoría tiene alumnos: pasalos a otra o desactivala.');
  for (const h of await EscuelaHorario.findAll({ where: { categoria_id: c.id } })) await svc.borrarHorario(cid(req), h);
  await c.destroy();
  res.json({ ok: true });
});

// ── Alumnos ───────────────────────────────────────────────────
/** GET ?q&categoria_id&estado&periodo → con edad y estado de la cuota del período. */
const listAlumnos = handler(async (req, res) => {
  const where = { complex_id: cid(req), categoria_id: req.catIds };
  if (req.query.categoria_id) where.categoria_id = categoriaDeLaEscuela(req, req.query.categoria_id);
  if (req.query.estado) where.estado = req.query.estado;
  const q = String(req.query.q || '').trim();
  if (q) {
    const dig = q.replace(/\D/g, '');
    where[Op.or] = [
      { nombre: { [Op.like]: `%${q}%` } }, { responsable_nombre: { [Op.like]: `%${q}%` } },
      ...(dig ? [{ dni: { [Op.like]: `%${dig}%` } }, { responsable_whatsapp: { [Op.like]: `%${dig}%` } }] : []),
    ];
  }
  const periodo = req.query.periodo ? svc.validarPeriodo(req.query.periodo) : svc.periodoActual();
  const alumnos = await EscuelaAlumno.findAll({
    where,
    include: [
      { model: EscuelaCategoria, as: 'categoria', attributes: ['id', 'nombre', 'cuota_mensual'] },
      { model: EscuelaPago, as: 'pagos', where: { periodo }, required: false },
    ],
    order: [['nombre', 'ASC']],
  });
  res.json(alumnos.map(a => {
    const { estado, pago } = svc.estadoPago(a.pagos, periodo);
    const j = a.toJSON();
    delete j.pagos;
    return { ...j, edad: svc.edad(a.fecha_nacimiento), periodo, pago_estado: estado, pago, portal_url: svc.portalUrl(a) };
  }));
});
const createAlumno = handler(async (req, res) => {
  const d = await svc.validarAlumno(cid(req), req.body || {}, null, eid(req));
  const a = await EscuelaAlumno.create({ ...d, complex_id: cid(req), token_portal: svc.nuevoToken() });
  res.status(201).json({ ...a.toJSON(), edad: svc.edad(a.fecha_nacimiento), portal_url: svc.portalUrl(a) });
});
const updateAlumno = handler(async (req, res) => {
  const a = await EscuelaAlumno.findOne({ where: { id: req.params.id, complex_id: cid(req), categoria_id: req.catIds } });
  if (!a) throw no('Alumno no encontrado');
  await a.update(await svc.validarAlumno(cid(req), req.body || {}, a, eid(req)));
  res.json({ ...a.toJSON(), edad: svc.edad(a.fecha_nacimiento), portal_url: svc.portalUrl(a) });
});
/** Con cuotas registradas → se da de baja (inactivo); sin historial → se elimina. */
const deleteAlumno = handler(async (req, res) => {
  const a = await EscuelaAlumno.findOne({ where: { id: req.params.id, complex_id: cid(req), categoria_id: req.catIds } });
  if (!a) throw no('Alumno no encontrado');
  if (await EscuelaPago.count({ where: { alumno_id: a.id } })) {
    await a.update({ estado: 'inactivo' });
    return res.json({ ok: true, desactivado: true, message: 'Tiene cuotas registradas: quedó inactivo (se conserva el historial).' });
  }
  await a.destroy();
  res.json({ ok: true });
});
/** Regenera el link del portal (si el anterior se compartió por error). */
const nuevoLinkPortal = handler(async (req, res) => {
  const a = await EscuelaAlumno.findOne({ where: { id: req.params.id, complex_id: cid(req), categoria_id: req.catIds } });
  if (!a) throw no('Alumno no encontrado');
  await a.update({ token_portal: svc.nuevoToken() });
  res.json({ portal_url: svc.portalUrl(a) });
});
/** Todo lo necesario para armar los mensajes de WhatsApp de un alumno. */
const contextoAlumno = handler(async (req, res) => {
  const a = await EscuelaAlumno.findOne({ where: { id: req.params.id, complex_id: cid(req), categoria_id: req.catIds }, include: [{ model: EscuelaCategoria, as: 'categoria' }] });
  if (!a) throw no('Alumno no encontrado');
  res.json(await svc.contextoAlumno(a, { periodo: req.query.periodo || svc.periodoActual() }));
});

// ── Entrenadores (profesores del complejo ↔ categorías de ESTA escuela) ──
const listEntrenadores = handler(async (req, res) => {
  const profes = await Profesor.findAll({
    where: { id_tenant: cid(req) },
    include: [
      { model: EscuelaCategoria, as: 'categoriasEscuela', attributes: ['id', 'nombre'], through: { attributes: [] }, where: { escuela_id: eid(req) }, required: false },
      { model: Escuela, as: 'escuelas', attributes: ['id'], through: { attributes: [] }, where: { id: eid(req) }, required: false },
    ],
    order: [['apellido', 'ASC'], ['nombre', 'ASC']],
  });
  res.json(profes.map(p => {
    const j = p.toJSON();
    const asignado = j.escuelas.length > 0 || j.categoriasEscuela.length > 0;
    delete j.escuelas;
    return { ...j, asignado, deporte_ok: svc.ensenaDeporte(p, req.escuela.deporte) };
  }));
});
/** PUT /entrenadores/:id/categorias { categoria_ids } — reemplaza las categorías asignadas. */
const asignarCategorias = handler(async (req, res) => {
  const p = await Profesor.findOne({ where: { id: req.params.id, id_tenant: cid(req) } });
  if (!p) throw no('Profesor no encontrado');
  const ids = [...new Set((req.body?.categoria_ids || []).map(Number))];
  if (ids.some(id => !req.catIds.includes(id))) throw svc.httpError(400, 'Alguna categoría no pertenece a esta escuela.');
  if (ids.length && !svc.ensenaDeporte(p, req.escuela.deporte)) throw svc.httpError(400, `${p.nombre} ${p.apellido} no tiene cargado el deporte de esta escuela (${req.escuela.deporte}).`);
  // Solo se reemplazan las categorías de ESTA escuela (las de otras escuelas quedan)
  await EscuelaProfesorCategoria.destroy({ where: { profesor_id: p.id, categoria_id: req.catIds } });
  await EscuelaProfesorCategoria.bulkCreate(ids.map(categoria_id => ({ profesor_id: p.id, categoria_id })));
  if (ids.length) await EscuelaProfesor.findOrCreate({ where: { escuela_id: eid(req), profesor_id: p.id } });
  res.json({ ok: true, categoria_ids: ids });
});

// ── Horarios ──────────────────────────────────────────────────
const includeHorario = [
  { model: EscuelaCategoria, as: 'categoria', attributes: ['id', 'nombre'] },
  { model: Field, as: 'field', attributes: ['id', 'nombre', 'identificador'] },
];
const listHorarios = handler(async (req, res) => {
  res.json(await EscuelaHorario.findAll({
    include: [{ ...includeHorario[0], where: { complex_id: cid(req), escuela_id: eid(req) } }, includeHorario[1]],
    order: [['dia_semana', 'ASC'], ['hora_inicio', 'ASC']],
  }));
});
const createHorario = handler(async (req, res) => {
  categoriaDeLaEscuela(req, req.body?.categoria_id);
  const r = await svc.crearHorario(cid(req), req.body || {}, req.user?.id);
  res.status(201).json(r);
});
async function horarioDelComplejo(req) {
  const h = await EscuelaHorario.findOne({ where: { id: req.params.id }, include: [{ model: EscuelaCategoria, as: 'categoria', where: { complex_id: cid(req), escuela_id: eid(req) } }] });
  if (!h) throw no('Horario no encontrado');
  if (req.body?.categoria_id) categoriaDeLaEscuela(req, req.body.categoria_id);
  return h;
}
const updateHorario = handler(async (req, res) => res.json(await svc.actualizarHorario(cid(req), await horarioDelComplejo(req), req.body || {}, req.user?.id)));
const deleteHorario = handler(async (req, res) => { await svc.borrarHorario(cid(req), await horarioDelComplejo(req)); res.json({ ok: true }); });

// ── Pagos (cuotas) ────────────────────────────────────────────
const listPagos = handler(async (req, res) => {
  const where = {};
  if (req.query.periodo) where.periodo = svc.validarPeriodo(req.query.periodo);
  if (req.query.estado) where.estado = req.query.estado;
  const alumnoWhere = { complex_id: cid(req), categoria_id: req.catIds };
  if (req.query.categoria_id) alumnoWhere.categoria_id = categoriaDeLaEscuela(req, req.query.categoria_id);
  if (req.query.alumno_id) alumnoWhere.id = Number(req.query.alumno_id);
  const pagos = await EscuelaPago.findAll({
    where,
    include: [{ model: EscuelaAlumno, as: 'alumno', where: alumnoWhere, attributes: ['id', 'nombre', 'responsable_nombre', 'responsable_whatsapp', 'categoria_id'],
      include: [{ model: EscuelaCategoria, as: 'categoria', attributes: ['id', 'nombre'] }] }],
    order: [['periodo', 'DESC'], [{ model: EscuelaAlumno, as: 'alumno' }, 'nombre', 'ASC']],
  });
  const total = (estado) => pagos.filter(p => p.estado === estado).reduce((a, p) => a + svc.num(p.monto), 0);
  res.json({ pagos, cobrado: total('pagado'), pendiente: total('pendiente') });
});
const generarCuotas = handler(async (req, res) => res.json(await svc.generarCuotas(cid(req), req.body?.periodo || svc.periodoActual(), req.catIds)));
/** POST /pagos { alumno_id, periodo, monto? } — cuota puntual (alta a mitad de mes, etc.). */
const createPago = handler(async (req, res) => {
  const a = await EscuelaAlumno.findOne({ where: { id: req.body?.alumno_id, complex_id: cid(req), categoria_id: req.catIds }, include: [{ model: EscuelaCategoria, as: 'categoria' }] });
  if (!a) throw svc.httpError(400, 'Alumno inválido.');
  const periodo = svc.validarPeriodo(req.body.periodo || svc.periodoActual());
  const monto = req.body.monto != null && req.body.monto !== '' ? svc.num(req.body.monto) : svc.num(a.categoria.cuota_mensual);
  if (!(monto > 0)) throw svc.httpError(400, 'Monto inválido.');
  res.status(201).json(await EscuelaPago.create({ alumno_id: a.id, periodo, monto, estado: 'pendiente' }));
});
async function pagoDelComplejo(req) {
  const p = await EscuelaPago.findOne({ where: { id: req.params.id }, include: [{ model: EscuelaAlumno, as: 'alumno', where: { complex_id: cid(req), categoria_id: req.catIds } }] });
  if (!p) throw no('Cuota no encontrada');
  return p;
}
const pagarCuota = handler(async (req, res) => res.json(await svc.registrarPago(cid(req), await pagoDelComplejo(req), { metodo_pago: req.body?.metodo_pago || 'efectivo', usuarioId: req.user?.id })));
const anularPago = handler(async (req, res) => res.json(await svc.anularPago(cid(req), await pagoDelComplejo(req), req.user?.id)));
const deletePago = handler(async (req, res) => {
  const p = await pagoDelComplejo(req);
  if (p.estado === 'pagado') throw svc.httpError(409, 'Una cuota pagada no se borra: anulá el pago primero.');
  await p.destroy();
  res.json({ ok: true });
});

// ── Avisos (actividad normal / suspendida) ────────────────────
const listAvisos = handler(async (req, res) => {
  const desde = req.query.desde || svc.hoy();
  res.json(await EscuelaAviso.findAll({
    where: { complex_id: cid(req), escuela_id: eid(req), fecha: { [Op.gte]: desde } },
    include: [{ model: EscuelaCategoria, as: 'categoria', attributes: ['id', 'nombre'] }],
    order: [['fecha', 'ASC'], ['id', 'DESC']],
  }));
});
function datosAviso(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) throw svc.httpError(400, 'Fecha inválida.');
  if (!['normal', 'suspendida'].includes(b.estado)) throw svc.httpError(400, 'Estado: normal o suspendida.');
  return { fecha: b.fecha, estado: b.estado, categoria_id: b.categoria_id ? Number(b.categoria_id) : null, mensaje: String(b.mensaje || '').trim().slice(0, 500) || null };
}
const createAviso = handler(async (req, res) => {
  const d = datosAviso(req.body || {});
  if (d.categoria_id) categoriaDeLaEscuela(req, d.categoria_id);
  res.status(201).json(await EscuelaAviso.create({ ...d, complex_id: cid(req), escuela_id: eid(req), autor: req.user ? `${req.user.nombre} ${req.user.apellido || ''}`.trim() : null }));
});
const deleteAviso = handler(async (req, res) => {
  const n = await EscuelaAviso.destroy({ where: { id: req.params.id, complex_id: cid(req), escuela_id: eid(req) } });
  if (!n) throw no('Aviso no encontrado');
  res.json({ ok: true });
});

module.exports = {
  cargarEscuela,
  getConfig, updateConfig, canchas,
  listCategorias, createCategoria, updateCategoria, deleteCategoria,
  listAlumnos, createAlumno, updateAlumno, deleteAlumno, nuevoLinkPortal, contextoAlumno,
  listEntrenadores, asignarCategorias,
  listHorarios, createHorario, updateHorario, deleteHorario,
  listPagos, generarCuotas, createPago, pagarCuota, anularPago, deletePago,
  listAvisos, createAviso, deleteAviso, datosAviso,
};
