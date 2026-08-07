'use strict';
/**
 * Migration 024 — Origen de operación + tipo de notificación "cancelada"
 *
 * operations:
 *   - origen VARCHAR(20) → 'pwa' | 'chatbot' | 'web' ... para trazabilidad del
 *     canal que generó la operación. Las filas existentes quedan como 'pwa'.
 *
 * notifications:
 *   - tipo ENUM → agrega 'reserva_cancelada' (aviso al admin de una cancelación).
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const operations = await queryInterface.describeTable('operations');
    if (!operations.origen) {
      await queryInterface.addColumn('operations', 'origen', {
        type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pwa', after: 'tipo',
      });
    }

    await queryInterface.changeColumn('notifications', 'tipo', {
      type: Sequelize.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada', 'reserva_cancelada', 'token_por_vencer'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    const operations = await queryInterface.describeTable('operations');
    if (operations.origen) await queryInterface.removeColumn('operations', 'origen');

    await queryInterface.sequelize.query(
      "UPDATE `notifications` SET `tipo`='reserva_rechazada' WHERE `tipo`='reserva_cancelada'"
    );
    await queryInterface.changeColumn('notifications', 'tipo', {
      type: Sequelize.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada', 'token_por_vencer'),
      allowNull: false,
    });
  },
};
