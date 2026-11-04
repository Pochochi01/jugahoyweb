'use strict';
/** Portal de Jugador: suscripciones Web Push por DNI (los jugadores no tienen cuenta en `users`). */
module.exports = {
  async up(qi, S) {
    if ((await qi.showAllTables()).includes('player_push_subscriptions')) return;
    await qi.createTable('player_push_subscriptions', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      dni: { type: S.STRING(20), allowNull: false },
      endpoint: { type: S.TEXT, allowNull: false },
      keys: { type: S.JSON, allowNull: false },
      user_agent: { type: S.STRING(255), allowNull: true },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
    });
    await qi.sequelize.query('CREATE UNIQUE INDEX uq_player_push_endpoint ON player_push_subscriptions (endpoint(255))');
    await qi.addIndex('player_push_subscriptions', ['dni'], { name: 'idx_player_push_dni' });
  },
  async down(qi) { await qi.dropTable('player_push_subscriptions').catch(() => {}); },
};
