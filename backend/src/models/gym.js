/**
 * models/gym.js — Modelos del módulo GYM / FITNESS CENTER (migración 055).
 * Se agrupan en un archivo porque forman un solo agregado; models/index.js los
 * exporta junto al resto y llama a asociar() con los modelos compartidos.
 */
const { DataTypes: T } = require('sequelize');
const sequelize = require('../config/database');

const TIPOS = ['libre', 'musculacion', 'funcional', 'crossfit', 'spinning', 'natacion', 'artes_marciales', 'personalizado'];
const PERIODOS = ['diario', 'semanal', 'mensual', 'trimestral', 'semestral', 'anual'];
const ESTADOS_SOCIO = ['activo', 'suspendido', 'moroso', 'baja', 'congelado'];
const METODOS_PAGO = ['efectivo', 'transferencia', 'debito', 'credito', 'mercadopago'];

const id = { type: T.INTEGER, primaryKey: true, autoIncrement: true };
const def = (nombre, attrs, opts = {}) => sequelize.define(nombre, attrs, { tableName: opts.tableName, ...opts });

const GymConfig = def('GymConfig', {
  complex_id: { type: T.INTEGER, primaryKey: true },
  dias_gracia: { type: T.INTEGER, defaultValue: 5 },
  exigir_apto_medico: { type: T.BOOLEAN, defaultValue: true },
  recibo_prefijo: { type: T.STRING(10), defaultValue: 'G' },
  proximo_recibo: { type: T.INTEGER, defaultValue: 1 },
  nutricion_habilitada: { type: T.BOOLEAN, defaultValue: false },
}, { tableName: 'gym_config' });

const GymSucursal = def('GymSucursal', {
  id, complex_id: { type: T.INTEGER, allowNull: false },
  nombre: { type: T.STRING(100), allowNull: false }, direccion: T.STRING(200), telefono: T.STRING(30),
  activa: { type: T.BOOLEAN, defaultValue: true },
}, { tableName: 'gym_sucursales' });

const GymActividad = def('GymActividad', {
  id, complex_id: { type: T.INTEGER, allowNull: false },
  nombre: { type: T.STRING(100), allowNull: false }, tipo: { type: T.ENUM(...TIPOS), defaultValue: 'libre' },
  descripcion: T.STRING(255), color: T.STRING(9), activa: { type: T.BOOLEAN, defaultValue: true },
}, { tableName: 'gym_actividades' });

const GymPlan = def('GymPlan', {
  id, complex_id: { type: T.INTEGER, allowNull: false },
  nombre: { type: T.STRING(100), allowNull: false }, tipo: { type: T.ENUM(...TIPOS), defaultValue: 'libre' },
  periodo: { type: T.ENUM(...PERIODOS), defaultValue: 'mensual' },
  precio: { type: T.DECIMAL(10, 2), defaultValue: 0 }, descuento_pct: { type: T.DECIMAL(5, 2), defaultValue: 0 },
  hora_desde: T.STRING(5), hora_hasta: T.STRING(5), clases_por_semana: T.INTEGER, descripcion: T.STRING(255),
  activo: { type: T.BOOLEAN, defaultValue: true },
}, { tableName: 'gym_planes' });

const GymPlanActividad = def('GymPlanActividad', {
  plan_id: { type: T.INTEGER, primaryKey: true }, actividad_id: { type: T.INTEGER, primaryKey: true },
}, { tableName: 'gym_plan_actividades', timestamps: false });

const GymProfesor = def('GymProfesor', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, profesor_id: T.INTEGER,
  nombre: { type: T.STRING(100), allowNull: false }, apellido: { type: T.STRING(100), allowNull: false },
  dni: T.STRING(15), telefono: T.STRING(30), email: T.STRING(150),
  rol: { type: T.ENUM('profesor', 'personal_trainer', 'nutricionista'), defaultValue: 'profesor' },
  especialidad: T.STRING(150), certificaciones: T.TEXT,
  valor_hora: { type: T.DECIMAL(10, 2), defaultValue: 0 }, comision_pct: { type: T.DECIMAL(5, 2), defaultValue: 0 },
  activo: { type: T.BOOLEAN, defaultValue: true },
}, { tableName: 'gym_profesores' });

