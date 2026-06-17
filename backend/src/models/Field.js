const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Field = sequelize.define('Field', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:  { type: DataTypes.INTEGER, allowNull: false },
  nombre:      { type: DataTypes.STRING(100), allowNull: false },
  deporte: {
    type: DataTypes.ENUM('futbol', 'padel', 'tenis', 'basquet', 'voley', 'otro'),
    allowNull: false,
  },
  piso:        { type: DataTypes.ENUM('cesped_sintetico', 'cemento', 'parquet', 'tierra', 'otro') },
  dimensiones: { type: DataTypes.STRING(50) },
  duracion_turno: { type: DataTypes.INTEGER, defaultValue: 60 },
  duraciones_permitidas: { type: DataTypes.JSON, defaultValue: [60] },
  precios_por_duracion:  { type: DataTypes.JSON, defaultValue: {} },
  techada:     { type: DataTypes.BOOLEAN, defaultValue: false },
  precio_base: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  activa:      { type: DataTypes.BOOLEAN, defaultValue: true },
  hora_apertura: { type: DataTypes.STRING(5), defaultValue: '08:00' },
  hora_cierre:   { type: DataTypes.STRING(5), defaultValue: '02:00' },
  imagen_url:  { type: DataTypes.STRING(255) },
}, { tableName: 'fields' });

module.exports = Field;
