'use strict';
/**
 * Migration 025 — WhatsApp de contacto por cancha
 *
 * fields:
 *   - whatsapp_contacto VARCHAR(20) → número de WhatsApp propio de la cancha.
 *     Si es NULL, se usa el del complejo (complexes.whatsapp_contacto).
 *     Formato: +549 + área (sin 0) + número (sin 15).
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const fields = await queryInterface.describeTable('fields');
    if (!fields.whatsapp_contacto) {
      await queryInterface.addColumn('fields', 'whatsapp_contacto', {
        type: Sequelize.STRING(20), allowNull: true, defaultValue: null, after: 'identificador',
      });
    }
  },

  async down(queryInterface) {
    const fields = await queryInterface.describeTable('fields');
    if (fields.whatsapp_contacto) {
      await queryInterface.removeColumn('fields', 'whatsapp_contacto');
    }
  },
};
