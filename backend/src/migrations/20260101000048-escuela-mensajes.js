'use strict';
/**
 * Migration 048 — Mensajes de la escuela a los padres (borradores editables + envío masivo)
 *
 *  escuela_mensajes   un mensaje por tipo ('suspension' | 'normal' | 'recordatorio_pago' | 'recibo'),
 *      editable mientras está en borrador. Al enviarse sale personalizado por alumno
 *      ({alumno}, {categoria}, {monto}, {comprobante}…) desde el WhatsApp vinculado a la
 *      escuela (entity_phones) y queda atado al envío (envio_id → entity_phone_mensajes).
 *
 * La relación alumno → teléfono ya existe: escuela_alumnos.responsable_whatsapp.
 * Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    if (tablas.includes('escuela_mensajes')) return;
    await queryInterface.createTable('escuela_mensajes', {
      id:                  { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      tenant_id:           { type: Sequelize.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
      escuela_id:          { type: Sequelize.INTEGER, allowNull: false, references: { model: 'escuelas', key: 'id' }, onDelete: 'CASCADE' },
      tipo:                { type: Sequelize.ENUM('suspension', 'normal', 'recordatorio_pago', 'recibo'), allowNull: false },
      contenido:           { type: Sequelize.TEXT, allowNull: false },
      categoria_id:        { type: Sequelize.INTEGER, allowNull: true },     // null = toda la escuela
      periodo:             { type: Sequelize.STRING(7), allowNull: true },   // YYYY-MM (cuotas / recibos)
      fecha:               { type: Sequelize.DATEONLY, allowNull: true },    // día de la clase (suspensión / normal)
      estado:              { type: Sequelize.ENUM('borrador', 'enviado'), allowNull: false, defaultValue: 'borrador' },
      envio_id:            { type: Sequelize.STRING(36), allowNull: true },
      total_destinatarios: { type: Sequelize.INTEGER, allowNull: true },
      creado_por:          { type: Sequelize.STRING(150), allowNull: true },
      enviado_por:         { type: Sequelize.STRING(150), allowNull: true },
      enviado_at:          { type: Sequelize.DATE, allowNull: true },
      created_at:          { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:          { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('escuela_mensajes', ['tenant_id', 'escuela_id']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('escuela_mensajes').catch(() => {});
  },
};
