'use strict';
/**
 * Migration 045 — Opciones de pago por complejo (MercadoPago conectado por OAuth)
 *
 *  complexes.default_payment_option  'complejo' | 'seña' | 'total'
 *      Modalidad preseleccionada para TODAS las canchas del complejo (web, panel y
 *      chatbot). Las tres opciones se ofrecen siempre que haya MercadoPago conectado.
 *  complexes.sena_porcentaje         % del turno que se cobra como seña cuando la
 *      cancha no tiene un monto de seña propio (fields.sena_monto). Así la seña
 *      queda disponible en todas las canchas.
 *  bookings.pago_online_en_caja      el pago online (seña/total) ya se registró en
 *      la caja → al cobrar en el complejo no se vuelve a contar.
 *
 * bookings.tipo_pago ENUM('seña','total','complejo') ya existe (migración 015).
 * Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cx = await queryInterface.describeTable('complexes');
    if (!cx.default_payment_option) {
      await queryInterface.addColumn('complexes', 'default_payment_option', {
        type: Sequelize.ENUM('complejo', 'seña', 'total'), allowNull: false, defaultValue: 'complejo',
      });
    }
    if (!cx.sena_porcentaje) {
      await queryInterface.addColumn('complexes', 'sena_porcentaje', { type: Sequelize.DECIMAL(5, 2), allowNull: true, defaultValue: null });
    }
    const bk = await queryInterface.describeTable('bookings');
    if (!bk.pago_online_en_caja) {
      await queryInterface.addColumn('bookings', 'pago_online_en_caja', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bookings', 'pago_online_en_caja').catch(() => {});
    await queryInterface.removeColumn('complexes', 'sena_porcentaje').catch(() => {});
    await queryInterface.removeColumn('complexes', 'default_payment_option').catch(() => {});
  },
};
