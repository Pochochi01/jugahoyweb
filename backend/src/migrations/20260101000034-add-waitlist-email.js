'use strict';
/**
 * Migration 034 — Email en la lista de espera
 *
 * La lista de espera desde la WEB guarda también el email del usuario (además de
 * nombre y teléfono) para poder avisarle por email al liberarse un turno.
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const waitlists = await queryInterface.describeTable('waitlists');
    if (!waitlists.email) {
      await queryInterface.addColumn('waitlists', 'email', {
        type: N.STRING(150), allowNull: true, defaultValue: null,
      });
    }
    // El origen ayuda a auditar de dónde vino la inscripción (chatbot | web).
    if (!waitlists.origen) {
      await queryInterface.addColumn('waitlists', 'origen', {
        type: N.STRING(20), allowNull: false, defaultValue: 'chatbot',
      });
    }
    if (!waitlists.user_id) {
      await queryInterface.addColumn('waitlists', 'user_id', {
        type: N.INTEGER, allowNull: true, defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const waitlists = await queryInterface.describeTable('waitlists');
    if (waitlists.user_id) await queryInterface.removeColumn('waitlists', 'user_id');
    if (waitlists.origen)  await queryInterface.removeColumn('waitlists', 'origen');
    if (waitlists.email)   await queryInterface.removeColumn('waitlists', 'email');
  },
};
