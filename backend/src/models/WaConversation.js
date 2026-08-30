const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Último mensaje ENTRANTE del cliente por complejo+teléfono (ventana de 24 h).
const WaConversation = sequelize.define('WaConversation', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:      { type: DataTypes.INTEGER, allowNull: false },
  telefono:        { type: DataTypes.STRING(30), allowNull: false },   // últimos 10 dígitos
  last_inbound_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'wa_conversations' });

module.exports = WaConversation;
