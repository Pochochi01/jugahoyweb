const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Plantilla de Meta configurada por tipo de recordatorio (aprobada en Business Manager).
const WaTemplate = sequelize.define('WaTemplate', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo:       { type: DataTypes.ENUM('recordatorio_turno', 'lista_espera', 'confirmacion'), allowNull: false },
  nombre:     { type: DataTypes.STRING(150), allowNull: false },   // nombre exacto de la plantilla en Meta
  idioma:     { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'es_AR' },
  activo:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  params:     { type: DataTypes.JSON, allowNull: true },
}, { tableName: 'wa_templates' });

module.exports = WaTemplate;
