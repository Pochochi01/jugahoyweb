'use strict';
/**
 * Migration 026 — Límite de inasistencias por mes (configurable por complejo)
 *
 * complexes:
 *   - max_inasistencias_mes INT (default 2) → cantidad máxima de turnos "no
 *     asistidos" permitidos por usuario en un mes. Al alcanzarlo, se le niega
 *     agendar nuevos turnos. Reemplaza el límite fijo anterior de 2.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const complexes = await queryInterface.describeTable('complexes');
    if (!complexes.max_inasistencias_mes) {
      await queryInterface.addColumn('complexes', 'max_inasistencias_mes', {
        type: Sequelize.INTEGER, allowNull: false, defaultValue: 2, after: 'whatsapp_contacto',
      });
    }
  },

  async down(queryInterface) {
    const complexes = await queryInterface.describeTable('complexes');
    if (complexes.max_inasistencias_mes) {
      await queryInterface.removeColumn('complexes', 'max_inasistencias_mes');
    }
  },
};
