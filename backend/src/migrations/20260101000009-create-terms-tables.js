'use strict';
/**
 * Migration 009 — Crear tablas de Términos y Condiciones
 * Crea: terminos (versiones de T&C), terms_aceptacion (registro de aceptaciones por usuario).
 * Segura: verifica si cada tabla ya existe antes de crearla.
 *
 * Relación (ORM): terms_aceptacion.usuario_id → users.id
 * Índice único en terms_aceptacion: (usuario_id, version) — evita aceptaciones duplicadas.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    // ── terminos ───────────────────────────────────────────────────
    if (!tables.includes('terminos')) {
      await queryInterface.createTable('terminos', {
        id        : { type: Sequelize.INTEGER,        primaryKey: true, autoIncrement: true },
        version   : { type: Sequelize.STRING(20),     allowNull: false, unique: true },
        contenido : { type: Sequelize.TEXT('long'),   allowNull: false },
        activo    : { type: Sequelize.BOOLEAN,        defaultValue: true },

        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });

      await queryInterface.addIndex('terminos', ['activo'], { name: 'idx_terminos_activo' });
    }

    // ── terms_aceptacion ───────────────────────────────────────────
    if (!tables.includes('terms_aceptacion')) {
      await queryInterface.createTable('terms_aceptacion', {
        id         : { type: Sequelize.INTEGER,     primaryKey: true, autoIncrement: true },
        usuario_id : { type: Sequelize.INTEGER,     allowNull: false },
        version    : { type: Sequelize.STRING(20),  allowNull: false },
        ip         : { type: Sequelize.STRING(45),  allowNull: true  },
        user_agent : { type: Sequelize.STRING(500), allowNull: true  },

        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });

      // Evita que el mismo usuario acepte la misma versión más de una vez
      await queryInterface.addIndex('terms_aceptacion', ['usuario_id', 'version'], {
        unique: true,
        name  : 'uq_terms_aceptacion_usuario_version',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('terms_aceptacion');
    await queryInterface.dropTable('terminos');
  },
};
