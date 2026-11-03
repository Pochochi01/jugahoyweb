'use strict';
/**
 * services/gym/clasesService.js — Agenda de clases, reservas con lista de espera y asistencia.
 *
 * Estados de clase: disponible → completa (cupo lleno) → finalizada (ya pasó) | cancelada.
 * Reservas: reservada | espera (cupo lleno, por orden de llegada) | cancelada | asistio | ausente.
 * Al cancelar una reserva, el primero en espera pasa a "reservada".
 */
const { Op } = require('sequelize');
const {
  sequelize, GymClase, GymReserva, GymActividad, GymProfesor, GymSucursal, GymSocio, GymAsistencia, GymMembresia, GymPlan,
} = require('../../models');
const { httpError, campos, todayAR, sumarDias } = require('./comun');
const { nowAR } = require('../../utils/time');

const SPEC = {
  actividad_id: { req: true, tipo: 'int', label: 'Actividad' }, profesor_id: { tipo: 'int', label: 'Profesor' }, sucursal_id: { tipo: 'int', label: 'Sucursal' },
  fecha: { req: true, tipo: 'fecha', label: 'Fecha' }, hora_inicio: { req: true, tipo: 'hora', label: 'Horario' },
  duracion_min: { tipo: 'int', min: 10, label: 'Duración' }, cupo: { tipo: 'int', min: 1, label: 'Cupos' }, notas: { max: 255 },
};
const INC = [
  { model: GymActividad, as: 'actividad', attributes: ['id', 'nombre', 'tipo', 'color'] },
  { model: GymProfesor, as: 'profesor', attributes: ['id', 'nombre', 'apellido'] },
  { model: GymSucursal, as: 'sucursal', attributes: ['id', 'nombre'] },
];

async function validarRefs(complexId, d) {
  if (d.actividad_id && !(await GymActividad.count({ where: { id: d.actividad_id, complex_id: complexId } }))) throw httpError(400, 'Actividad inválida.');
  if (d.profesor_id && !(await GymProfesor.count({ where: { id: d.profesor_id, complex_id: complexId } }))) throw httpError(400, 'Profesor inválido.');
  if (d.sucursal_id && !(await GymSucursal.count({ where: { id: d.sucursal_id, complex_id: complexId } }))) throw httpError(400, 'Sucursal inválida.');
}

/** Superposición del profesor: misma fecha y rango horario que se pisa. */
async function profesorOcupado(complexId, { profesor_id, fecha, hora_inicio, duracion_min = 60 }, exceptoId) {
  if (!profesor_id) return false;
  const mins = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const ini = mins(hora_inicio), fin = ini + duracion_min;
  const otras = await GymClase.findAll({ where: { complex_id: complexId, profesor_id, fecha, estado: { [Op.ne]: 'cancelada' }, ...(exceptoId && { id: { [Op.ne]: exceptoId } }) }, attributes: ['hora_inicio', 'duracion_min'] });
  return otras.some(o => mins(o.hora_inicio) < fin && ini < mins(o.hora_inicio) + o.duracion_min);
}

/** Crea una clase; con `repetir_semanas` > 0 la repite los mismos días de semana. */
async function crear(complexId, body) {
  const d = campos(body, SPEC);
  await validarRefs(complexId, d);
  const semanas = Math.min(Math.max(Number(body.repetir_semanas) || 0, 0), 26);
  const fechas = Array.from({ length: semanas + 1 }, (_, i) => sumarDias(d.fecha, i * 7));
  const creadas = [], omitidas = [];
  for (const fecha of fechas) {
    if (await profesorOcupado(complexId, { ...d, fecha })) { omitidas.push(fecha); continue; }
    creadas.push(await GymClase.create({ ...d, fecha, complex_id: complexId, estado: 'disponible' }));
  }
  if (!creadas.length) throw httpError(409, 'El profesor ya tiene una clase en ese horario.');
  return { creadas, omitidas };
}

