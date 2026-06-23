'use strict';
/**
 * Migration 008 — Crear tabla contacts
 * Mensajes de contacto recibidos desde el formulario público del sitio.
 * Segura: verifica si la tabla ya existe antes de crearla.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('contacts')) return;

    await queryInterface.createTable('contacts', {
      id        : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      nombre    : { type: Sequelize.STRING(100), allowNull: false },
      email     : { type: Sequelize.STRING(150), allowNull: false },
      telefono  : { type: Sequelize.STRING(25),  allowNull: true  },
      asunto    : { type: Sequelize.STRING(200), allowNull: true  },
      mensaje   : { type: Sequelize.TEXT,        allowNull: false },
      ip_origen : { type: Sequelize.STRING(45),  allowNull: true  },
      leido     : { type: Sequelize.BOOLEAN,     defaultValue: false },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('contacts', ['leido'], { name: 'idx_contacts_leido' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contacts');
  },
};
