'use strict';
/**
 * Migration 050 — Confirmación de asistencia por WhatsApp
 *   configuracion_chatbot (1 fila por complejo):
 *     hora_recordatorio  'HH:mm' a la que sale el pedido de confirmación (null = desactivado)
 *     horas_confirmacion plazo para responder (default 3)
 *   bookings (= "turnos"):
 *     estado_confirmacion  null (no aplica) | pendiente | confirmado | cancelado
 *     confirmacion_enviada_at / confirmacion_limite / confirmacion_tel
 * Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tablas = (await queryInterface.showAllTables()).map(t => String(t.tableName || t).toLowerCase());
    if (!tablas.includes('configuracion_chatbot')) {
      await queryInterface.createTable('configuracion_chatbot', {
        id:                 { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:         { type: Sequelize.INTEGER, allowNull: false, unique: true, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        hora_recordatorio:  { type: Sequelize.STRING(5), allowNull: true, defaultValue: null },
        horas_confirmacion: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
        created_at:         { type: Sequelize.DATE, allowNull: false },
        updated_at:         { type: Sequelize.DATE, allowNull: false },
      });
    }
    const b = await queryInterface.describeTable('bookings');
    if (!b.estado_confirmacion) {
      await queryInterface.addColumn('bookings', 'estado_confirmacion', { type: Sequelize.ENUM('pendiente', 'confirmado', 'cancelado'), allowNull: true, defaultValue: null });
    }
    if (!b.confirmacion_enviada_at) await queryInterface.addColumn('bookings', 'confirmacion_enviada_at', { type: Sequelize.DATE, allowNull: true, defaultValue: null });
    if (!b.confirmacion_limite) await queryInterface.addColumn('bookings', 'confirmacion_limite', { type: Sequelize.DATE, allowNull: true, defaultValue: null });
    if (!b.confirmacion_tel) await queryInterface.addColumn('bookings', 'confirmacion_tel', { type: Sequelize.STRING(30), allowNull: true, defaultValue: null });
    await queryInterface.addIndex('bookings', ['estado_confirmacion', 'confirmacion_limite'], { name: 'idx_bookings_confirmacion' }).catch(() => {});
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('bookings', 'idx_bookings_confirmacion').catch(() => {});
    for (const c of ['estado_confirmacion', 'confirmacion_enviada_at', 'confirmacion_limite', 'confirmacion_tel']) {
      await queryInterface.removeColumn('bookings', c).catch(() => {});
    }
    await queryInterface.dropTable('configuracion_chatbot').catch(() => {});
  },
};
