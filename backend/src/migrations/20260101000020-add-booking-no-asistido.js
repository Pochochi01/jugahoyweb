'use strict';
/**
 * Migration 020 — Estado 'no_asistido' en bookings
 *
 * Permite marcar un turno como "no asistido" (ausencia) una vez que ya pasó su
 * hora de inicio. Queda disponible para estadísticas de ausencias.
 *
 * Segura: agregar un valor al ENUM no afecta las filas existentes.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('bookings', 'estado', {
      type: Sequelize.ENUM('pendiente_pago', 'pendiente', 'confirmado', 'cancelado', 'rechazado', 'no_asistido'),
      defaultValue: 'confirmado',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE `bookings` SET `estado`='confirmado' WHERE `estado`='no_asistido'"
    );
    await queryInterface.changeColumn('bookings', 'estado', {
      type: Sequelize.ENUM('pendiente_pago', 'pendiente', 'confirmado', 'cancelado', 'rechazado'),
      defaultValue: 'confirmado',
    });
  },
};
