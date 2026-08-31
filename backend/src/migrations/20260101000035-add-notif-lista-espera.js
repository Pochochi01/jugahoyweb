'use strict';
/**
 * Migration 035 — Agrega el tipo 'lista_espera' al ENUM de notifications.tipo
 * para poder crear avisos in-app cuando se libera un turno de lista de espera.
 * Idempotente (reejecutar deja la misma definición).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    await queryInterface.changeColumn('notifications', 'tipo', {
      type: N.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada', 'reserva_cancelada', 'token_por_vencer', 'lista_espera'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    const N = Sequelize;
    await queryInterface.changeColumn('notifications', 'tipo', {
      type: N.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada', 'reserva_cancelada', 'token_por_vencer'),
      allowNull: false,
    });
  },
};
