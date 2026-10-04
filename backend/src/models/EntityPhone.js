const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TIPOS = ['torneo', 'escuela', 'profesor'];

/**
 * Teléfono propio de una entidad (torneo, escuela o profesor), vinculado por QR
 * con WhatsApp Web (Baileys). Una fila por entidad; phone_number es único
 * mientras está vinculado (NULL si no). La sesión se guarda cifrada.
 */
const EntityPhone = sequelize.define('EntityPhone', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:       { type: DataTypes.INTEGER, allowNull: false },   // complexes.id
  entity_type:     { type: DataTypes.ENUM(...TIPOS), allowNull: false },
  entity_id:       { type: DataTypes.INTEGER, allowNull: false },
  phone_number:    { type: DataTypes.STRING(20), allowNull: true, unique: true },
  ultimo_numero:   { type: DataTypes.STRING(20) },
  baileys_session: { type: DataTypes.TEXT('long') },
  estado:          { type: DataTypes.ENUM('desconectado', 'esperando_qr', 'conectado'), defaultValue: 'desconectado' },
  vinculado_por:   { type: DataTypes.STRING(150) },
  vinculado_at:    { type: DataTypes.DATE },
  ultimo_error:    { type: DataTypes.STRING(255) },
}, {
  tableName: 'entity_phones',
  // La sesión nunca sale en las respuestas por defecto
  defaultScope: { attributes: { exclude: ['baileys_session'] } },
  scopes: { conSesion: { attributes: { include: ['baileys_session'] } } },
});

// Registro de cada mensaje enviado desde un teléfono de entidad (auditoría).
const EntityPhoneMensaje = sequelize.define('EntityPhoneMensaje', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entity_phone_id:     { type: DataTypes.INTEGER, allowNull: false },
  tenant_id:           { type: DataTypes.INTEGER, allowNull: false },
  entity_type:         { type: DataTypes.ENUM(...TIPOS), allowNull: false },
  entity_id:           { type: DataTypes.INTEGER, allowNull: false },
  envio_id:            { type: DataTypes.STRING(36), allowNull: false },
  desde_numero:        { type: DataTypes.STRING(20), allowNull: false },
  destino:             { type: DataTypes.STRING(20), allowNull: false },
  destinatario_nombre: { type: DataTypes.STRING(150) },
  mensaje:             { type: DataTypes.TEXT, allowNull: false },
  estado:              { type: DataTypes.ENUM('pendiente', 'enviado', 'error'), defaultValue: 'pendiente' },
  error:               { type: DataTypes.STRING(255) },
  enviado_por:         { type: DataTypes.STRING(150) },
}, { tableName: 'entity_phone_mensajes' });

module.exports = { EntityPhone, EntityPhoneMensaje, TIPOS_ENTIDAD: TIPOS };
