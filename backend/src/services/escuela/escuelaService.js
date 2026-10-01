'use strict';
/**
 * services/escuela/escuelaService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica de la Escuela de Fútbol (los controllers son finos).
 *
 *   Inscripción   edad (desde la fecha de nacimiento) dentro del rango de la
 *                 categoría y cupo disponible
 *   Horarios      cada entrenamiento semanal crea un TURNO FIJO (recurring_bookings)
 *                 en la cancha de fútbol → la agenda lo muestra y nadie reserva encima
 *   Cuotas        una por alumno y período (YYYY-MM); al cobrarla se emite
 *                 comprobante y, si hay caja abierta, se registra el ingreso
 *   Avisos        actividad normal / suspendida por fecha (categoría o toda la escuela)
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Field, Complex, Profesor, RecurringBooking,
  EscuelaConfig, EscuelaCategoria, EscuelaAlumno, EscuelaHorario, EscuelaPago, EscuelaAviso,
} = require('../../models');
const recurring = require('../recurringService');
const caja = require('../cajaService');
const { todayAR } = require('../../utils/time');
const { frontendUrl } = require('../../config/urls');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ── Fechas ────────────────────────────────────────────────────
const hoy = () => todayAR();
const periodoActual = () => hoy().slice(0, 7);

/** Edad cumplida a la fecha `ref` (YYYY-MM-DD). */
function edad(fechaNac, ref = hoy()) {
  const [y, m, d] = String(fechaNac).split('-').map(Number);
  const [ry, rm, rd] = String(ref).split('-').map(Number);
  return ry - y - ((rm < m || (rm === m && rd < d)) ? 1 : 0);
}

const toMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

// ── Config ────────────────────────────────────────────────────
async function config(complexId) {
  const [cfg] = await EscuelaConfig.findOrCreate({ where: { complex_id: complexId }, defaults: { complex_id: complexId } });
  return cfg;
}

// ── Categorías ────────────────────────────────────────────────
function validarCategoria(b) {
  const d = {
    nombre: String(b.nombre || '').trim(),
    edad_min: parseInt(b.edad_min, 10),
    edad_max: parseInt(b.edad_max, 10),
    cupos: parseInt(b.cupos, 10),
    cuota_mensual: num(b.cuota_mensual),
  };
  if (d.nombre.length < 2) throw httpError(400, 'Nombre de categoría requerido (ej. Sub-10).');
  if (!(d.edad_min >= 3 && d.edad_max <= 21 && d.edad_min <= d.edad_max)) throw httpError(400, 'Rango de edad inválido (3 a 21 años).');
  if (!(d.cupos >= 1)) throw httpError(400, 'Los cupos deben ser al menos 1.');
  if (d.cuota_mensual < 0) throw httpError(400, 'Cuota inválida.');
  if (b.activa !== undefined) d.activa = Boolean(b.activa);
  return d;
}

// ── Alumnos ───────────────────────────────────────────────────
/**
 * Valida y normaliza un alumno: categoría del complejo, edad dentro del rango
 * y cupo disponible (si cambia de categoría o se reactiva).
 */
