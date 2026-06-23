'use strict';
/**
 * Migration 002 — Agregar columnas OAuth a users
 * Añade: google_id, avatar_url
 * Segura: verifica la existencia de cada columna antes de agregarla.
 *
 * Caso de uso: BD existente creada antes de integrar Google OAuth.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('users');

    if (!cols.google_id) {
      await queryInterface.addColumn('users', 'google_id', {
        type        : Sequelize.STRING(120),
        allowNull   : true,
        defaultValue: null,
        after       : 'telefono',
      });
    }

    if (!cols.avatar_url) {
      await queryInterface.addColumn('users', 'avatar_url', {
        type        : Sequelize.STRING(500),
        allowNull   : true,
        defaultValue: null,
        after       : 'google_id',
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('users');
    if (cols.avatar_url) await queryInterface.removeColumn('users', 'avatar_url');
    if (cols.google_id)  await queryInterface.removeColumn('users', 'google_id');
  },
};