const GymProfesorHorario = def('GymProfesorHorario', {
  id, profesor_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER,
  dia_semana: { type: T.TINYINT, allowNull: false }, hora_desde: { type: T.STRING(5), allowNull: false }, hora_hasta: { type: T.STRING(5), allowNull: false },
}, { tableName: 'gym_profesor_horarios' });

const GymSocio = def('GymSocio', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER,
  foto_url: T.STRING(255), nombre: { type: T.STRING(100), allowNull: false }, apellido: { type: T.STRING(100), allowNull: false },
  dni: { type: T.STRING(15), allowNull: false }, fecha_nacimiento: T.DATEONLY, sexo: T.ENUM('F', 'M', 'X'),
  direccion: T.STRING(200), localidad: T.STRING(100), provincia: T.STRING(100),
  telefono: T.STRING(30), whatsapp: T.STRING(30), email: T.STRING(150),
  emergencia_nombre: T.STRING(150), emergencia_telefono: T.STRING(30), obra_social: T.STRING(100), observaciones: T.TEXT,
  estado: { type: T.ENUM(...ESTADOS_SOCIO), defaultValue: 'activo' },
  codigo: { type: T.STRING(12), allowNull: false }, qr_token: { type: T.STRING(64), allowNull: false },
  fecha_alta: { type: T.DATEONLY, allowNull: false }, fecha_baja: T.DATEONLY,
}, { tableName: 'gym_socios' });

const GymAptoMedico = def('GymAptoMedico', {
  id, socio_id: { type: T.INTEGER, allowNull: false },
  fecha_emision: { type: T.DATEONLY, allowNull: false }, fecha_vencimiento: { type: T.DATEONLY, allowNull: false },
  profesional: T.STRING(150), archivo_url: T.STRING(255), observaciones: T.STRING(255),
}, { tableName: 'gym_aptos_medicos' });

const GymSocioHistorial = def('GymSocioHistorial', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, socio_id: { type: T.INTEGER, allowNull: false },
  tipo: { type: T.ENUM('alta', 'baja', 'renovacion', 'pago', 'estado', 'plan', 'rutina', 'evaluacion', 'apto', 'otro'), allowNull: false },
  descripcion: { type: T.STRING(255), allowNull: false }, usuario_id: T.INTEGER,
}, { tableName: 'gym_socio_historial' });

const GymMembresia = def('GymMembresia', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, socio_id: { type: T.INTEGER, allowNull: false }, plan_id: { type: T.INTEGER, allowNull: false },
  fecha_inicio: { type: T.DATEONLY, allowNull: false }, fecha_fin: { type: T.DATEONLY, allowNull: false },
  precio: { type: T.DECIMAL(10, 2), allowNull: false }, descuento: { type: T.DECIMAL(10, 2), defaultValue: 0 }, total: { type: T.DECIMAL(10, 2), allowNull: false },
  estado: { type: T.ENUM('vigente', 'vencida', 'cancelada', 'congelada'), defaultValue: 'vigente' },
  renovacion_de_id: T.INTEGER, usuario_id: T.INTEGER,
}, { tableName: 'gym_membresias' });

const GymPago = def('GymPago', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, socio_id: { type: T.INTEGER, allowNull: false }, membresia_id: T.INTEGER,
  numero_recibo: { type: T.STRING(20), allowNull: false }, concepto: { type: T.STRING(200), allowNull: false },
  monto: { type: T.DECIMAL(10, 2), allowNull: false }, metodo: { type: T.ENUM(...METODOS_PAGO), allowNull: false },
  fecha: { type: T.DATEONLY, allowNull: false }, anulado: { type: T.BOOLEAN, defaultValue: false },
  cash_transaction_id: T.INTEGER, usuario_id: T.INTEGER, sucursal_id: T.INTEGER,
}, { tableName: 'gym_pagos' });

