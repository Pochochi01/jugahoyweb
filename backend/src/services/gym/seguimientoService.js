'use strict';
/**
 * services/gym/seguimientoService.js — Rutinas (con versionado, historial y comentarios),
 * evaluación física (IMC calculado + historial) y nutrición (plan + seguimientos).
 */
const {
  sequelize, GymRutina, GymRutinaVersion, GymRutinaEjercicio, GymRutinaComentario, GymEvaluacion, GymNutricionPlan,
  GymNutricionSeguimiento, GymProfesor, GymSocio,
} = require('../../models');
const socios = require('./sociosService');
const { httpError, campos, todayAR } = require('./comun');

// ── Rutinas ─────────────────────────────────────────────────────────────────
const EJ = {
  dia: { max: 30 }, orden: { tipo: 'int' }, nombre: { req: true, max: 150, label: 'Ejercicio' },
  series: { tipo: 'int' }, repeticiones: { max: 20 }, peso: { max: 20 }, descanso_seg: { tipo: 'int' }, notas: { max: 255 },
};

function validarEjercicios(lista) {
  if (!Array.isArray(lista) || !lista.length) throw httpError(400, 'La rutina necesita al menos un ejercicio.');
  if (lista.length > 120) throw httpError(400, 'Máximo 120 ejercicios por rutina.');
  return lista.map((e, i) => ({ dia: 'Día 1', ...campos(e, EJ), orden: Number(e.orden ?? i) }));
}

async function validarProfesor(complexId, profesorId) {
  if (profesorId && !(await GymProfesor.count({ where: { id: profesorId, complex_id: complexId } }))) throw httpError(400, 'Profesor inválido.');
}

/** Crea la rutina con su versión 1. socio_id null = plantilla reutilizable. */
async function crearRutina(complexId, body, usuarioId) {
  const d = campos(body, { nombre: { req: true, max: 150, label: 'Nombre' }, objetivo: { max: 255 }, socio_id: { tipo: 'int' }, profesor_id: { tipo: 'int' } });
  if (d.socio_id) await socios.obtener(complexId, d.socio_id);
  await validarProfesor(complexId, d.profesor_id);
  const ejercicios = validarEjercicios(body.ejercicios);
  const rutina = await sequelize.transaction(async (t) => {
    const r = await GymRutina.create({ ...d, complex_id: complexId, version_actual: 1 }, { transaction: t });
    const v = await GymRutinaVersion.create({ rutina_id: r.id, version: 1, notas: 'Versión inicial', usuario_id: usuarioId }, { transaction: t });
    await GymRutinaEjercicio.bulkCreate(ejercicios.map(e => ({ ...e, version_id: v.id })), { transaction: t });
    if (d.socio_id) await socios.historial(complexId, d.socio_id, 'rutina', `Rutina asignada: ${d.nombre}`, usuarioId, t);
    return r;
  });
  return detalleRutina(complexId, rutina.id);
}

/** Asigna una plantilla a un socio (copia de la versión vigente). */
async function asignarPlantilla(complexId, plantillaId, socioId, usuarioId) {
  const p = await detalleRutina(complexId, plantillaId);
  return crearRutina(complexId, { nombre: p.nombre, objetivo: p.objetivo, socio_id: socioId, profesor_id: p.profesor_id, ejercicios: p.ejercicios }, usuarioId);
}

/** Guarda cambios como NUEVA versión (las anteriores quedan en el historial). */
async function nuevaVersion(complexId, rutinaId, body, usuarioId) {
  const r = await GymRutina.findOne({ where: { id: rutinaId, complex_id: complexId } });
  if (!r) throw httpError(404, 'Rutina no encontrada.');
  const meta = campos(body, { nombre: { max: 150 }, objetivo: { max: 255 }, profesor_id: { tipo: 'int' }, activa: { tipo: 'bool' }, notas: { max: 255 } }, { parcial: true });
  await validarProfesor(complexId, meta.profesor_id);
  await sequelize.transaction(async (t) => {
    const { notas, ...resto } = meta;
    if (body.ejercicios) {
      const ejercicios = validarEjercicios(body.ejercicios);
      const version = r.version_actual + 1;
      const v = await GymRutinaVersion.create({ rutina_id: r.id, version, notas: notas || null, usuario_id: usuarioId }, { transaction: t });
      await GymRutinaEjercicio.bulkCreate(ejercicios.map(e => ({ ...e, version_id: v.id })), { transaction: t });
      resto.version_actual = version;
      if (r.socio_id) await socios.historial(complexId, r.socio_id, 'rutina', `Rutina "${r.nombre}" actualizada (v${version})`, usuarioId, t);
    }
    await r.update(resto, { transaction: t });
  });
  return detalleRutina(complexId, rutinaId);
}

