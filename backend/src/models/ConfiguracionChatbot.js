'use strict';
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

/**
 * ConfiguracionChatbot — ajustes del chatbot por complejo (1:1 con complexes).
 *   hora_recordatorio:  'HH:mm' (hora Argentina) en que sale el pedido de
 *                       confirmación de asistencia. null = función desactivada.
 *   horas_confirmacion: plazo para responder antes de cancelar el turno.
 */
const ConfiguracionChatbot = sequelize.define('ConfiguracionChatbot', {
  id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:         { type: DataTypes.INTEGER, allowNull: false, unique: true },
  hora_recordatorio:  { type: DataTypes.STRING(5), allowNull: true, defaultValue: null },
  horas_confirmacion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
}, { tableName: 'configuracion_chatbot' });

module.exports = ConfiguracionChatbot;
