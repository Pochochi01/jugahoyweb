'use strict';
/**
 * services/gym/catalogosService.js — CRUD genérico (crudDe) para los catálogos del gym
 * más la lógica propia de planes (actividades permitidas), profesores (horarios y
 * estadísticas) y equipos (mantenimiento, garantías y alertas).
 */
const { Op } = require('sequelize');
const {
  sequelize, GymSucursal, GymActividad, GymPlan, GymPlanActividad, GymProfesor, GymProfesorHorario, GymEquipo, GymEquipoEvento,
  GymClase, Profesor,
} = require('../../models');
const { constantes } = require('../../models/gym');
const { httpError, campos, todayAR, sumarDias } = require('./comun');

/**
 * Fábrica de CRUD acotado al complejo. `spec` valida los campos; `orden` y `include`
 * para el listado; `antes(data, complexId)` permite validar referencias.
 */
function crudDe(Modelo, spec, { orden = [['id', 'ASC']], include, antes, filtros = [] } = {}) {
  const obtener = async (complexId, id) => {
    const fila = await Modelo.findOne({ where: { id, complex_id: complexId }, include });
    if (!fila) throw httpError(404, 'Registro no encontrado.');
    return fila;
  };
  return {
    obtener,
    listar: (complexId, q = {}) => {
      const where = { complex_id: complexId };
      for (const f of filtros) if (q[f] !== undefined && q[f] !== '') where[f] = q[f] === 'true' ? true : q[f] === 'false' ? false : q[f];
      return Modelo.findAll({ where, include, order: orden });
    },
    crear: async (complexId, body) => {
      const data = campos(body, spec);
      if (antes) await antes(data, complexId);
      return Modelo.create({ ...data, complex_id: complexId });
    },
    actualizar: async (complexId, id, body) => {
      const fila = await obtener(complexId, id);
      const data = campos(body, spec, { parcial: true });
      if (antes) await antes(data, complexId, fila);
      await fila.update(data);
      return obtener(complexId, id);
    },
    eliminar: async (complexId, id) => { const fila = await obtener(complexId, id); await fila.destroy(); },
  };
}

const sucursalDelComplejo = async (data, complexId) => {
  if (data.sucursal_id && !(await GymSucursal.count({ where: { id: data.sucursal_id, complex_id: complexId } }))) throw httpError(400, 'Sucursal inválida.');
};

const sucursales = crudDe(GymSucursal, {
  nombre: { req: true, max: 100, label: 'Nombre' }, direccion: { max: 200 }, telefono: { max: 30 }, activa: { tipo: 'bool' },
}, { orden: [['nombre', 'ASC']] });

const actividades = crudDe(GymActividad, {
  nombre: { req: true, max: 100, label: 'Nombre' }, tipo: { tipo: 'enum', valores: constantes.TIPOS }, descripcion: { max: 255 },
  color: { max: 9 }, activa: { tipo: 'bool' },
}, { orden: [['nombre', 'ASC']], filtros: ['activa'] });

// ── Planes (con actividades permitidas) ──
const SPEC_PLAN = {
  nombre: { req: true, max: 100, label: 'Nombre' }, tipo: { tipo: 'enum', valores: constantes.TIPOS, label: 'Tipo' },
  periodo: { req: true, tipo: 'enum', valores: constantes.PERIODOS, label: 'Período' }, precio: { req: true, tipo: 'num', label: 'Precio' },
  descuento_pct: { tipo: 'num', label: 'Descuento' }, hora_desde: { tipo: 'hora', label: 'Hora desde' }, hora_hasta: { tipo: 'hora', label: 'Hora hasta' },
  clases_por_semana: { tipo: 'int', min: 1 }, descripcion: { max: 255 }, activo: { tipo: 'bool' },
};
const planesBase = crudDe(GymPlan, SPEC_PLAN, {
  orden: [['activo', 'DESC'], ['nombre', 'ASC']], include: [{ model: GymActividad, as: 'actividades', attributes: ['id', 'nombre'], through: { attributes: [] } }], filtros: ['activo'],
  antes: (d) => {
    if (d.descuento_pct != null && d.descuento_pct > 100) throw httpError(400, 'El descuento no puede superar el 100%.');
    if (d.hora_desde && d.hora_hasta && d.hora_desde >= d.hora_hasta) throw httpError(400, 'La franja horaria es inválida.');
  },
});
async function setActividades(complexId, planId, ids, t) {
  if (!Array.isArray(ids)) return;
  const validas = ids.length ? (await GymActividad.findAll({ where: { id: ids.map(Number), complex_id: complexId }, attributes: ['id'], transaction: t })).map(a => a.id) : [];
  if (validas.length !== new Set(ids.map(Number)).size) throw httpError(400, 'Hay actividades inválidas.');
  await GymPlanActividad.destroy({ where: { plan_id: planId }, transaction: t });
  if (validas.length) await GymPlanActividad.bulkCreate(validas.map(a => ({ plan_id: planId, actividad_id: a })), { transaction: t });
}
const planes = {
  ...planesBase,
  crear: async (complexId, body) => {
    const p = await sequelize.transaction(async (t) => {
      const data = campos(body, SPEC_PLAN);
      if (data.descuento_pct > 100) throw httpError(400, 'El descuento no puede superar el 100%.');
      const plan = await GymPlan.create({ ...data, complex_id: complexId }, { transaction: t });
      await setActividades(complexId, plan.id, body.actividad_ids || [], t);
      return plan;
    });
    return planesBase.obtener(complexId, p.id);
  },
  actualizar: async (complexId, id, body) => {
    await planesBase.actualizar(complexId, id, body);
    if (body.actividad_ids) await sequelize.transaction(t => setActividades(complexId, id, body.actividad_ids, t));
    return planesBase.obtener(complexId, id);
  },
  // Un plan con membresías no se borra: se desactiva
  eliminar: async (complexId, id) => {
    const p = await planesBase.obtener(complexId, id);
    const usado = await sequelize.models.GymMembresia.count({ where: { plan_id: id } });
    if (usado) { await p.update({ activo: false }); return { desactivado: true }; }
    await p.destroy();
    return { eliminado: true };
  },
};

