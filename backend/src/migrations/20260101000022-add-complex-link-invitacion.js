'use strict';
/**
 * Migration 022 — Link de invitación del complejo
 *
 * complexes:
 *   - link_invitacion VARCHAR(500) → URL a la que apunta el botón "Ver la web"
 *     del chatbot. Si está vacío, el chatbot usa la home por defecto.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const complexes = await queryInterface.describeTable('complexes');
    if (!complexes.link_invitacion) {
      await queryInterface.addColumn('complexes', 'link_invitacion', {
        type: Sequelize.STRING(500), allowNull: true, defaultValue: null, after: 'whatsapp_contacto',
      });
    }
  },

  async down(queryInterface) {
    const complexes = await queryInterface.describeTable('complexes');
    if (complexes.link_invitacion) {
      await queryInterface.removeColumn('complexes', 'link_invitacion');
    }
  },
};
