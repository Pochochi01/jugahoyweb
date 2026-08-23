'use strict';
/**
 * Migration 031 — Agrega el método de pago "otros" a caja y cantina.
 *
 * cash_transactions.metodo_pago y cantina_ventas.metodo_pago pasan a aceptar
 * 'otros' (además de los métodos existentes) para poder registrar y reportar
 * ingresos/egresos por método de pago sin perder categorías.
 *
 * Idempotente: reejecutar deja la misma definición de ENUM.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    await queryInterface.changeColumn('cash_transactions', 'metodo_pago', {
      type: N.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta', 'otros'),
      defaultValue: 'efectivo',
    });
    await queryInterface.changeColumn('cantina_ventas', 'metodo_pago', {
      type: N.ENUM('efectivo', 'tarjeta', 'billetera', 'transferencia', 'mercadopago', 'otros'),
      allowNull: false,
      defaultValue: 'efectivo',
    });
  },

  async down(queryInterface, Sequelize) {
    const N = Sequelize;
    await queryInterface.changeColumn('cash_transactions', 'metodo_pago', {
      type: N.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'),
      defaultValue: 'efectivo',
    });
    await queryInterface.changeColumn('cantina_ventas', 'metodo_pago', {
      type: N.ENUM('efectivo', 'tarjeta', 'billetera', 'transferencia', 'mercadopago'),
      allowNull: false,
      defaultValue: 'efectivo',
    });
  },
};
