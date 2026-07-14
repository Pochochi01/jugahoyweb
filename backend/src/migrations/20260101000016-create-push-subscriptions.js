'use strict';
/**
 * Migration 016 — Crear tabla push_subscriptions
 * Suscripciones Web Push de usuarios (player o admin) para notificaciones PWA.
 *
 * Integridad:
 *   - FK user_id → users(id) ON DELETE CASCADE
 *   - endpoint único (identifica navegador/dispositivo)
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(t => t.toLowerCase()).includes('push_subscriptions')) return;

    await queryInterface.createTable('push_subscriptions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      endpoint: { type: Sequelize.TEXT, allowNull: false },
      keys:     { type: Sequelize.JSON, allowNull: false },  // { p256dh, auth }
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // endpoint es TEXT → índice único sobre los primeros 255 chars (suficiente para unicidad práctica)
    await queryInterface.addIndex('push_subscriptions', [{ name: 'endpoint', length: 255 }],
      { unique: true, name: 'uq_push_endpoint' });
    await queryInterface.addIndex('push_subscriptions', ['user_id'], { name: 'idx_push_user' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('push_subscriptions');
  },
};
