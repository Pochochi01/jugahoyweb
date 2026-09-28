'use strict';
/**
 * Migration 037 — Módulo "Profesores de pádel" (acceso por DNI)
 *
 *   profesores           → un registro POR COMPLEJO (el mismo DNI puede repetirse
 *                          en distintos complejos; único por id_tenant + dni).
 *                          usuario = DNI, password = hash bcrypt del DNI.
 *   profesor_canchas     → ventanas semanales que el admin habilita para clases
 *                          (cancha + día de semana + desde/hasta).
 *   horarios_profesor    → clases concretas cargadas por el profesor (fecha, hora,
 *                          cancha). estado: 'ocupado' | 'cancelado'. Los horarios
 *                          "disponibles" se CALCULAN (ventanas − ocupados − reservas).
 *   alumnos              → alumnos de cada clase (nombre + celular).
 *
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

    if (!tablas.includes('profesores')) {
      await queryInterface.createTable('profesores', {
        id:        { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        id_tenant: fk('complexes'),
        nombre:    { type: N.STRING(100), allowNull: false },
        apellido:  { type: N.STRING(100), allowNull: false },
        dni:       { type: N.STRING(15), allowNull: false },
        password:  { type: N.STRING(255), allowNull: false },
        whatsapp:  { type: N.STRING(30) },
        activo:    { type: N.BOOLEAN, allowNull: false, defaultValue: true },
        ...ts,
      });
      await queryInterface.addIndex('profesores', ['id_tenant', 'dni'], { unique: true, name: 'uq_profesor_tenant_dni' });
      await queryInterface.addIndex('profesores', ['dni'], { name: 'ix_profesores_dni' });
    }

    if (!tablas.includes('profesor_canchas')) {
      await queryInterface.createTable('profesor_canchas', {
        id:          { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        profesor_id: fk('profesores'),
        field_id:    fk('fields'),
        dia_semana:  { type: N.TINYINT, allowNull: false },   // 0 = domingo … 6 = sábado
        hora_desde:  { type: N.STRING(5), allowNull: false },
        hora_hasta:  { type: N.STRING(5), allowNull: false },
        ...ts,
      });
    }

    if (!tablas.includes('horarios_profesor')) {
      await queryInterface.createTable('horarios_profesor', {
        id:          { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        profesor_id: fk('profesores'),
        field_id:    fk('fields'),
        fecha:       { type: N.DATEONLY, allowNull: false },
        hora_inicio: { type: N.STRING(5), allowNull: false },
        hora_fin:    { type: N.STRING(5), allowNull: false },
        estado:      { type: N.ENUM('ocupado', 'cancelado'), allowNull: false, defaultValue: 'ocupado' },
        nota:        { type: N.STRING(255) },
        ...ts,
      });
      await queryInterface.addIndex('horarios_profesor', ['field_id', 'fecha'], { name: 'ix_horarios_prof_field_fecha' });
    }

    if (!tablas.includes('alumnos')) {
      await queryInterface.createTable('alumnos', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        id_horario: fk('horarios_profesor'),
        nombre:     { type: N.STRING(150), allowNull: false },
        celular:    { type: N.STRING(30), allowNull: false },
        ...ts,
      });
    }

    // Las clases bloquean la cancha en la agenda general (mismo mecanismo que las
    // reservas: filas 'ocupado' en time_slots). Esta columna las identifica para
    // liberarlas al cancelar la clase.
    const slots = await queryInterface.describeTable('time_slots');
    if (!slots.horario_profesor_id) {
      await queryInterface.addColumn('time_slots', 'horario_profesor_id', {
        type: N.INTEGER, allowNull: true, references: { model: 'horarios_profesor', key: 'id' }, onDelete: 'CASCADE',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('time_slots', 'horario_profesor_id').catch(() => {});
    for (const t of ['alumnos', 'horarios_profesor', 'profesor_canchas', 'profesores']) {
      await queryInterface.dropTable(t).catch(() => {});
    }
  },
};
