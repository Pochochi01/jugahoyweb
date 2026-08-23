'use strict';
/**
 * Migration 029 — Turnos fijos (reservas recurrentes semanales)
 *
 * recurring_bookings: plantilla de un turno que se repite cada semana el mismo
 * día. Al crearla se materializan ocurrencias (bookings) hacia adelante; al darla
 * de baja se cancela la recurrencia futura.
 *
 * bookings.recurring_id → vincula cada ocurrencia con su plantilla.
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));

    if (!tablas.includes('recurring_bookings')) {
      await queryInterface.createTable('recurring_bookings', {
        id:               { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:       { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        field_id:         { type: N.INTEGER, allowNull: false, references: { model: 'fields', key: 'id' }, onDelete: 'CASCADE' },
        dia_semana:       { type: N.INTEGER, allowNull: false },   // 0=Dom .. 6=Sáb
        hora_inicio:      { type: N.STRING(5), allowNull: false },
        hora_fin:         { type: N.STRING(5), allowNull: false },
        duracion:         { type: N.INTEGER, allowNull: false, defaultValue: 60 },
        nombre_cliente:   { type: N.STRING(150), allowNull: false },
        telefono_cliente: { type: N.STRING(30) },
        monto:            { type: N.DECIMAL(10, 2), defaultValue: 0 },
        metodo_pago:      { type: N.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'), defaultValue: 'efectivo' },
        desde_fecha:      { type: N.DATEONLY, allowNull: false },
        activo:           { type: N.BOOLEAN, allowNull: false, defaultValue: true },
        created_by:       { type: N.INTEGER },
        created_at:       { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at:       { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('recurring_bookings', ['complex_id', 'activo']);
    }

    const bookings = await queryInterface.describeTable('bookings');
    if (!bookings.recurring_id) {
      await queryInterface.addColumn('bookings', 'recurring_id', {
        type: N.INTEGER, allowNull: true, defaultValue: null,
      });
      await queryInterface.addIndex('bookings', ['recurring_id']);
    }
  },

  async down(queryInterface) {
    const bookings = await queryInterface.describeTable('bookings');
    if (bookings.recurring_id) await queryInterface.removeColumn('bookings', 'recurring_id');
    await queryInterface.dropTable('recurring_bookings');
  },
};