// ── Profesores (con horarios) ──
const SPEC_PROF = {
  nombre: { req: true, max: 100, label: 'Nombre' }, apellido: { req: true, max: 100, label: 'Apellido' }, dni: { max: 15 },
  telefono: { max: 30 }, email: { tipo: 'email' }, rol: { tipo: 'enum', valores: ['profesor', 'personal_trainer', 'nutricionista'] },
  especialidad: { max: 150 }, certificaciones: { max: 5000 }, valor_hora: { tipo: 'num' }, comision_pct: { tipo: 'num' },
  profesor_id: { tipo: 'int' }, activo: { tipo: 'bool' },
};
const profesoresBase = crudDe(GymProfesor, SPEC_PROF, {
  orden: [['activo', 'DESC'], ['apellido', 'ASC']], include: [{ model: GymProfesorHorario, as: 'horarios' }], filtros: ['activo', 'rol'],
  antes: async (d, complexId) => {
    if (d.comision_pct != null && d.comision_pct > 100) throw httpError(400, 'La comisión no puede superar el 100%.');
    // Vínculo opcional con un profesor del módulo Profesores del mismo complejo
    if (d.profesor_id && !(await Profesor.count({ where: { id: d.profesor_id, id_tenant: complexId } }))) throw httpError(400, 'Ese profesor no pertenece al complejo.');
  },
});
async function setHorarios(complexId, profesorId, horarios) {
  if (!Array.isArray(horarios)) return;
  const filas = horarios.map(h => {
    const d = campos(h, { dia_semana: { req: true, tipo: 'int', label: 'Día' }, hora_desde: { req: true, tipo: 'hora' }, hora_hasta: { req: true, tipo: 'hora' }, sucursal_id: { tipo: 'int' } });
    if (d.dia_semana > 6) throw httpError(400, 'Día de semana inválido (0-6).');
    if (d.hora_desde >= d.hora_hasta) throw httpError(400, 'Horario inválido.');
    return { ...d, profesor_id: profesorId };
  });
  for (const f of filas) await sucursalDelComplejo(f, complexId);
  await sequelize.transaction(async (t) => {
    await GymProfesorHorario.destroy({ where: { profesor_id: profesorId }, transaction: t });
    if (filas.length) await GymProfesorHorario.bulkCreate(filas, { transaction: t });
  });
}
const profesores = {
  ...profesoresBase,
  crear: async (complexId, body) => { const p = await profesoresBase.crear(complexId, body); await setHorarios(complexId, p.id, body.horarios); return profesoresBase.obtener(complexId, p.id); },
  actualizar: async (complexId, id, body) => { await profesoresBase.actualizar(complexId, id, body); await setHorarios(complexId, id, body.horarios); return profesoresBase.obtener(complexId, id); },
  eliminar: async (complexId, id) => {
    const p = await profesoresBase.obtener(complexId, id);
    if (await GymClase.count({ where: { profesor_id: id } })) { await p.update({ activo: false }); return { desactivado: true }; }
    await p.destroy(); return { eliminado: true };
  },
};

/** Estadísticas por profesor: clases dictadas, asistencia de alumnos, horas y liquidación estimada. */
async function estadisticasProfesores(complexId, { desde, hasta } = {}) {
  desde = desde || `${todayAR().slice(0, 7)}-01`; hasta = hasta || todayAR();
  const filas = await sequelize.query(`
    SELECT p.id, p.nombre, p.apellido, p.rol, p.valor_hora, p.comision_pct,
           COUNT(DISTINCT c.id) AS clases, COALESCE(SUM(c.duracion_min), 0) / 60 AS horas,
           COALESCE(SUM(r.presentes), 0) AS asistentes, COALESCE(SUM(r.reservas), 0) AS reservas
    FROM gym_profesores p
    LEFT JOIN gym_clases c ON c.profesor_id = p.id AND c.estado = 'finalizada' AND c.fecha BETWEEN :desde AND :hasta
    LEFT JOIN (SELECT clase_id, SUM(estado = 'asistio') presentes, SUM(estado IN ('asistio','ausente')) reservas FROM gym_reservas GROUP BY clase_id) r ON r.clase_id = c.id
    WHERE p.complex_id = :c
    GROUP BY p.id ORDER BY clases DESC, p.apellido`, { replacements: { c: complexId, desde, hasta }, type: sequelize.QueryTypes.SELECT });
  return { desde, hasta, profesores: filas.map(f => {
    const horas = Math.round(Number(f.horas) * 10) / 10;
    return { ...f, clases: Number(f.clases), horas, asistentes: Number(f.asistentes),
      pct_asistencia: Number(f.reservas) ? Math.round((Number(f.asistentes) / Number(f.reservas)) * 100) : 0,
      liquidacion_horas: Math.round(horas * Number(f.valor_hora)) };
  }) };
}