const GymAcceso = def('GymAcceso', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER, socio_id: T.INTEGER,
  metodo: { type: T.ENUM('qr', 'codigo', 'dni', 'manual'), allowNull: false }, dato: T.STRING(64),
  resultado: { type: T.ENUM('permitido', 'denegado'), allowNull: false }, motivo: T.STRING(255), usuario_id: T.INTEGER,
}, { tableName: 'gym_accesos' });

const GymClase = def('GymClase', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER,
  actividad_id: { type: T.INTEGER, allowNull: false }, profesor_id: T.INTEGER,
  fecha: { type: T.DATEONLY, allowNull: false }, hora_inicio: { type: T.STRING(5), allowNull: false },
  duracion_min: { type: T.INTEGER, defaultValue: 60 }, cupo: { type: T.INTEGER, defaultValue: 20 },
  estado: { type: T.ENUM('disponible', 'completa', 'cancelada', 'finalizada'), defaultValue: 'disponible' }, notas: T.STRING(255),
}, { tableName: 'gym_clases' });

const GymReserva = def('GymReserva', {
  id, clase_id: { type: T.INTEGER, allowNull: false }, socio_id: { type: T.INTEGER, allowNull: false },
  estado: { type: T.ENUM('reservada', 'espera', 'cancelada', 'asistio', 'ausente'), defaultValue: 'reservada' },
  origen: { type: T.ENUM('panel', 'socio'), defaultValue: 'panel' },
}, { tableName: 'gym_reservas' });

const GymAsistencia = def('GymAsistencia', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER, socio_id: { type: T.INTEGER, allowNull: false },
  clase_id: T.INTEGER, actividad_id: T.INTEGER, profesor_id: T.INTEGER,
  fecha: { type: T.DATEONLY, allowNull: false }, hora: { type: T.STRING(5), allowNull: false },
  origen: { type: T.ENUM('acceso', 'clase', 'manual'), defaultValue: 'acceso' },
}, { tableName: 'gym_asistencias' });

const GymRutina = def('GymRutina', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, socio_id: T.INTEGER, profesor_id: T.INTEGER,
  nombre: { type: T.STRING(150), allowNull: false }, objetivo: T.STRING(255),
  version_actual: { type: T.INTEGER, defaultValue: 1 }, activa: { type: T.BOOLEAN, defaultValue: true },
}, { tableName: 'gym_rutinas' });

const GymRutinaVersion = def('GymRutinaVersion', {
  id, rutina_id: { type: T.INTEGER, allowNull: false }, version: { type: T.INTEGER, allowNull: false },
  notas: T.STRING(255), usuario_id: T.INTEGER,
}, { tableName: 'gym_rutina_versiones' });

const GymRutinaEjercicio = def('GymRutinaEjercicio', {
  id, version_id: { type: T.INTEGER, allowNull: false }, dia: { type: T.STRING(30), defaultValue: 'Día 1' },
  orden: { type: T.INTEGER, defaultValue: 0 }, nombre: { type: T.STRING(150), allowNull: false },
  series: T.INTEGER, repeticiones: T.STRING(20), peso: T.STRING(20), descanso_seg: T.INTEGER, notas: T.STRING(255),
}, { tableName: 'gym_rutina_ejercicios' });

const GymRutinaComentario = def('GymRutinaComentario', {
  id, rutina_id: { type: T.INTEGER, allowNull: false }, autor: { type: T.STRING(150), allowNull: false }, texto: { type: T.TEXT, allowNull: false },
}, { tableName: 'gym_rutina_comentarios' });

