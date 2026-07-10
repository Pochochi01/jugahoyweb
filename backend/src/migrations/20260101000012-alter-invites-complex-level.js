'use strict';
/**
 * Migration 012 — Invites a nivel complejo y sin vencimiento
 *
 * Cambios:
 *   - invites.field_id   → nullable (el invite ya no apunta a una cancha específica)
 *   - invites.expires_at → nullable (el link no vence)
 *
 * Segura / idempotente: solo modifica si la columna existe y aún es NOT NULL.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('invites');

    if (cols.field_id && cols.field_id.allowNull === false) {
      await queryInterface.changeColumn('invites', 'field_id', {
        type        : Sequelize.INTEGER,
        allowNull   : true,
        defaultValue: null,
      });
    }

    if (cols.expires_at && cols.expires_at.allowNull === false) {
      await queryInterface.changeColumn('invites', 'expires_at', {
        type        : Sequelize.DATE,
        allowNull   : true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Revertir a NOT NULL. Nota: filas con NULL impedirían el revert; se rellenan
    // con valores por defecto antes de re-endurecer las columnas.
    await queryInterface.sequelize.query(
      "UPDATE `invites` SET `field_id` = 0 WHERE `field_id` IS NULL"
    );
    await queryInterface.sequelize.query(
      "UPDATE `invites` SET `expires_at` = NOW() WHERE `expires_at` IS NULL"
    );

    await queryInterface.changeColumn('invites', 'field_id', {
      type     : Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.changeColumn('invites', 'expires_at', {
      type     : Sequelize.DATE,
      allowNull: false,
    });
  },
};