async function validarAlumno(complexId, b, actual = null) {
  const d = {};
  const v = (k) => (b[k] !== undefined ? b[k] : actual?.[k]);
  d.nombre = String(v('nombre') || '').trim();
  if (d.nombre.length < 3) throw httpError(400, 'Nombre y apellido del alumno requeridos.');
  d.fecha_nacimiento = v('fecha_nacimiento');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_nacimiento || '')) throw httpError(400, 'Fecha de nacimiento inválida.');
  d.genero = v('genero');
  if (!['masculino', 'femenino', 'otro'].includes(d.genero)) throw httpError(400, 'Género inválido.');
  d.dni = String(v('dni') || '').replace(/\D/g, '') || null;
  if (d.dni && !/^\d{7,9}$/.test(d.dni)) throw httpError(400, 'DNI inválido.');
  d.responsable_nombre = String(v('responsable_nombre') || '').trim();
  if (d.responsable_nombre.length < 3) throw httpError(400, 'Nombre del padre/madre/responsable requerido.');
  d.responsable_whatsapp = String(v('responsable_whatsapp') || '').replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(d.responsable_whatsapp)) throw httpError(400, 'WhatsApp del responsable inválido: con código de país (ej. 5493811234567).');
  d.responsable_email = String(v('responsable_email') || '').trim() || null;
  d.estado = v('estado') || 'activo';
  if (!['activo', 'inactivo'].includes(d.estado)) throw httpError(400, 'Estado inválido.');

  d.categoria_id = Number(v('categoria_id'));
  const cat = await EscuelaCategoria.findOne({ where: { id: d.categoria_id, complex_id: complexId } });
  if (!cat) throw httpError(400, 'Elegí una categoría válida.');
  const e = edad(d.fecha_nacimiento);
  if (e < cat.edad_min || e > cat.edad_max) {
    throw httpError(400, `${d.nombre} tiene ${e} años: la categoría ${cat.nombre} es de ${cat.edad_min} a ${cat.edad_max}.`);
  }
  // Cupo: solo cuenta si entra a la categoría (alta, cambio de categoría o reactivación)
  const entra = d.estado === 'activo' && (!actual || actual.categoria_id !== d.categoria_id || actual.estado !== 'activo');
  if (entra) {
    const ocupados = await EscuelaAlumno.count({ where: { categoria_id: cat.id, estado: 'activo' } });
    if (ocupados >= cat.cupos) throw httpError(409, `La categoría ${cat.nombre} no tiene cupos (${cat.cupos}).`);
  }
  return d;
}

const nuevoToken = () => crypto.randomBytes(24).toString('hex');
const portalUrl = (alumno) => frontendUrl(`/escuela/alumno/${alumno.token_portal}`);

// ── Horarios (turnos fijos en la agenda) ──────────────────────
/**
 * Valida un horario y crea su turno fijo: la agenda queda bloqueada todas las
 * semanas (horizonte móvil de recurringService). Devuelve cuántas fechas se
 * bloquearon y cuántas se saltearon por estar ya reservadas.
 */
async function validarHorario(complexId, b, horarioId = null) {
  const d = {
    categoria_id: Number(b.categoria_id),
    field_id: Number(b.field_id),
    dia_semana: Number(b.dia_semana),
    hora_inicio: String(b.hora_inicio || ''),
    hora_fin: String(b.hora_fin || ''),
  };
  const cat = await EscuelaCategoria.findOne({ where: { id: d.categoria_id, complex_id: complexId } });
  if (!cat) throw httpError(400, 'Categoría inválida.');
  const cancha = await Field.findOne({ where: { id: d.field_id, complex_id: complexId } });
  if (!cancha || cancha.deporte !== 'futbol') throw httpError(400, 'La escuela usa solo canchas de fútbol del complejo.');
  if (cancha.activa === false) throw httpError(400, 'Esa cancha está deshabilitada.');
  if (!(d.dia_semana >= 0 && d.dia_semana <= 6)) throw httpError(400, 'Día inválido.');
  // La agenda trabaja por horas: el entrenamiento arranca en hora en punto
  if (!/^([01]\d|2[0-3]):00$/.test(d.hora_inicio)) throw httpError(400, 'La hora de inicio va en punto (HH:00).');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora_fin) || toMin(d.hora_fin) <= toMin(d.hora_inicio)) throw httpError(400, 'Hora de fin inválida.');
  if (toMin(d.hora_fin) - toMin(d.hora_inicio) > 240) throw httpError(400, 'Un entrenamiento no puede durar más de 4 horas.');

  // No superponer dos entrenamientos de la escuela en la misma cancha y día
  const mismos = await EscuelaHorario.findAll({
    where: { field_id: d.field_id, dia_semana: d.dia_semana, ...(horarioId ? { id: { [Op.ne]: horarioId } } : {}) },
    include: [{ model: EscuelaCategoria, as: 'categoria', attributes: ['nombre'] }],
  });
  const choque = mismos.find(h => toMin(d.hora_inicio) < toMin(h.hora_fin) && toMin(h.hora_inicio) < toMin(d.hora_fin));
  if (choque) throw httpError(409, `Se superpone con ${choque.categoria.nombre} (${choque.hora_inicio}–${choque.hora_fin}) en la misma cancha.`);
  return { d, cat };
}

