'use strict';
/**
 * Migration 006 — Crear tabla time_slots
 * Granularidad de 30 min por cancha/fecha/hora. Usada por el chatbot para bloquear slots.
 * Segura: verifica si la tabla ya existe antes de crearla.
 *
 * Índice único: (field_id, fecha, hora) — evita doble-booking a nivel BD.
 * Relaciones (ORM):
 *   time_slots.field_id   → fields.id
 *   time_slots.booking_id → bookings.id  (null = slot libre)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('time_slots')) return;

    await queryInterface.createTable('time_slots', {
      id         : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      field_id   : { type: Sequelize.INTEGER, allowNull: false },
      fecha      : { type: Sequelize.DATEONLY, allowNull: false },
      hora       : { type: Sequelize.STRING(5), allowNull: false },
      estado     : { type: Sequelize.ENUM('libre', 'ocupado'), defaultValue: 'libre' },
      booking_id : { type: Sequelize.INTEGER, allowNull: true },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // Índice único: garantiza integridad a nivel BD (mismo campo+fecha+hora no puede existir dos veces)
    await queryInterface.addIndex('time_slots', ['field_id', 'fecha', 'hora'], {
      unique: true,
      name  : 'uq_time_slots_field_fecha_hora',
    });

    await queryInterface.addIndex('time_slots', ['booking_id'], { name: 'idx_time_slots_booking' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('time_slots');
  },
};
