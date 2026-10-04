'use strict';
/**
 * Migration 047 — Teléfonos propios por entidad (WhatsApp Web vía Baileys)
 *
 *  entity_phones          un teléfono por entidad (torneo, escuela o profesor) de un tenant.
 *      UNIQUE(tenant_id, entity_type, entity_id) → cada entidad tiene UNA fila (un teléfono activo).
 *      phone_number UNIQUE (NULL mientras no está vinculado) → un mismo número no puede estar
 *        vinculado a dos entidades a la vez (en ningún tenant).
 *      baileys_session        credenciales + claves de la sesión (JSON con BufferJSON), cifradas.
 *  entity_phone_mensajes  registro de cada mensaje enviado desde un teléfono de entidad
 *      (auditoría: desde qué número, a quién, quién lo mandó, resultado).
 * Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    if (!tablas.includes('entity_phones')) {
      await queryInterface.createTable('entity_phones', {
        id:              { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        tenant_id:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        entity_type:     { type: Sequelize.ENUM('torneo', 'escuela', 'profesor'), allowNull: false },
        entity_id:       { type: Sequelize.INTEGER, allowNull: false },
        phone_number:    { type: Sequelize.STRING(20), allowNull: true },
        ultimo_numero:   { type: Sequelize.STRING(20), allowNull: true },
        baileys_session: { type: Sequelize.TEXT('long'), allowNull: true },
        estado:          { type: Sequelize.ENUM('desconectado', 'esperando_qr', 'conectado'), allowNull: false, defaultValue: 'desconectado' },
        vinculado_por:   { type: Sequelize.STRING(150), allowNull: true },
        vinculado_at:    { type: Sequelize.DATE, allowNull: true },
        ultimo_error:    { type: Sequelize.STRING(255), allowNull: true },
        ...ts,
      });
      await queryInterface.addIndex('entity_phones', ['tenant_id', 'entity_type', 'entity_id'], { unique: true, name: 'entity_phones_entidad_unica' });
      await queryInterface.addIndex('entity_phones', ['phone_number'], { unique: true, name: 'entity_phones_numero_unico' });
    }
    if (!tablas.includes('entity_phone_mensajes')) {
      await queryInterface.createTable('entity_phone_mensajes', {
        id:                  { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        entity_phone_id:     { type: Sequelize.INTEGER, allowNull: false, references: { model: 'entity_phones', key: 'id' }, onDelete: 'CASCADE' },
        tenant_id:           { type: Sequelize.INTEGER, allowNull: false },
        entity_type:         { type: Sequelize.ENUM('torneo', 'escuela', 'profesor'), allowNull: false },
        entity_id:           { type: Sequelize.INTEGER, allowNull: false },
        envio_id:            { type: Sequelize.STRING(36), allowNull: false },
        desde_numero:        { type: Sequelize.STRING(20), allowNull: false },
        destino:             { type: Sequelize.STRING(20), allowNull: false },
        destinatario_nombre: { type: Sequelize.STRING(150), allowNull: true },
        mensaje:             { type: Sequelize.TEXT, allowNull: false },
        estado:              { type: Sequelize.ENUM('pendiente', 'enviado', 'error'), allowNull: false, defaultValue: 'pendiente' },
        error:               { type: Sequelize.STRING(255), allowNull: true },
        enviado_por:         { type: Sequelize.STRING(150), allowNull: true },
        ...ts,
      });
      await queryInterface.addIndex('entity_phone_mensajes', ['envio_id']);
      await queryInterface.addIndex('entity_phone_mensajes', ['tenant_id', 'entity_type', 'entity_id']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('entity_phone_mensajes').catch(() => {});
    await queryInterface.dropTable('entity_phones').catch(() => {});
  },
};
