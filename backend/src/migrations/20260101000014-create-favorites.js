'use strict';
/**
 * Migration 014 — Crear tabla favorites
 * Relación N:N player ↔ complejo (complejos favoritos del jugador).
 *
 * Integridad:
 *   - FK player_id  → users(id)     ON DELETE CASCADE
 *   - FK complex_id → complexes(id) ON DELETE CASCADE
 *   - Índice único (player_id, complex_id) → sin duplicados
 *
 * Segura / idempotente: verifica existencia de la tabla antes de crearla.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(t => t.toLowerCase()).includes('favorites')) return;

    await queryInterface.createTable('favorites', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      player_id:  {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      complex_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'complexes', key: 'id' },
        onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('favorites', ['player_id', 'complex_id'],
      { unique: true, name: 'uq_favorites_player_complex' });
    await queryInterface.addIndex('favorites', ['player_id'],
      { name: 'idx_favorites_player' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('favorites');
  },
};
