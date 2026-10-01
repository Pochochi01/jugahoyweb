'use strict';
/**
 * Migration 042 — Módulo Escuela de Fútbol
 *
 *  escuela_config              datos de la escuela por complejo (WhatsApp oficial, vencimiento de cuota)
 *  escuela_categorias          Sub-8, Sub-10… (rango de edad, cupos, cuota mensual)
 *  escuela_alumnos             alumnos (fecha de nacimiento → edad), responsable y token del portal
 *  escuela_profesor_categoria  entrenadores (tabla `profesores`, login por DNI) ↔ categorías
 *  escuela_horarios            entrenamientos semanales por categoría y cancha de fútbol
 *                              → cada uno crea un turno fijo (recurring_bookings) que bloquea la agenda
 *  escuela_pagos               cuotas por período (YYYY-MM): pendiente / pagado
 *  escuela_avisos              actividad normal / suspendida (por categoría o general)
 *
 * Las canchas son la tabla existente `fields` (deporte 'futbol').
 * Segura / idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model, onDelete = 'CASCADE', allowNull = false) =>
      ({ type: N.INTEGER, allowNull, references: { model, key: 'id' }, onDelete });
    const crear = async (nombre, def, indices = []) => {
      if (tablas.includes(nombre)) return;
      await queryInterface.createTable(nombre, { id: { type: N.INTEGER, primaryKey: true, autoIncrement: true }, ...def, ...ts });
      for (const [campos, opts] of indices) await queryInterface.addIndex(nombre, campos, opts);
    };

    await crear('escuela_config', {
      complex_id:       { ...fk('complexes'), unique: true },
      nombre:           { type: N.STRING(150) },
      whatsapp_oficial: { type: N.STRING(30) },
      dia_vencimiento:  { type: N.TINYINT, allowNull: false, defaultValue: 10 },
    });

    await crear('escuela_categorias', {
      complex_id:    fk('complexes'),
      nombre:        { type: N.STRING(50), allowNull: false },
      edad_min:      { type: N.TINYINT, allowNull: false },
      edad_max:      { type: N.TINYINT, allowNull: false },
      cupos:         { type: N.SMALLINT, allowNull: false },
      cuota_mensual: { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      activa:        { type: N.BOOLEAN, allowNull: false, defaultValue: true },
    }, [[['complex_id', 'nombre'], { unique: true, name: 'uq_escuela_categoria_nombre' }]]);

    await crear('escuela_alumnos', {
      complex_id:           fk('complexes'),
      categoria_id:         fk('escuela_categorias', 'RESTRICT'),
      nombre:               { type: N.STRING(150), allowNull: false },
      dni:                  { type: N.STRING(15) },
      fecha_nacimiento:     { type: N.DATEONLY, allowNull: false },
      genero:               { type: N.ENUM('masculino', 'femenino', 'otro'), allowNull: false },
      responsable_nombre:   { type: N.STRING(150), allowNull: false },
      responsable_whatsapp: { type: N.STRING(30), allowNull: false },
      responsable_email:    { type: N.STRING(150) },
      estado:               { type: N.ENUM('activo', 'inactivo'), allowNull: false, defaultValue: 'activo' },
      token_portal:         { type: N.STRING(64), allowNull: false, unique: true },
    }, [[['complex_id', 'dni'], { unique: true, name: 'uq_escuela_alumno_dni' }]]);

    await crear('escuela_profesor_categoria', {
      profesor_id:  fk('profesores'),
      categoria_id: fk('escuela_categorias'),
    }, [[['profesor_id', 'categoria_id'], { unique: true, name: 'uq_escuela_prof_cat' }]]);

    await crear('escuela_horarios', {
      categoria_id:         fk('escuela_categorias'),
      field_id:             fk('fields', 'RESTRICT'),
      dia_semana:           { type: N.TINYINT, allowNull: false },
      hora_inicio:          { type: N.STRING(5), allowNull: false },
      hora_fin:             { type: N.STRING(5), allowNull: false },
      recurring_booking_id: fk('recurring_bookings', 'SET NULL', true),
    });

    await crear('escuela_pagos', {
      alumno_id:      fk('escuela_alumnos'),
      periodo:        { type: N.STRING(7), allowNull: false },        // YYYY-MM
      monto:          { type: N.DECIMAL(10, 2), allowNull: false },
      estado:         { type: N.ENUM('pendiente', 'pagado'), allowNull: false, defaultValue: 'pendiente' },
      fecha_pago:     { type: N.DATEONLY },
      metodo_pago:    { type: N.STRING(20) },
      comprobante:    { type: N.STRING(30) },
      usuario_id:     fk('users', 'SET NULL', true),
    }, [[['alumno_id', 'periodo'], { unique: true, name: 'uq_escuela_pago_periodo' }]]);

    await crear('escuela_avisos', {
      complex_id:   fk('complexes'),
      categoria_id: fk('escuela_categorias', 'CASCADE', true),     // null = toda la escuela
      fecha:        { type: N.DATEONLY, allowNull: false },
      estado:       { type: N.ENUM('normal', 'suspendida'), allowNull: false },
      mensaje:      { type: N.STRING(500) },
      autor:        { type: N.STRING(150) },
    }, [[['complex_id', 'fecha'], { name: 'ix_escuela_avisos_fecha' }]]);
  },

  async down(queryInterface) {
    for (const t of ['escuela_avisos', 'escuela_pagos', 'escuela_horarios', 'escuela_profesor_categoria',
      'escuela_alumnos', 'escuela_categorias', 'escuela_config']) {
      await queryInterface.dropTable(t).catch(() => {});
    }
  },
};