async function crearTurnoFijo(complexId, d, cat, usuarioId) {
  const duracion = toMin(d.hora_fin) - toMin(d.hora_inicio);
  const tpl = await RecurringBooking.create({
    complex_id: complexId, field_id: d.field_id, dia_semana: d.dia_semana,
    hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, duracion,
    nombre_cliente: `Escuela · ${cat.nombre}`, monto: 0, desde_fecha: hoy(), created_by: usuarioId || null,
  });
  const creados = await recurring.materializar(tpl);
  const fin = new Date(`${hoy()}T12:00:00`); fin.setDate(fin.getDate() + recurring.SEMANAS * 7);
  const esperadas = recurring.ocurrencias(d.dia_semana, hoy(), fin.toISOString().slice(0, 10)).length;
  return { tpl, bloqueadas: creados, salteadas: Math.max(0, esperadas - creados) };
}

async function crearHorario(complexId, body, usuarioId) {
  const { d, cat } = await validarHorario(complexId, body);
  const { tpl, bloqueadas, salteadas } = await crearTurnoFijo(complexId, d, cat, usuarioId);
  const h = await EscuelaHorario.create({ ...d, recurring_booking_id: tpl.id });
  return { horario: h, bloqueadas, salteadas };
}

async function actualizarHorario(complexId, horario, body, usuarioId) {
  const { d, cat } = await validarHorario(complexId, { ...horario.toJSON(), ...body }, horario.id);
  if (horario.recurring_booking_id) await recurring.darDeBaja(complexId, horario.recurring_booking_id);
  const { tpl, bloqueadas, salteadas } = await crearTurnoFijo(complexId, d, cat, usuarioId);
  await horario.update({ ...d, recurring_booking_id: tpl.id });
  return { horario, bloqueadas, salteadas };
}

/** Borra el horario y libera la agenda (fechas futuras del turno fijo). */
async function borrarHorario(complexId, horario) {
  if (horario.recurring_booking_id) await recurring.darDeBaja(complexId, horario.recurring_booking_id);
  await horario.destroy();
}

// ── Cuotas ────────────────────────────────────────────────────
const validarPeriodo = (p) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p || '')) throw httpError(400, 'Período inválido (YYYY-MM).');
  return p;
};

/** Crea la cuota PENDIENTE del período para cada alumno activo (idempotente). */
async function generarCuotas(complexId, periodo) {
  validarPeriodo(periodo);
  const alumnos = await EscuelaAlumno.findAll({
    where: { complex_id: complexId, estado: 'activo' },
    include: [{ model: EscuelaCategoria, as: 'categoria' }],
  });
  let creadas = 0;
  for (const a of alumnos) {
    if (!(num(a.categoria.cuota_mensual) > 0)) continue;
    const [, creada] = await EscuelaPago.findOrCreate({
      where: { alumno_id: a.id, periodo },
      defaults: { alumno_id: a.id, periodo, monto: a.categoria.cuota_mensual, estado: 'pendiente' },
    });
    if (creada) creadas++;
  }
  return { periodo, alumnos: alumnos.length, creadas };
}

/** Marca la cuota como pagada, emite comprobante y registra el ingreso en caja (si está abierta). */
async function registrarPago(complexId, pago, { metodo_pago = 'efectivo', usuarioId } = {}) {
  if (pago.estado === 'pagado') throw httpError(409, 'La cuota ya estaba pagada.');
  return sequelize.transaction(async (t) => {
    await pago.update({
      estado: 'pagado', fecha_pago: hoy(), metodo_pago, usuario_id: usuarioId || null,
      comprobante: `ESC-${pago.periodo.replace('-', '')}-${String(pago.id).padStart(5, '0')}`,
    }, { transaction: t });
    await caja.registrarEnCaja(complexId, {
      tipo: 'ingreso', concepto: `Escuela: cuota ${pago.periodo} · ${pago.alumno?.nombre || `alumno #${pago.alumno_id}`}`,
      monto: num(pago.monto), metodo_pago, categoria: 'escuela', usuario_id: usuarioId,
    }, t);
    return pago;
  });
}