const GymEvaluacion = def('GymEvaluacion', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, socio_id: { type: T.INTEGER, allowNull: false }, profesor_id: T.INTEGER,
  fecha: { type: T.DATEONLY, allowNull: false },
  peso: T.DECIMAL(5, 2), altura: T.DECIMAL(5, 2), imc: T.DECIMAL(5, 2), grasa_pct: T.DECIMAL(5, 2), masa_muscular: T.DECIMAL(5, 2),
  cintura: T.DECIMAL(5, 1), cadera: T.DECIMAL(5, 1), pecho: T.DECIMAL(5, 1), brazo: T.DECIMAL(5, 1), pierna: T.DECIMAL(5, 1), notas: T.STRING(255),
}, { tableName: 'gym_evaluaciones' });

const GymNutricionPlan = def('GymNutricionPlan', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, socio_id: { type: T.INTEGER, allowNull: false }, profesional_id: T.INTEGER,
  fecha_inicio: { type: T.DATEONLY, allowNull: false }, objetivo: T.STRING(255), plan: { type: T.TEXT, allowNull: false },
  observaciones: T.TEXT, activo: { type: T.BOOLEAN, defaultValue: true },
}, { tableName: 'gym_nutricion_planes' });

const GymNutricionSeguimiento = def('GymNutricionSeguimiento', {
  id, plan_id: { type: T.INTEGER, allowNull: false }, fecha: { type: T.DATEONLY, allowNull: false },
  peso: T.DECIMAL(5, 2), observaciones: T.TEXT,
}, { tableName: 'gym_nutricion_seguimientos' });

const GymEquipo = def('GymEquipo', {
  id, complex_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER,
  nombre: { type: T.STRING(150), allowNull: false },
  tipo: { type: T.ENUM('maquina', 'cinta', 'bicicleta', 'equipamiento', 'otro'), defaultValue: 'maquina' },
  marca: T.STRING(100), modelo: T.STRING(100), nro_serie: T.STRING(100),
  fecha_compra: T.DATEONLY, garantia_hasta: T.DATEONLY, frecuencia_mant_dias: T.INTEGER, ultimo_mantenimiento: T.DATEONLY,
  estado: { type: T.ENUM('operativo', 'mantenimiento', 'fuera_servicio', 'baja'), defaultValue: 'operativo' },
}, { tableName: 'gym_equipos' });

const GymEquipoEvento = def('GymEquipoEvento', {
  id, equipo_id: { type: T.INTEGER, allowNull: false },
  tipo: { type: T.ENUM('mantenimiento', 'reparacion', 'garantia'), allowNull: false },
  fecha: { type: T.DATEONLY, allowNull: false }, descripcion: { type: T.STRING(255), allowNull: false },
  costo: { type: T.DECIMAL(10, 2), defaultValue: 0 }, proveedor: T.STRING(150),
}, { tableName: 'gym_equipo_eventos' });

const GymRol = def('GymRol', {
  id, complex_id: { type: T.INTEGER, allowNull: false },
  clave: { type: T.STRING(30), allowNull: false }, nombre: { type: T.STRING(60), allowNull: false }, permisos: { type: T.JSON, allowNull: false },
}, { tableName: 'gym_roles' });

const GymAuditoria = def('GymAuditoria', {
  id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
  complex_id: { type: T.INTEGER, allowNull: false }, sucursal_id: T.INTEGER, usuario_id: T.INTEGER, usuario: T.STRING(150),
  accion: { type: T.STRING(30), allowNull: false }, entidad: { type: T.STRING(40), allowNull: false },
  entidad_id: T.INTEGER, detalle: T.JSON, ip: T.STRING(45),
}, { tableName: 'gym_auditoria', updatedAt: false });

