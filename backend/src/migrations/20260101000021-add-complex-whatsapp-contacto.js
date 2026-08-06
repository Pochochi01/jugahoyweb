'use strict';
/**
 * Migration 021 — Número de WhatsApp de contacto de la cancha
 *
 * complexes:
 *   - whatsapp_contacto VARCHAR(20) → número al que apunta el botón
 *     "Comunicate con la cancha" del chatbot. Formato: +549 + área (sin 0) +
 *     número (sin 15). NULL = sin botón de contacto.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const complexes = await queryInterface.describeTable('complexes');
    if (!complexes.whatsapp_contacto) {
      await queryInterface.addColumn('complexes', 'whatsapp_contacto', {
        type: Sequelize.STRING(20), allowNull: true, defaultValue: null, after: 'telefono',
      });
    }
  },

  async down(queryInterface) {
    const complexes = await queryInterface.describeTable('complexes');
    if (complexes.whatsapp_contacto) {
      await queryInterface.removeColumn('complexes', 'whatsapp_contacto');
    }
  },
};
