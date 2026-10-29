const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Catálogo configurable de módulos que pueden usar un número de WhatsApp del club.
// Un módulo nuevo = una fila nueva (ver services/whatsappModulos.service.js).
const WhatsappModulo = sequelize.define('WhatsappModulo', {
  clave:                  { type: DataTypes.STRING(30), primaryKey: true },
  nombre:                 { type: DataTypes.STRING(60), allowNull: false },
  descripcion:            { type: DataTypes.STRING(255) },
  habilitado_por_defecto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // automatico = puede usar el número del club · manual = solo WhatsApp del dispositivo
  canal:                  { type: DataTypes.ENUM('automatico', 'manual'), allowNull: false, defaultValue: 'automatico' },
  orden:                  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  activo:                 { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'whatsapp_modulos' });

module.exports = WhatsappModulo;
