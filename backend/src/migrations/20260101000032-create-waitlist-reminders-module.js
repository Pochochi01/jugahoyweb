'use strict';
/**
 * Migration 032 — Módulo opcional "Lista de espera + Recordatorios"
 *
 *  - complexes.modulo_lista_recordatorios: habilita el módulo pago (lista de espera
 *    en el chatbot + recordatorios automáticos de turnos). Lo activa el
 *    administrador general al abonarse el extra.
 *  - bookings.recordatorio_enviado: evita reenviar el recordatorio de 2 h.
 *  - waitlists: inscripciones a lista de espera por cancha/horario/deporte ocupado.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));

    const complexes = await queryInterface.describeTable('complexes');
    if (!complexes.modulo_lista_recordatorios) {
      await queryInterface.addColumn('complexes', 'modulo_lista_recordatorios', {
        type: N.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }

    const bookings = await queryInterface.describeTable('bookings');
    if (!bookings.recordatorio_enviado) {
      await queryInterface.addColumn('bookings', 'recordatorio_enviado', {
        type: N.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }

    if (!tablas.includes('waitlists')) {
      await queryInterface.createTable('waitlists', {
        id:            { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:    { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        field_id:      { type: N.INTEGER, allowNull: true, references: { model: 'fields', key: 'id' }, onDelete: 'CASCADE' },
        deporte:       { type: N.STRING(50) },
        fecha:         { type: N.DATEONLY, allowNull: false },
        hora:          { type: N.STRING(5), allowNull: false },
        duracion:      { type: N.INTEGER, allowNull: false, defaultValue: 60 },
        nombre:        { type: N.STRING(150) },
        telefono:      { type: N.STRING(30), allowNull: false },
        estado:        { type: N.ENUM('activo', 'notificado', 'cancelado', 'convertido'), allowNull: false, defaultValue: 'activo' },
        notificado_at: { type: N.DATE, allowNull: true, defaultValue: null },
        created_at:    { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at:    { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('waitlists', ['complex_id', 'fecha', 'hora', 'estado']);
      await queryInterface.addIndex('waitlists', ['field_id', 'fecha', 'hora']);
    }
  },

  async down(queryInterface) {
    const complexes = await queryInterface.describeTable('complexes');
    if (complexes.modulo_lista_recordatorios) await queryInterface.removeColumn('complexes', 'modulo_lista_recordatorios');
    const bookings = await queryInterface.describeTable('bookings');
    if (bookings.recordatorio_enviado) await queryInterface.removeColumn('bookings', 'recordatorio_enviado');
    await queryInterface.dropTable('waitlists');
  },
};
