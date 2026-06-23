'use strict';
/**
 * Migration 003 — Agregar columnas de scheduling avanzado a fields
 * Añade: duraciones_permitidas, precios_por_duracion, hora_apertura, hora_cierre, imagen_url
 * Segura: verifica la existencia de cada columna antes de agregarla.
 *
 * Caso de uso: BD existente creada cuando fields solo tenía duracion_turno y precio_base.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('fields');

    if (!cols.duraciones_permitidas) {
      await queryInterface.addColumn('fields', 'duraciones_permitidas', {
        type        : Sequelize.JSON,
        allowNull   : true,
        defaultValue: [60],
        after       : 'duracion_turno',
      });
    }

    if (!cols.precios_por_duracion) {
      await queryInterface.addColumn('fields', 'precios_por_duracion', {
        type        : Sequelize.JSON,
        allowNull   : true,
        defaultValue: {},
        after       : 'duraciones_permitidas',
      });
    }

    if (!cols.hora_apertura) {
      await queryInterface.addColumn('fields', 'hora_apertura', {
        type        : Sequelize.STRING(5),
        allowNull   : true,
        defaultValue: '08:00',
        after       : 'activa',
      });
    }

    if (!cols.hora_cierre) {
      await queryInterface.addColumn('fields', 'hora_cierre', {
        type        : Sequelize.STRING(5),
        allowNull   : true,
        defaultValue: '02:00',
        after       : 'hora_apertura',
      });
    }

    if (!cols.imagen_url) {
      await queryInterface.addColumn('fields', 'imagen_url', {
        type    : Sequelize.STRING(255),
        allowNull: true,
        after   : 'hora_cierre',
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('fields');
    const toRemove = ['imagen_url', 'hora_cierre', 'hora_apertura', 'precios_por_duracion', 'duraciones_permitidas'];
    for (const col of toRemove) {
      if (cols[col]) await queryInterface.removeColumn('fields', col);
    }
  },
};
