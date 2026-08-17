'use strict';
/**
 * Migration 027 — Lista de incumplidos (blacklist por inasistencias)
 *
 * Un jugador entra a la lista de un complejo cuando alcanza el máximo de turnos
 * "no asistido" en 30 días. Sale por decisión del complex_admin (habilitado_manual)
 * o automáticamente (30 días sin nuevas faltas + 2 turnos asistidos).
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const exists = tables.map(t => (typeof t === 'string' ? t : t.tableName)).includes('blacklist');
    if (exists) return;

    await queryInterface.createTable('blacklist', {
      id:                { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      complex_id:        { type: Sequelize.INTEGER, allowNull: false },
      tel_key:           { type: Sequelize.STRING(10) },   // últimos 10 dígitos (match formato-agnóstico)
      telefono:          { type: Sequelize.STRING(30) },   // teléfono para mostrar
      user_id:           { type: Sequelize.INTEGER, allowNull: true },
      nombre:            { type: Sequelize.STRING(150) },
      activo:            { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      habilitado_manual: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      motivo_salida:     { type: Sequelize.STRING(20), allowNull: true }, // 'manual' | 'auto' | 'correccion'
      created_at:        { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at:        { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('blacklist', ['complex_id', 'tel_key']);
    await queryInterface.addIndex('blacklist', ['complex_id', 'activo']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blacklist');
  },
};
