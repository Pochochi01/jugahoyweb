'use strict';
/**
 * Migration 004 — Agregar columnas de pago a complexes
 * Añade: mercadopago_token, cuentas_bancarias
 * Segura: verifica la existencia de cada columna antes de agregarla.
 *
 * Caso de uso: BD existente creada antes de integrar MercadoPago y transferencias bancarias.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('complexes');

    if (!cols.mercadopago_token) {
      await queryInterface.addColumn('complexes', 'mercadopago_token', {
        type    : Sequelize.STRING(255),
        allowNull: true,
        after   : 'activo',
      });
    }

    if (!cols.cuentas_bancarias) {
      await queryInterface.addColumn('complexes', 'cuentas_bancarias', {
        type    : Sequelize.JSON,
        allowNull: true,
        after   : 'mercadopago_token',
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('complexes');
    if (cols.cuentas_bancarias)  await queryInterface.removeColumn('complexes', 'cuentas_bancarias');
    if (cols.mercadopago_token)  await queryInterface.removeColumn('complexes', 'mercadopago_token');
  },
};
