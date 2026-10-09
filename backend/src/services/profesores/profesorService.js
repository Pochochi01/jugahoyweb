'use strict';
/**
 * services/profesores/profesorService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica del módulo Profesores de pádel.
 *
 *   grilla()        clases ocupadas + turnos disponibles de un profesor en un complejo
 *   consolidado()   clases del profesor en TODOS los complejos donde trabaja (mismo DNI)
 *   crearClase()    alta de clase con alumnos, validando ventana habilitada y choques
 *   cancelarClase() baja de clase (libera la cancha)
 *
 * Turnos de 60 min alineados a la hora, igual que la agenda general: cada clase
 * escribe filas 'ocupado' en time_slots (horario_profesor_id) para que los
 * jugadores no puedan reservar encima. El índice único (field_id, fecha, hora)
 * de time_slots garantiza que dos altas simultáneas no pisen el mismo turno.
 */
const { Op } = require('sequelize');
const {
  sequelize, Profesor, ProfesorCancha, HorarioProfesor, Alumno, Field, TimeSlot, TorneoPartido, Torneo, Complex,
} = require('../../models');
const { toMin, toHHMM } = require('../torneos/fixtureService');

const PASO = 60;                       // granularidad de la grilla (min)
const DURACIONES = [60, 90, 120];
const MAX_DIAS = 31;

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// ── Fechas ────────────────────────────────────────────────────
const hoyISO = () => require('../../utils/time').todayAR();
function rangoDias(desde, dias) {
  const n = Math.min(Math.max(Number(dias) || 7, 1), MAX_DIAS);
  const d = new Date(`${desde || hoyISO()}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d); x.setUTCDate(d.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}
const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
const horasCubiertas = (ini, dur) => Array.from({ length: Math.ceil(dur / 60) }, (_, i) => toHHMM(toMin(ini) + i * 60));

// ── Validación de ventanas (admin) ────────────────────────────
function validarVentanas(lista) {
  const hhmm = /^([01]\d|2[0-3]):00$/;
  return (Array.isArray(lista) ? lista : []).map((v) => {
    const dia = Number(v.dia_semana);
    if (!(dia >= 0 && dia <= 6)) throw httpError(400, 'Día de semana inválido.');
    if (!hhmm.test(v.hora_desde || '') || !(hhmm.test(v.hora_hasta || '') || v.hora_hasta === '00:00')) {
      throw httpError(400, 'Las franjas van en horas enteras (HH:00).');
    }
    if (toMin(v.hora_desde) >= toMin(v.hora_hasta, true)) throw httpError(400, `Franja inválida ${v.hora_desde}–${v.hora_hasta}.`);
    return { field_id: Number(v.field_id), dia_semana: dia, hora_desde: v.hora_desde, hora_hasta: v.hora_hasta };
  });
}

// ── Ocupación de canchas ──────────────────────────────────────
/**
 * Minutos ocupados por cancha y fecha: time_slots (reservas + clases) y
 * partidos de torneo (no escriben time_slots).
 * @returns {Map<'field|fecha', Array<[ini, fin, origen: 'agenda'|'torneo']>>}
 */
async function ocupacion(fieldIds, fechas) {
  const mapa = new Map();
  const push = (f, fecha, ini, fin, origen) => {
    const k = `${f}|${fecha}`;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push([ini, fin, origen]);
  };
  if (!fieldIds.length) return mapa;
  const slots = await TimeSlot.findAll({
    where: { field_id: fieldIds, fecha: fechas, estado: 'ocupado' }, attributes: ['field_id', 'fecha', 'hora'], raw: true,
  });
  for (const s of slots) push(s.field_id, s.fecha, toMin(s.hora), toMin(s.hora) + 60, 'agenda');
  const partidos = await TorneoPartido.findAll({
    where: { field_id: fieldIds, fecha: fechas, estado: { [Op.in]: ['programado', 'pendiente'] } },
    include: [{ model: Torneo, as: 'torneo', attributes: ['duracion_partido'] }],
  });
  for (const p of partidos) push(p.field_id, p.fecha, toMin(p.hora), toMin(p.hora) + p.torneo.duracion_partido, 'torneo');
  return mapa;
}

const chocan = (lista, ini, fin) => (lista || []).some(([a, b]) => ini < b && a < fin);

const incluirClase = [
  { model: Alumno, as: 'alumnos', attributes: ['id', 'nombre', 'celular'] },
  { model: Field, as: 'field', attributes: ['id', 'nombre', 'identificador'] },
];
const canchaLabel = (f) => (f ? `${f.nombre}${f.identificador ? ` (${f.identificador})` : ''}` : '');

function serialClase(h, club) {
  return {
    id: h.id, fecha: h.fecha, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin,
    field_id: h.field_id, cancha: canchaLabel(h.field), nota: h.nota,
    alumnos: h.alumnos, club_id: club?.id, club: club?.nombre,
  };
}

// ── Grilla de un complejo ─────────────────────────────────────
/**
 * @returns {{ dias: string[], ocupados: Array, disponibles: Array<{fecha, hora_inicio, hora_fin, field_id, cancha}> }}
 */
async function grilla(profesor, { desde, dias } = {}) {
  const fechas = rangoDias(desde, dias);
  const club = await Complex.findByPk(profesor.id_tenant, { attributes: ['id', 'nombre'] });
  const ventanas = await ProfesorCancha.findAll({
    where: { profesor_id: profesor.id },
    include: [{ model: Field, as: 'field', attributes: ['id', 'nombre', 'identificador', 'activa'] }],
  });
  const clases = await HorarioProfesor.findAll({
    where: { profesor_id: profesor.id, estado: 'ocupado', fecha: fechas },
    include: incluirClase, order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
  });

  const fieldIds = [...new Set(ventanas.map(v => v.field_id))];
  const ocup = await ocupacion(fieldIds, fechas);
  const hoy = hoyISO();
  const ahora = new Date().getHours() * 60 + new Date().getMinutes();

  const disponibles = [];
  for (const fecha of fechas) {
    if (fecha < hoy) continue;
    for (const v of ventanas.filter(x => x.dia_semana === diaSemana(fecha) && x.field?.activa !== false)) {
      for (let t = toMin(v.hora_desde); t + PASO <= toMin(v.hora_hasta, true); t += PASO) {
        if (fecha === hoy && t <= ahora) continue;
        if (chocan(ocup.get(`${v.field_id}|${fecha}`), t, t + PASO)) continue;
        disponibles.push({ fecha, hora_inicio: toHHMM(t), hora_fin: toHHMM(t + PASO), field_id: v.field_id, cancha: canchaLabel(v.field) });
      }
    }
  }
  // Una fila por cancha+hora (dos ventanas superpuestas no duplican)
  const vistos = new Set();
  return {
    club,
    dias: fechas,
    ocupados: clases.map(c => serialClase(c, club)),
    disponibles: disponibles.filter(d => { const k = `${d.field_id}|${d.fecha}|${d.hora_inicio}`; return !vistos.has(k) && vistos.add(k); }),
  };
}

/** Clases del profesor en todos sus complejos (mismo DNI, registros activos). */
async function consolidado(dni, { desde, dias } = {}) {
  const fechas = rangoDias(desde, dias);
  const profes = await Profesor.findAll({
    where: { dni, activo: true },
    include: [{ model: Complex, as: 'club', attributes: ['id', 'nombre'] }],
  });
  const clases = await HorarioProfesor.findAll({
    where: { profesor_id: profes.map(p => p.id), estado: 'ocupado', fecha: fechas },
    include: incluirClase, order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
  });
  const clubDe = new Map(profes.map(p => [p.id, p.club]));
  return { dias: fechas, ocupados: clases.map(c => serialClase(c, clubDe.get(c.profesor_id))) };
}

// ── Alta / baja de clases ─────────────────────────────────────
function validarAlumnos(lista) {
  const alumnos = (Array.isArray(lista) ? lista : []).map((a, i) => {
    const nombre = String(a.nombre || '').trim();
    const celular = String(a.celular || '').replace(/\D/g, '');
    if (nombre.length < 2) throw httpError(400, `Alumno ${i + 1}: nombre requerido.`);
    if (!/^\d{8,15}$/.test(celular)) throw httpError(400, `Alumno ${i + 1}: celular inválido.`);
    return { nombre, celular };
  });
  if (!alumnos.length) throw httpError(400, 'Cargá al menos un alumno.');
  if (alumnos.length > 4) throw httpError(400, 'Máximo 4 alumnos por clase.');
  return alumnos;
}

/**
 * Da de alta una clase.
 * @param {{field_id, fecha, hora_inicio, duracion, alumnos:[{nombre,celular}], nota?}} data
 */
async function crearClase(profesor, data) {
  const fieldId = Number(data.field_id);
  const { fecha, hora_inicio: hora } = data;
  const duracion = Number(data.duracion || 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw httpError(400, 'Fecha inválida.');
  if (!/^([01]\d|2[0-3]):00$/.test(hora || '')) throw httpError(400, 'La clase empieza en hora en punto (HH:00).');
  if (!DURACIONES.includes(duracion)) throw httpError(400, 'Duración: 60, 90 o 120 minutos.');
  if (fecha < hoyISO()) throw httpError(400, 'No se pueden cargar clases en fechas pasadas.');
  const alumnos = validarAlumnos(data.alumnos);
  const ini = toMin(hora), fin = ini + duracion;
  if (fin > 1440) throw httpError(400, 'La clase no puede pasar de medianoche.');

  // 1) Dentro de una ventana habilitada por el admin
  const ventanas = await ProfesorCancha.findAll({ where: { profesor_id: profesor.id, field_id: fieldId, dia_semana: diaSemana(fecha) } });
  if (!ventanas.some(v => ini >= toMin(v.hora_desde) && fin <= toMin(v.hora_hasta, true))) {
    throw httpError(409, 'Ese horario no está habilitado para vos en esa cancha.');
  }

  // 2) El profesor no puede dar dos clases a la vez (en ningún complejo)
  const mismos = await Profesor.findAll({ where: { dni: profesor.dni }, attributes: ['id'] });
  const propias = await HorarioProfesor.findAll({
    where: { profesor_id: mismos.map(p => p.id), fecha, estado: 'ocupado' }, attributes: ['hora_inicio', 'hora_fin'],
  });
  if (propias.some(c => ini < toMin(c.hora_fin, true) && toMin(c.hora_inicio) < fin)) {
    throw httpError(409, 'Ya tenés una clase en ese horario.');
  }

  // 3) Partidos de torneo en la cancha (no usan time_slots; lo de la agenda se chequea con lock abajo)
  const ocup = await ocupacion([fieldId], [fecha]);
  const horas = horasCubiertas(hora, duracion);

  return sequelize.transaction(async (t) => {
    // Turnos de la agenda: ninguno ocupado. Lock → serializa con reservas simultáneas.
    const existentes = await TimeSlot.findAll({ where: { field_id: fieldId, fecha, hora: horas }, lock: t.LOCK.UPDATE, transaction: t });
    if (existentes.some(s => s.estado === 'ocupado') || chocan(ocup.get(`${fieldId}|${fecha}`)?.filter(o => o[2] === 'torneo'), ini, fin)) {
      throw httpError(409, 'La cancha ya está ocupada en ese horario.');
    }

    const clase = await HorarioProfesor.create({
      profesor_id: profesor.id, field_id: fieldId, fecha,
      hora_inicio: hora, hora_fin: toHHMM(fin), estado: 'ocupado', nota: data.nota?.slice(0, 255) || null,
    }, { transaction: t });
    await Alumno.bulkCreate(alumnos.map(a => ({ ...a, id_horario: clase.id })), { transaction: t });

    for (const h of horas) {
      const fila = existentes.find(s => s.hora === h);
      if (fila) await fila.update({ estado: 'ocupado', booking_id: null, horario_profesor_id: clase.id }, { transaction: t });
      else await TimeSlot.create({ field_id: fieldId, fecha, hora: h, estado: 'ocupado', horario_profesor_id: clase.id }, { transaction: t });
    }
    return clase;
  }).catch((err) => {
    // Índice único de time_slots: otra reserva tomó el turno en el mismo instante
    if (err.name === 'SequelizeUniqueConstraintError') throw httpError(409, 'La cancha ya está ocupada en ese horario.');
    throw err;
  });
}

/** Actualiza alumnos / nota de una clase. */
async function editarClase(profesor, id, data) {
  const clase = await HorarioProfesor.findOne({ where: { id, profesor_id: profesor.id, estado: 'ocupado' } });
  if (!clase) throw httpError(404, 'Clase no encontrada');
  await sequelize.transaction(async (t) => {
    if (data.alumnos) {
      const alumnos = validarAlumnos(data.alumnos);
      await Alumno.destroy({ where: { id_horario: clase.id }, transaction: t });
      await Alumno.bulkCreate(alumnos.map(a => ({ ...a, id_horario: clase.id })), { transaction: t });
    }
    if (data.nota !== undefined) await clase.update({ nota: data.nota?.slice(0, 255) || null }, { transaction: t });
  });
  return HorarioProfesor.findByPk(clase.id, { include: incluirClase });
}

/** Cancela la clase y libera los turnos de la cancha. */
async function cancelarClase(profesorIds, id) {
  const clase = await HorarioProfesor.findOne({ where: { id, profesor_id: profesorIds, estado: 'ocupado' } });
  if (!clase) throw httpError(404, 'Clase no encontrada');
  await sequelize.transaction(async (t) => {
    await TimeSlot.destroy({ where: { horario_profesor_id: clase.id }, transaction: t });
    await clase.update({ estado: 'cancelado' }, { transaction: t });
  });
  return { ok: true };
}

module.exports = {
  httpError, hoyISO, rangoDias, validarVentanas,
  grilla, consolidado, crearClase, editarClase, cancelarClase, DURACIONES,
};
