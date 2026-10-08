'use strict';
/**
 * Migration 049 — Links de invitación legibles (/invite/<nombre-del-complejo>)
 *   invites.token VARCHAR(36) → VARCHAR(80): ahora puede ser el slug del complejo.
 *   Los tokens UUID existentes siguen siendo válidos (links ya compartidos).
 * Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.describeTable('invites');
    if (!/varchar\(80\)/i.test(t.token.type)) {
      await queryInterface.changeColumn('invites', 'token', { type: Sequelize.STRING(80), allowNull: false });
    }
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('invites', 'token', { type: Sequelize.STRING(36), allowNull: false }).catch(() => {});
  },
};
