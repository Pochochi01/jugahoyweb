'use strict';
/**
 * Migration 030 — Consumos por turno + cobro del turno
 *
 * booking_consumos: productos de cantina agregados a un turno (se acumulan durante
 *   el partido). El stock se descuenta al agregarlos; el ingreso a caja se registra
 *   recién al cobrar el turno.
 *
 * bookings.cobrado / cobrado_at / cobro_detalle: marca el turno como cobrado y
 *   guarda el detalle del cobro (cantidad de jugadores, monto por jugador y qué
 *   jugadores pagaron). El costo de cancha + consumos suma a caja SOLO al cobrar.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));

    if (!tablas.includes('booking_consumos')) {
      await queryInterface.createTable('booking_consumos', {
        id:              { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        booking_id:      { type: N.INTEGER, allowNull: false, references: { model: 'bookings', key: 'id' }, onDelete: 'CASCADE' },
        producto_id:     { type: N.INTEGER, allowNull: false, references: { model: 'cantina_productos', key: 'id' }, onDelete: 'RESTRICT' },
        nombre_producto: { type: N.STRING(150), allowNull: false },   // snapshot al momento del consumo
        cantidad:        { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
        precio_unitario: { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        subtotal:        { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        usuario_id:      { type: N.INTEGER },
        created_at:      { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at:      { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('booking_consumos', ['booking_id']);
    }

    const bookings = await queryInterface.describeTable('bookings');
    if (!bookings.cobrado) {
      await queryInterface.addColumn('bookings', 'cobrado', {
        type: N.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    if (!bookings.cobrado_at) {
      await queryInterface.addColumn('bookings', 'cobrado_at', {
        type: N.DATE, allowNull: true, defaultValue: null,
      });
    }
    if (!bookings.cobro_detalle) {
      await queryInterface.addColumn('bookings', 'cobro_detalle', {
        type: N.JSON, allowNull: true, defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const bookings = await queryInterface.describeTable('bookings');
    if (bookings.cobro_detalle) await queryInterface.removeColumn('bookings', 'cobro_detalle');
    if (bookings.cobrado_at)    await queryInterface.removeColumn('bookings', 'cobrado_at');
    if (bookings.cobrado)       await queryInterface.removeColumn('bookings', 'cobrado');
    await queryInterface.dropTable('booking_consumos');
  },
};
