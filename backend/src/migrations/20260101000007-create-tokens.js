'use strict';
/**
 * Migration 007 — Crear tabla tokens
 * Tokens de un solo uso (hash SHA-256) para: reset de contraseña, verificación de email y OTP.
 * Segura: verifica si la tabla ya existe antes de crearla.
 *
 * Relación (ORM): tokens.usuario_id → users.id
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('tokens')) return;

    await queryInterface.createTable('tokens', {
      id         : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id : { type: Sequelize.INTEGER, allowNull: false },
      token      : { type: Sequelize.STRING(255), allowNull: false, unique: true },
      tipo: {
        type: Sequelize.ENUM('reset_password', 'email_verificacion', 'otp_phone'),
        allowNull: false,
      },
      expira_en : { type: Sequelize.DATE,    allowNull: false },
      usado     : { type: Sequelize.BOOLEAN, defaultValue: false },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('tokens', ['usuario_id', 'tipo', 'usado'], { name: 'idx_tokens_usuario_tipo' });
    await queryInterface.addIndex('tokens', ['expira_en'],                    { name: 'idx_tokens_expira' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tokens');
  },
};