async function detalleRutina(complexId, rutinaId, version) {
  const r = await GymRutina.findOne({
    where: { id: rutinaId, complex_id: complexId },
    include: [{ model: GymRutinaVersion, as: 'versiones', attributes: ['id', 'version', 'notas', 'created_at'] }, { model: GymRutinaComentario, as: 'comentarios' },
      { model: GymProfesor, as: 'profesor', attributes: ['id', 'nombre', 'apellido'] }, { model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido'] }],
    order: [[{ model: GymRutinaVersion, as: 'versiones' }, 'version', 'DESC'], [{ model: GymRutinaComentario, as: 'comentarios' }, 'created_at', 'ASC']],
  });
  if (!r) throw httpError(404, 'Rutina no encontrada.');
  const ver = r.versiones.find(v => v.version === Number(version || r.version_actual));
  if (!ver) throw httpError(404, 'Versión no encontrada.');
  const ejercicios = await GymRutinaEjercicio.findAll({ where: { version_id: ver.id }, order: [['dia', 'ASC'], ['orden', 'ASC']] });
  return { ...r.toJSON(), version_vista: ver.version, ejercicios };
}

async function listarRutinas(complexId, q = {}) {
  const where = { complex_id: complexId };
  if (q.socio_id) where.socio_id = Number(q.socio_id);
  if (q.plantillas === '1') where.socio_id = null;
  return GymRutina.findAll({ where, include: [{ model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido'] }, { model: GymProfesor, as: 'profesor', attributes: ['nombre', 'apellido'] }], order: [['updated_at', 'DESC']], limit: 300 });
}

async function comentar(complexId, rutinaId, texto, autor) {
  const r = await GymRutina.findOne({ where: { id: rutinaId, complex_id: complexId } });
  if (!r) throw httpError(404, 'Rutina no encontrada.');
  const t = String(texto || '').trim();
  if (t.length < 2 || t.length > 2000) throw httpError(400, 'El comentario debe tener entre 2 y 2000 caracteres.');
  return GymRutinaComentario.create({ rutina_id: rutinaId, autor: String(autor || 'Usuario').slice(0, 150), texto: t });
}

async function eliminarRutina(complexId, rutinaId) {
  const n = await GymRutina.destroy({ where: { id: rutinaId, complex_id: complexId } });
  if (!n) throw httpError(404, 'Rutina no encontrada.');
}

// ── Evaluación física ──────────────────────────────────────────────────────
const EVAL = {
  fecha: { tipo: 'fecha' }, profesor_id: { tipo: 'int' }, peso: { tipo: 'num', label: 'Peso' }, altura: { tipo: 'num', label: 'Altura' },
  grasa_pct: { tipo: 'num' }, masa_muscular: { tipo: 'num' }, cintura: { tipo: 'num' }, cadera: { tipo: 'num' }, pecho: { tipo: 'num' },
  brazo: { tipo: 'num' }, pierna: { tipo: 'num' }, notas: { max: 255 },
};
/** IMC = peso / altura² (altura en metros; acepta cm). */
function imc(peso, altura) {
  if (!peso || !altura) return null;
  const m = altura > 3 ? altura / 100 : altura;
  return Math.round((peso / (m * m)) * 100) / 100;
}

async function crearEvaluacion(complexId, socioId, body, usuarioId) {
  await socios.obtener(complexId, socioId);
  const d = campos(body, EVAL);
  if (d.peso && (d.peso < 10 || d.peso > 400)) throw httpError(400, 'Peso fuera de rango.');
  if (d.altura && d.altura > 3) d.altura = Math.round(d.altura) / 100;   // cm → m
  if (d.grasa_pct && d.grasa_pct > 80) throw httpError(400, 'Porcentaje de grasa fuera de rango.');
  await validarProfesor(complexId, d.profesor_id);
  const ev = await GymEvaluacion.create({ ...d, fecha: d.fecha || todayAR(), imc: imc(d.peso, d.altura), complex_id: complexId, socio_id: socioId });
  await socios.historial(complexId, socioId, 'evaluacion', `Evaluación física${ev.peso ? `: ${ev.peso} kg` : ''}${ev.imc ? ` · IMC ${ev.imc}` : ''}`, usuarioId);
  return ev;
}

async function actualizarEvaluacion(complexId, id, body) {
  const ev = await GymEvaluacion.findOne({ where: { id, complex_id: complexId } });
  if (!ev) throw httpError(404, 'Evaluación no encontrada.');
  const d = campos(body, EVAL, { parcial: true });
  if (d.altura && d.altura > 3) d.altura = Math.round(d.altura) / 100;
  const peso = d.peso ?? Number(ev.peso), altura = d.altura ?? Number(ev.altura);
  await ev.update({ ...d, imc: imc(peso, altura) });
  return ev;
}

const evaluaciones = (complexId, socioId) => GymEvaluacion.findAll({ where: { complex_id: complexId, socio_id: socioId }, include: [{ model: GymProfesor, as: 'profesor', attributes: ['nombre', 'apellido'] }], order: [['fecha', 'ASC']] });

async function eliminarEvaluacion(complexId, id) {
  if (!(await GymEvaluacion.destroy({ where: { id, complex_id: complexId } }))) throw httpError(404, 'Evaluación no encontrada.');
}

// ── Nutrición (opcional por configuración) ─────────────────────────────────
async function exigirNutricion(complexId) {
  const cfg = await socios.config(complexId);
  if (!cfg.nutricion_habilitada) throw httpError(403, 'El módulo de nutrición no está habilitado (Gym → Configuración).', { code: 'NUTRICION_DESHABILITADA' });
}

async function crearPlanNutricion(complexId, socioId, body) {
  await exigirNutricion(complexId);
  await socios.obtener(complexId, socioId);
  const d = campos(body, { profesional_id: { tipo: 'int' }, fecha_inicio: { tipo: 'fecha' }, objetivo: { max: 255 }, plan: { req: true, max: 20000, label: 'Plan alimenticio' }, observaciones: { max: 5000 } });
  await validarProfesor(complexId, d.profesional_id);
  return sequelize.transaction(async (t) => {
    await GymNutricionPlan.update({ activo: false }, { where: { socio_id: socioId, activo: true }, transaction: t });
    return GymNutricionPlan.create({ ...d, fecha_inicio: d.fecha_inicio || todayAR(), complex_id: complexId, socio_id: socioId, activo: true }, { transaction: t });
  });
}

async function planesNutricion(complexId, socioId) {
  return GymNutricionPlan.findAll({ where: { complex_id: complexId, socio_id: socioId }, include: [{ model: GymNutricionSeguimiento, as: 'seguimientos' }, { model: GymProfesor, as: 'profesional', attributes: ['nombre', 'apellido'] }], order: [['fecha_inicio', 'DESC'], [{ model: GymNutricionSeguimiento, as: 'seguimientos' }, 'fecha', 'ASC']] });
}

async function agregarSeguimiento(complexId, planId, body) {
  await exigirNutricion(complexId);
  const p = await GymNutricionPlan.findOne({ where: { id: planId, complex_id: complexId } });
  if (!p) throw httpError(404, 'Plan alimenticio no encontrado.');
  const d = campos(body, { fecha: { tipo: 'fecha' }, peso: { tipo: 'num' }, observaciones: { max: 5000 } });
  return GymNutricionSeguimiento.create({ ...d, fecha: d.fecha || todayAR(), plan_id: planId });
}

module.exports = {
  crearRutina, asignarPlantilla, nuevaVersion, detalleRutina, listarRutinas, comentar, eliminarRutina,
  imc, crearEvaluacion, actualizarEvaluacion, evaluaciones, eliminarEvaluacion,
  crearPlanNutricion, planesNutricion, agregarSeguimiento,
};