// ── Equipos y mantenimiento ──
const equiposBase = crudDe(GymEquipo, {
  nombre: { req: true, max: 150, label: 'Nombre' }, tipo: { tipo: 'enum', valores: ['maquina', 'cinta', 'bicicleta', 'equipamiento', 'otro'] },
  sucursal_id: { tipo: 'int' }, marca: { max: 100 }, modelo: { max: 100 }, nro_serie: { max: 100 }, fecha_compra: { tipo: 'fecha' },
  garantia_hasta: { tipo: 'fecha' }, frecuencia_mant_dias: { tipo: 'int', min: 1 }, ultimo_mantenimiento: { tipo: 'fecha' },
  estado: { tipo: 'enum', valores: ['operativo', 'mantenimiento', 'fuera_servicio', 'baja'] },
}, { orden: [['nombre', 'ASC']], include: [{ model: GymSucursal, as: 'sucursal', attributes: ['id', 'nombre'] }], antes: sucursalDelComplejo, filtros: ['estado', 'sucursal_id', 'tipo'] });

async function registrarEvento(complexId, equipoId, body) {
  const eq = await equiposBase.obtener(complexId, equipoId);
  const d = campos(body, {
    tipo: { req: true, tipo: 'enum', valores: ['mantenimiento', 'reparacion', 'garantia'], label: 'Tipo' }, fecha: { tipo: 'fecha' },
    descripcion: { req: true, max: 255, label: 'Descripción' }, costo: { tipo: 'num' }, proveedor: { max: 150 },
  });
  const fecha = d.fecha || todayAR();
  return sequelize.transaction(async (t) => {
    const ev = await GymEquipoEvento.create({ ...d, fecha, equipo_id: equipoId }, { transaction: t });
    if (d.tipo === 'mantenimiento' && (!eq.ultimo_mantenimiento || fecha > eq.ultimo_mantenimiento)) await eq.update({ ultimo_mantenimiento: fecha }, { transaction: t });
    // Una reparación cerrada vuelve el equipo a operativo
    if (d.tipo === 'reparacion' && body.cerrar === true && eq.estado !== 'baja') await eq.update({ estado: 'operativo' }, { transaction: t });
    return ev;
  });
}
const eventos = (complexId, equipoId) => equiposBase.obtener(complexId, equipoId).then(() => GymEquipoEvento.findAll({ where: { equipo_id: equipoId }, order: [['fecha', 'DESC']] }));

/** Alertas: mantenimiento vencido/próximo (7 días), garantía por vencer (30 días), fuera de servicio. */
async function alertasEquipos(complexId) {
  const hoy = todayAR();
  const eqs = await GymEquipo.findAll({ where: { complex_id: complexId, estado: { [Op.ne]: 'baja' } }, include: [{ model: GymSucursal, as: 'sucursal', attributes: ['nombre'] }] });
  const out = [];
  for (const e of eqs) {
    if (e.estado === 'fuera_servicio') out.push({ equipo: e, tipo: 'fuera_servicio', nivel: 'critico', mensaje: `${e.nombre} está fuera de servicio.` });
    if (e.frecuencia_mant_dias) {
      const proximo = sumarDias(e.ultimo_mantenimiento || e.fecha_compra || hoy, e.frecuencia_mant_dias);
      if (proximo < hoy) out.push({ equipo: e, tipo: 'mantenimiento_vencido', nivel: 'critico', fecha: proximo, mensaje: `${e.nombre}: mantenimiento vencido desde ${proximo}.` });
      else if (proximo <= sumarDias(hoy, 7)) out.push({ equipo: e, tipo: 'mantenimiento_proximo', nivel: 'aviso', fecha: proximo, mensaje: `${e.nombre}: mantenimiento el ${proximo}.` });
    }
    if (e.garantia_hasta && e.garantia_hasta >= hoy && e.garantia_hasta <= sumarDias(hoy, 30)) out.push({ equipo: e, tipo: 'garantia', nivel: 'aviso', fecha: e.garantia_hasta, mensaje: `${e.nombre}: la garantía vence el ${e.garantia_hasta}.` });
  }
  return out;
}

const equipos = { ...equiposBase, registrarEvento, eventos, alertas: alertasEquipos };

module.exports = { crudDe, sucursales, actividades, planes, profesores, estadisticasProfesores, equipos };
