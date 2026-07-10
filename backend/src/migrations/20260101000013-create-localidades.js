'use strict';
/**
 * Migration 013 — Crear tabla localidades
 * Catálogo de localidades censales de Argentina (provincia / departamento / localidad).
 * Segura: verifica si la tabla ya existe antes de crearla.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    // showAllTables puede devolver nombres con distinto casing según el motor
    if (tables.map(t => t.toLowerCase()).includes('localidades')) return;

    await queryInterface.createTable('localidades', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      provincia_nombre:    { type: Sequelize.STRING(150), allowNull: false },
      departamento_nombre: { type: Sequelize.STRING(150), allowNull: true, defaultValue: null },
      localidad_nombre:    { type: Sequelize.STRING(150), allowNull: false },
    });

    // Índices para búsquedas en cascada provincia → departamento → localidad
    await queryInterface.addIndex('localidades', ['provincia_nombre'],
      { name: 'idx_localidades_provincia' });
    await queryInterface.addIndex('localidades', ['provincia_nombre', 'departamento_nombre'],
      { name: 'idx_localidades_prov_depto' });
    await queryInterface.addIndex('localidades', ['localidad_nombre'],
      { name: 'idx_localidades_localidad' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('localidades');
  },
};
