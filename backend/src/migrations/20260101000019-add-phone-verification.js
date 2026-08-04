'use strict';
/**
 * Migration 019 — Verificación de teléfono por WhatsApp
 *
 * users:
 *   - phone_verified     BOOLEAN  → número validado por OTP
 *   - phone_verified_at  DATE     → cuándo se validó
 * tokens:
 *   - intentos           INT      → intentos fallidos del OTP (límite de reintentos)
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable('users');
    if (!users.phone_verified) {
      await queryInterface.addColumn('users', 'phone_verified', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false, after: 'telefono',
      });
    }
    if (!users.phone_verified_at) {
      await queryInterface.addColumn('users', 'phone_verified_at', {
        type: Sequelize.DATE, allowNull: true, defaultValue: null, after: 'phone_verified',
      });
    }

    const tokens = await queryInterface.describeTable('tokens');
    if (!tokens.intentos) {
      await queryInterface.addColumn('tokens', 'intentos', {
        type: Sequelize.INTEGER, allowNull: false, defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const users = await queryInterface.describeTable('users');
    if (users.phone_verified_at) await queryInterface.removeColumn('users', 'phone_verified_at');
    if (users.phone_verified)    await queryInterface.removeColumn('users', 'phone_verified');
    const tokens = await queryInterface.describeTable('tokens');
    if (tokens.intentos) await queryInterface.removeColumn('tokens', 'intentos');
  },
};
