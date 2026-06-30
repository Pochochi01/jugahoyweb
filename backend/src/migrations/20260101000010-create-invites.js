'use strict';
/**
 * Migration 010 — Crear tabla invites
 * Links de invitación para que un player acceda directamente a una cancha específica.
 * Segura: verifica si la tabla ya existe antes de crearla.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('invites')) return;

    await queryInterface.createTable('invites', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      token:      { type: Sequelize.STRING(36), allowNull: false, unique: true },
      complex_id: { type: Sequelize.INTEGER,   allowNull: false },
      field_id:   { type: Sequelize.INTEGER,   allowNull: false },
      created_by: { type: Sequelize.INTEGER,   allowNull: false },
      player_id:  { type: Sequelize.INTEGER,   allowNull: true,  defaultValue: null },
      expires_at: { type: Sequelize.DATE,      allowNull: false },
      usado:      { type: Sequelize.BOOLEAN,   defaultValue: false },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('invites', ['token'],      { name: 'idx_invites_token' });
    await queryInterface.addIndex('invites', ['complex_id'], { name: 'idx_invites_complex' });
    await queryInterface.addIndex('invites', ['field_id'],   { name: 'idx_invites_field' });
    await queryInterface.addIndex('invites', ['expires_at'], { name: 'idx_invites_expires' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invites');
  },
};