/** Revierte un pago cargado por error (vuelve a pendiente; egreso compensatorio en caja). */
async function anularPago(complexId, pago, usuarioId) {
  if (pago.estado !== 'pagado') throw httpError(409, 'La cuota no está pagada.');
  return sequelize.transaction(async (t) => {
    await caja.registrarEnCaja(complexId, {
      tipo: 'egreso', concepto: `Escuela: anulación ${pago.comprobante}`, monto: num(pago.monto),
      metodo_pago: pago.metodo_pago || 'efectivo', categoria: 'escuela', usuario_id: usuarioId,
    }, t);
    await pago.update({ estado: 'pendiente', fecha_pago: null, metodo_pago: null, comprobante: null }, { transaction: t });
    return pago;
  });
}

/**
 * Estado de pago de un alumno para un período:
 *   'pagado' · 'pendiente' (cuota generada sin pagar) · 'sin_registro' (no hay cuota cargada)
 */
function estadoPago(pagos, periodo) {
  const p = (pagos || []).find(x => x.periodo === periodo);
  return { estado: p ? p.estado : 'sin_registro', pago: p || null };
}

// ── Avisos (actividad normal / suspendida) ────────────────────
/** Aviso vigente para una categoría en una fecha: el de la categoría pisa al general. */
async function avisoDelDia(complexId, categoriaId, fecha = hoy()) {
  const avisos = await EscuelaAviso.findAll({
    where: { complex_id: complexId, fecha, [Op.or]: [{ categoria_id: categoriaId }, { categoria_id: null }] },
    order: [['id', 'DESC']],
  });
  return avisos.find(a => a.categoria_id === categoriaId) || avisos[0] || null;
}

/**
 * Datos completos de un alumno para armar mensajes y el portal:
 * categoría, horarios, cuota del período, aviso del día y datos de la escuela.
 */
async function contextoAlumno(alumno, { periodo = periodoActual() } = {}) {
  const [cfg, club, horarios, pagos, aviso, profesores] = await Promise.all([
    config(alumno.complex_id),
    Complex.findByPk(alumno.complex_id, { attributes: ['id', 'nombre', 'direccion', 'ciudad'] }),
    EscuelaHorario.findAll({
      where: { categoria_id: alumno.categoria_id },
      include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador'] }],
      order: [['dia_semana', 'ASC'], ['hora_inicio', 'ASC']],
    }),
    EscuelaPago.findAll({ where: { alumno_id: alumno.id }, order: [['periodo', 'DESC']], limit: 12 }),
    avisoDelDia(alumno.complex_id, alumno.categoria_id),
    alumno.categoria?.getProfesores ? alumno.categoria.getProfesores({ attributes: ['nombre', 'apellido'], joinTableAttributes: [] }) : [],
  ]);
  const { estado, pago } = estadoPago(pagos, periodo);
  return {
    alumno: {
      id: alumno.id, nombre: alumno.nombre, edad: edad(alumno.fecha_nacimiento), genero: alumno.genero,
      responsable_nombre: alumno.responsable_nombre, responsable_whatsapp: alumno.responsable_whatsapp,
    },
    categoria: alumno.categoria ? { id: alumno.categoria.id, nombre: alumno.categoria.nombre, cuota_mensual: num(alumno.categoria.cuota_mensual) } : null,
    entrenadores: profesores.map(p => `${p.nombre} ${p.apellido}`),
    horarios: horarios.map(h => ({
      dia_semana: h.dia_semana, dia: DIAS[h.dia_semana], hora_inicio: h.hora_inicio, hora_fin: h.hora_fin,
      cancha: h.field ? `${h.field.nombre}${h.field.identificador ? ` (${h.field.identificador})` : ''}` : null,
    })),
    periodo,
    pago_estado: estado,
    pago,
    pagos,
    aviso_hoy: aviso,
    vencimiento: `${periodo}-${String(cfg.dia_vencimiento || 10).padStart(2, '0')}`,
    escuela: { nombre: cfg.nombre || `Escuela de fútbol ${club?.nombre || ''}`.trim(), whatsapp_oficial: cfg.whatsapp_oficial, club },
    portal_url: portalUrl(alumno),
  };
}

module.exports = {
  httpError, num, edad, hoy, periodoActual, DIAS,
  config, validarCategoria, validarAlumno, nuevoToken, portalUrl,
  crearHorario, actualizarHorario, borrarHorario,
  validarPeriodo, generarCuotas, registrarPago, anularPago, estadoPago,
  avisoDelDia, contextoAlumno,
};
