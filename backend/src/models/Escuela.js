const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Escuela de Fútbol — modelos.
 * Los entrenadores son registros de `profesores` (login por DNI, por complejo)
 * vinculados a categorías por EscuelaProfesorCategoria.
 */

const EscuelaConfig = sequelize.define('EscuelaConfig', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:       { type: DataTypes.INTEGER, allowNull: false, unique: true },
  nombre:           { type: DataTypes.STRING(150) },
  // Número oficial de la escuela: firma de los mensajes y botón "escribir a la escuela" del portal
  whatsapp_oficial: { type: DataTypes.STRING(30) },
  dia_vencimiento:  { type: DataTypes.TINYINT, defaultValue: 10 },   // día del mes en que vence la cuota
}, { tableName: 'escuela_config' });

const EscuelaCategoria = sequelize.define('EscuelaCategoria', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:    { type: DataTypes.INTEGER, allowNull: false },
  nombre:        { type: DataTypes.STRING(50), allowNull: false },     // "Sub-10"
  edad_min:      { type: DataTypes.TINYINT, allowNull: false },
  edad_max:      { type: DataTypes.TINYINT, allowNull: false },
  cupos:         { type: DataTypes.SMALLINT, allowNull: false },
  cuota_mensual: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  activa:        { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'escuela_categorias' });

// Se guarda la fecha de nacimiento (no la edad): la edad cambia y la categoría depende de ella.
const EscuelaAlumno = sequelize.define('EscuelaAlumno', {
  id:                   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:           { type: DataTypes.INTEGER, allowNull: false },
  categoria_id:         { type: DataTypes.INTEGER, allowNull: false },
  nombre:               { type: DataTypes.STRING(150), allowNull: false },
  dni:                  { type: DataTypes.STRING(15) },
  fecha_nacimiento:     { type: DataTypes.DATEONLY, allowNull: false },
  genero:               { type: DataTypes.ENUM('masculino', 'femenino', 'otro'), allowNull: false },
  responsable_nombre:   { type: DataTypes.STRING(150), allowNull: false },
  responsable_whatsapp: { type: DataTypes.STRING(30), allowNull: false },   // dígitos con código de país
  responsable_email:    { type: DataTypes.STRING(150) },
  estado:               { type: DataTypes.ENUM('activo', 'inactivo'), defaultValue: 'activo' },
  // Token del portal del alumno/padre (link sin contraseña que va en los mensajes)
  token_portal:         { type: DataTypes.STRING(64), allowNull: false, unique: true },
}, { tableName: 'escuela_alumnos' });

const EscuelaProfesorCategoria = sequelize.define('EscuelaProfesorCategoria', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  profesor_id:  { type: DataTypes.INTEGER, allowNull: false },
  categoria_id: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'escuela_profesor_categoria' });

// Entrenamiento semanal. Bloquea la cancha vía un turno fijo (recurring_booking_id).
const EscuelaHorario = sequelize.define('EscuelaHorario', {
  id:                   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  categoria_id:         { type: DataTypes.INTEGER, allowNull: false },
  field_id:             { type: DataTypes.INTEGER, allowNull: false },
  dia_semana:           { type: DataTypes.TINYINT, allowNull: false },   // 0 = domingo
  hora_inicio:          { type: DataTypes.STRING(5), allowNull: false },
  hora_fin:             { type: DataTypes.STRING(5), allowNull: false },
  recurring_booking_id: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'escuela_horarios' });

const EscuelaPago = sequelize.define('EscuelaPago', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  alumno_id:   { type: DataTypes.INTEGER, allowNull: false },
  periodo:     { type: DataTypes.STRING(7), allowNull: false },   // YYYY-MM
  monto:       { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  estado:      { type: DataTypes.ENUM('pendiente', 'pagado'), defaultValue: 'pendiente' },
  fecha_pago:  { type: DataTypes.DATEONLY },
  metodo_pago: { type: DataTypes.STRING(20) },
  comprobante: { type: DataTypes.STRING(30) },
  usuario_id:  { type: DataTypes.INTEGER },
}, { tableName: 'escuela_pagos' });

const EscuelaAviso = sequelize.define('EscuelaAviso', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:   { type: DataTypes.INTEGER, allowNull: false },
  categoria_id: { type: DataTypes.INTEGER, allowNull: true },   // null = toda la escuela
  fecha:        { type: DataTypes.DATEONLY, allowNull: false },
  estado:       { type: DataTypes.ENUM('normal', 'suspendida'), allowNull: false },
  mensaje:      { type: DataTypes.STRING(500) },
  autor:        { type: DataTypes.STRING(150) },
}, { tableName: 'escuela_avisos' });

module.exports = {
  EscuelaConfig, EscuelaCategoria, EscuelaAlumno, EscuelaProfesorCategoria,
  EscuelaHorario, EscuelaPago, EscuelaAviso,
};
