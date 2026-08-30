'use strict';
/**
 * Migration 033 — Ventana de 24 h de WhatsApp + plantillas de Meta
 *
 *  - wa_conversations: guarda la fecha/hora del último mensaje ENTRANTE del cliente
 *    por complejo+teléfono. Define si la "ventana de servicio" de 24 h sigue abierta
 *    (dentro → texto libre; fuera → plantilla aprobada por Meta).
 *  - wa_templates: plantillas aprobadas en Meta configuradas por tipo de recordatorio
 *    (recordatorio_turno, lista_espera, confirmacion), para elegir la correcta según
 *    el tipo de mensaje.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));

    if (!tablas.includes('wa_conversations')) {
      await queryInterface.createTable('wa_conversations', {
        id:              { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:      { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        telefono:        { type: N.STRING(30), allowNull: false },   // últimos 10 dígitos, formato-agnóstico
        last_inbound_at: { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        created_at:      { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at:      { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('wa_conversations', ['complex_id', 'telefono'], { unique: true, name: 'uq_wa_conv_complex_tel' });
    }

    if (!tablas.includes('wa_templates')) {
      await queryInterface.createTable('wa_templates', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id: { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        tipo:       { type: N.ENUM('recordatorio_turno', 'lista_espera', 'confirmacion'), allowNull: false },
        nombre:     { type: N.STRING(150), allowNull: false },   // nombre de la plantilla aprobada en Meta
        idioma:     { type: N.STRING(10), allowNull: false, defaultValue: 'es_AR' },
        activo:     { type: N.BOOLEAN, allowNull: false, defaultValue: true },
        params:     { type: N.JSON, allowNull: true },           // notas/orden de variables (opcional)
        created_at: { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at: { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('wa_templates', ['complex_id', 'tipo'], { unique: true, name: 'uq_wa_tpl_complex_tipo' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('wa_templates');
    await queryInterface.dropTable('wa_conversations');
  },
};