async function obtener(complexId, id) {
  const c = await GymClase.findOne({ where: { id, complex_id: complexId }, include: INC });
  if (!c) throw httpError(404, 'Clase no encontrada.');
  return c;
}

async function actualizar(complexId, id, body) {
  const c = await obtener(complexId, id);
  if (['cancelada', 'finalizada'].includes(c.estado)) throw httpError(409, `La clase está ${c.estado}.`);
  const d = campos(body, SPEC, { parcial: true });
  await validarRefs(complexId, d);
  if (await profesorOcupado(complexId, { ...c.toJSON(), ...d }, c.id)) throw httpError(409, 'El profesor ya tiene una clase en ese horario.');
  await c.update(d);
  await recalcularEstado(c.id);
  return obtener(complexId, id);
}

async function cancelar(complexId, id) {
  const c = await obtener(complexId, id);
  if (c.estado === 'finalizada') throw httpError(409, 'La clase ya finalizó.');
  await sequelize.transaction(async (t) => {
    await c.update({ estado: 'cancelada' }, { transaction: t });
    await GymReserva.update({ estado: 'cancelada' }, { where: { clase_id: id, estado: ['reservada', 'espera'] }, transaction: t });
  });
  return c;
}

/** Ocupación de cada clase en una sola consulta. */
async function ocupacion(ids) {
  if (!ids.length) return {};
  const filas = await GymReserva.findAll({ where: { clase_id: ids }, attributes: ['clase_id', 'estado', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['clase_id', 'estado'], raw: true });
  const out = {};
  for (const f of filas) {
    const o = out[f.clase_id] || (out[f.clase_id] = { reservadas: 0, espera: 0, asistieron: 0 });
    if (['reservada', 'asistio', 'ausente'].includes(f.estado)) o.reservadas += Number(f.n);
    if (f.estado === 'espera') o.espera += Number(f.n);
    if (f.estado === 'asistio') o.asistieron += Number(f.n);
  }
  return out;
}

async function listar(complexId, q = {}) {
  const desde = q.desde || todayAR(), hasta = q.hasta || sumarDias(desde, 6);
  const where = { complex_id: complexId, fecha: { [Op.between]: [desde, hasta] } };
  for (const k of ['actividad_id', 'profesor_id', 'sucursal_id']) if (q[k]) where[k] = Number(q[k]);
  if (q.estado) where.estado = String(q.estado).split(',');
  const clases = await GymClase.findAll({ where, include: INC, order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']] });
  const occ = await ocupacion(clases.map(c => c.id));
  return clases.map(c => ({ ...c.toJSON(), ...(occ[c.id] || { reservadas: 0, espera: 0, asistieron: 0 }) }));
}

async function recalcularEstado(claseId, t) {
  const c = await GymClase.findByPk(claseId, { transaction: t });
  if (!c || ['cancelada', 'finalizada'].includes(c.estado)) return;
  const n = await GymReserva.count({ where: { clase_id: claseId, estado: ['reservada', 'asistio', 'ausente'] }, transaction: t });
  const estado = n >= c.cupo ? 'completa' : 'disponible';
  if (estado !== c.estado) await c.update({ estado }, { transaction: t });
}

/** ¿El plan vigente del socio incluye la actividad? (planes sin actividades = todas) */
async function planPermite(socioId, actividadId, fecha) {
  const m = await GymMembresia.findOne({
    where: { socio_id: socioId, estado: 'vigente', fecha_inicio: { [Op.lte]: fecha }, fecha_fin: { [Op.gte]: fecha } },
    include: [{ model: GymPlan, as: 'plan', include: ['actividades'] }],
  });
  if (!m) return { ok: false, motivo: 'No tenés un plan vigente para esa fecha.' };
  const acts = m.plan?.actividades || [];
  if (acts.length && !acts.some(a => a.id === actividadId)) return { ok: false, motivo: `Tu plan (${m.plan.nombre}) no incluye esta actividad.` };
  return { ok: true };
}

/**
 * Reserva un lugar (o lista de espera si está completa). Bloquea la clase para evitar
 * sobreventa de cupos con reservas simultáneas.
 */
async function reservar(complexId, claseId, socioId, { origen = 'panel', validarPlan = origen === 'socio' } = {}) {
  return sequelize.transaction(async (t) => {
    const c = await GymClase.findOne({ where: { id: claseId, complex_id: complexId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!c) throw httpError(404, 'Clase no encontrada.');
    if (['cancelada', 'finalizada'].includes(c.estado)) throw httpError(409, `La clase está ${c.estado}.`);
    const ahora = nowAR();
    if (c.fecha < ahora.date || (c.fecha === ahora.date && c.hora_inicio <= ahora.time)) throw httpError(409, 'La clase ya comenzó.');
    const socio = await GymSocio.findOne({ where: { id: socioId, complex_id: complexId }, transaction: t });
    if (!socio) throw httpError(404, 'Socio no encontrado.');
    if (socio.estado !== 'activo') throw httpError(409, `El socio está ${socio.estado}.`);
    if (validarPlan) { const p = await planPermite(socioId, c.actividad_id, c.fecha); if (!p.ok) throw httpError(409, p.motivo); }

    const existente = await GymReserva.findOne({ where: { clase_id: claseId, socio_id: socioId }, transaction: t });
    if (existente && ['reservada', 'espera', 'asistio'].includes(existente.estado)) throw httpError(409, existente.estado === 'espera' ? 'Ya está en lista de espera.' : 'Ya tiene lugar en esta clase.');
    const ocupados = await GymReserva.count({ where: { clase_id: claseId, estado: ['reservada', 'asistio', 'ausente'] }, transaction: t });
    const estado = ocupados >= c.cupo ? 'espera' : 'reservada';
    const r = existente ? await existente.update({ estado, origen }, { transaction: t }) : await GymReserva.create({ clase_id: claseId, socio_id: socioId, estado, origen }, { transaction: t });
    await recalcularEstado(claseId, t);
    return { reserva: r, en_espera: estado === 'espera' };
  });
}

/** Cancela la reserva y promueve al primero en lista de espera. */
async function cancelarReserva(complexId, reservaId, { socioId } = {}) {
  return sequelize.transaction(async (t) => {
    const r = await GymReserva.findOne({ where: { id: reservaId, ...(socioId && { socio_id: socioId }) }, include: [{ model: GymClase, as: 'clase', where: { complex_id: complexId } }], transaction: t, lock: t.LOCK.UPDATE });
    if (!r) throw httpError(404, 'Reserva no encontrada.');
    if (!['reservada', 'espera'].includes(r.estado)) throw httpError(409, `La reserva está ${r.estado}.`);
    const liberaLugar = r.estado === 'reservada';
    await r.update({ estado: 'cancelada' }, { transaction: t });
    let promovido = null;
    if (liberaLugar) {
      const primero = await GymReserva.findOne({ where: { clase_id: r.clase_id, estado: 'espera' }, order: [['updated_at', 'ASC'], ['id', 'ASC']], transaction: t });
      if (primero) { await primero.update({ estado: 'reservada' }, { transaction: t }); promovido = primero.socio_id; }
    }
    await recalcularEstado(r.clase_id, t);
    if (promovido) console.log(`[gym][clases] clase ${r.clase_id}: socio ${promovido} pasó de lista de espera a reservado`);
    return { reserva: r, promovido };
  });
}

async function reservasDeClase(complexId, claseId) {
  await obtener(complexId, claseId);
  return GymReserva.findAll({ where: { clase_id: claseId }, include: [{ model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido', 'dni', 'whatsapp'] }], order: [['estado', 'ASC'], ['created_at', 'ASC']] });
}

/** Toma de asistencia de la clase: { presentes: [socio_id], ausentes: [socio_id] }. */
async function tomarAsistencia(complexId, claseId, { presentes = [], ausentes = [] }) {
  const c = await obtener(complexId, claseId);
  if (c.estado === 'cancelada') throw httpError(409, 'La clase está cancelada.');
  const hora = c.hora_inicio;
  await sequelize.transaction(async (t) => {
    for (const sid of presentes.map(Number)) {
      const [r] = await GymReserva.findOrCreate({ where: { clase_id: claseId, socio_id: sid }, defaults: { clase_id: claseId, socio_id: sid, estado: 'asistio' }, transaction: t });
      if (r.estado !== 'asistio') await r.update({ estado: 'asistio' }, { transaction: t });
      const ya = await GymAsistencia.count({ where: { socio_id: sid, clase_id: claseId }, transaction: t });
      if (!ya) await GymAsistencia.create({ complex_id: complexId, sucursal_id: c.sucursal_id, socio_id: sid, clase_id: claseId, actividad_id: c.actividad_id, profesor_id: c.profesor_id, fecha: c.fecha, hora, origen: 'clase' }, { transaction: t });
    }
    if (ausentes.length) await GymReserva.update({ estado: 'ausente' }, { where: { clase_id: claseId, socio_id: ausentes.map(Number), estado: ['reservada', 'asistio'] }, transaction: t });
    if (ausentes.length) await GymAsistencia.destroy({ where: { clase_id: claseId, socio_id: ausentes.map(Number) }, transaction: t });
  });
  await recalcularEstado(claseId);
  return reservasDeClase(complexId, claseId);
}

/** Scheduler: clases ya terminadas → finalizada; reservas sin marcar → ausente. */
async function finalizarPasadas(complexId) {
  const ahora = nowAR();
  const pend = await GymClase.findAll({ where: { complex_id: complexId, estado: ['disponible', 'completa'], fecha: { [Op.lte]: ahora.date } }, attributes: ['id', 'fecha', 'hora_inicio', 'duracion_min'] });
  const mins = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const ya = pend.filter(c => c.fecha < ahora.date || mins(c.hora_inicio) + c.duracion_min <= mins(ahora.time)).map(c => c.id);
  if (!ya.length) return 0;
  await GymClase.update({ estado: 'finalizada' }, { where: { id: ya } });
  await GymReserva.update({ estado: 'ausente' }, { where: { clase_id: ya, estado: 'reservada' } });
  await GymReserva.update({ estado: 'cancelada' }, { where: { clase_id: ya, estado: 'espera' } });
  return ya.length;
}

/** Asistencia (ingresos + clases) con filtros y agregados diario/semanal/mensual. */
async function asistencia(complexId, q = {}) {
  const desde = q.desde || sumarDias(todayAR(), -30), hasta = q.hasta || todayAR();
  const where = { complex_id: complexId, fecha: { [Op.between]: [desde, hasta] } };
  for (const k of ['sucursal_id', 'profesor_id', 'actividad_id', 'socio_id']) if (q[k]) where[k] = Number(q[k]);
  if (q.origen) where.origen = q.origen;
  const formato = { diario: '%Y-%m-%d', semanal: '%x-S%v', mensual: '%Y-%m' }[q.agrupar || 'diario'];
  if (!formato) throw httpError(400, 'agrupar: diario, semanal o mensual.');
  const [serie, detalle] = await Promise.all([
    GymAsistencia.findAll({ where, attributes: [[sequelize.fn('DATE_FORMAT', sequelize.col('fecha'), formato), 'periodo'], 'origen', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['periodo', 'origen'], order: [[sequelize.literal('periodo'), 'ASC']], raw: true }),
    GymAsistencia.findAll({ where, include: [{ model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido', 'dni'] }, { model: GymActividad, as: 'actividad', attributes: ['nombre'] }, { model: GymProfesor, as: 'profesor', attributes: ['nombre', 'apellido'] }], order: [['fecha', 'DESC'], ['hora', 'DESC']], limit: 500 }),
  ]);
  return { desde, hasta, serie: serie.map(s => ({ ...s, n: Number(s.n) })), detalle };
}

module.exports = { crear, obtener, actualizar, cancelar, listar, reservar, cancelarReserva, reservasDeClase, tomarAsistencia, finalizarPasadas, asistencia, ocupacion };
