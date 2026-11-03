'use strict';
/**
 * Migration 056 — Agrega 'gym_alerta' al ENUM de notifications.tipo (avisos del
 * módulo Gym al administrador: ingreso bloqueado). Idempotente.
 */
const BASE = ['nueva_reserva', 'reserva_confirmada', 'reserva_rechazada', 'reserva_cancelada', 'token_por_vencer', 'lista_espera'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('notifications', 'tipo', { type: Sequelize.ENUM(...BASE, 'gym_alerta'), allowNull: false });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query("UPDATE notifications SET tipo = 'nueva_reserva' WHERE tipo = 'gym_alerta'");
    await queryInterface.changeColumn('notifications', 'tipo', { type: Sequelize.ENUM(...BASE), allowNull: false });
  },
};