function asociar() {
  GymPlan.belongsToMany(GymActividad, { through: GymPlanActividad, foreignKey: 'plan_id', otherKey: 'actividad_id', as: 'actividades' });
  GymActividad.belongsToMany(GymPlan, { through: GymPlanActividad, foreignKey: 'actividad_id', otherKey: 'plan_id', as: 'planes' });
  GymProfesor.hasMany(GymProfesorHorario, { foreignKey: 'profesor_id', as: 'horarios', onDelete: 'CASCADE' });
  GymSocio.belongsTo(GymSucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
  GymSocio.hasMany(GymAptoMedico, { foreignKey: 'socio_id', as: 'aptos' });
  GymSocio.hasMany(GymMembresia, { foreignKey: 'socio_id', as: 'membresias' });
  GymSocio.hasMany(GymPago, { foreignKey: 'socio_id', as: 'pagos' });
  GymSocio.hasMany(GymSocioHistorial, { foreignKey: 'socio_id', as: 'historial' });
  GymMembresia.belongsTo(GymPlan, { foreignKey: 'plan_id', as: 'plan' });
  GymMembresia.belongsTo(GymSocio, { foreignKey: 'socio_id', as: 'socio' });
  GymPago.belongsTo(GymSocio, { foreignKey: 'socio_id', as: 'socio' });
  GymPago.belongsTo(GymMembresia, { foreignKey: 'membresia_id', as: 'membresia' });
  GymAcceso.belongsTo(GymSocio, { foreignKey: 'socio_id', as: 'socio' });
  GymClase.belongsTo(GymActividad, { foreignKey: 'actividad_id', as: 'actividad' });
  GymClase.belongsTo(GymProfesor, { foreignKey: 'profesor_id', as: 'profesor' });
  GymClase.belongsTo(GymSucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
  GymClase.hasMany(GymReserva, { foreignKey: 'clase_id', as: 'reservas' });
  GymReserva.belongsTo(GymClase, { foreignKey: 'clase_id', as: 'clase' });
  GymReserva.belongsTo(GymSocio, { foreignKey: 'socio_id', as: 'socio' });
  GymAsistencia.belongsTo(GymSocio, { foreignKey: 'socio_id', as: 'socio' });
  GymAsistencia.belongsTo(GymActividad, { foreignKey: 'actividad_id', as: 'actividad' });
  GymAsistencia.belongsTo(GymProfesor, { foreignKey: 'profesor_id', as: 'profesor' });
  GymRutina.hasMany(GymRutinaVersion, { foreignKey: 'rutina_id', as: 'versiones' });
  GymRutina.hasMany(GymRutinaComentario, { foreignKey: 'rutina_id', as: 'comentarios' });
  GymRutina.belongsTo(GymSocio, { foreignKey: 'socio_id', as: 'socio' });
  GymRutina.belongsTo(GymProfesor, { foreignKey: 'profesor_id', as: 'profesor' });
  GymRutinaVersion.hasMany(GymRutinaEjercicio, { foreignKey: 'version_id', as: 'ejercicios' });
  GymEvaluacion.belongsTo(GymProfesor, { foreignKey: 'profesor_id', as: 'profesor' });
  GymNutricionPlan.hasMany(GymNutricionSeguimiento, { foreignKey: 'plan_id', as: 'seguimientos' });
  GymNutricionPlan.belongsTo(GymProfesor, { foreignKey: 'profesional_id', as: 'profesional' });
  GymEquipo.hasMany(GymEquipoEvento, { foreignKey: 'equipo_id', as: 'eventos' });
  GymEquipo.belongsTo(GymSucursal, { foreignKey: 'sucursal_id', as: 'sucursal' });
}

module.exports = {
  modelos: {
    GymConfig, GymSucursal, GymActividad, GymPlan, GymPlanActividad, GymProfesor, GymProfesorHorario, GymSocio, GymAptoMedico,
    GymSocioHistorial, GymMembresia, GymPago, GymAcceso, GymClase, GymReserva, GymAsistencia, GymRutina, GymRutinaVersion,
    GymRutinaEjercicio, GymRutinaComentario, GymEvaluacion, GymNutricionPlan, GymNutricionSeguimiento, GymEquipo, GymEquipoEvento,
    GymRol, GymAuditoria,
  },
  asociar,
  constantes: { TIPOS, PERIODOS, ESTADOS_SOCIO, METODOS_PAGO },
};
