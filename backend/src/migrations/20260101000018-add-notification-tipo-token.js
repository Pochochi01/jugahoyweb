'use strict';
/**
 * Migration 018 — Agregar el tipo 'token_por_vencer' a notifications.tipo
 *
 * Lo usa el chequeo periódico de credenciales (scripts/check-expiring-tokens.js)
 * para avisarle al dueño del club que su token de Meta/MercadoPago está por vencer.
 *
 * El frontend no requiere cambios: NotificationBell cae al ícono por defecto
 * cuando el tipo no está en su mapa.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('notifications', 'tipo', {
      type: Sequelize.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada', 'token_por_vencer'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Las filas del tipo nuevo pasan a 'nueva_reserva' para poder revertir el enum
    await queryInterface.sequelize.query(
      "UPDATE `notifications` SET `tipo`='nueva_reserva' WHERE `tipo`='token_por_vencer'"
    );
    await queryInterface.changeColumn('notifications', 'tipo', {
      type: Sequelize.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada'),
      allowNull: false,
    });
  },
};
