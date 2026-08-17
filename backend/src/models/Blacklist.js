const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Lista de incumplidos por reiteradas inasistencias (por complejo).
const Blacklist = sequelize.define('Blacklist', {
  id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:        { type: DataTypes.INTEGER, allowNull: false },
  tel_key:           { type: DataTypes.STRING(10) },   // últimos 10 dígitos del teléfono
  telefono:          { type: DataTypes.STRING(30) },
  user_id:           { type: DataTypes.INTEGER, allowNull: true },
  nombre:            { type: DataTypes.STRING(150) },
  activo:            { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  habilitado_manual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  motivo_salida:     { type: DataTypes.STRING(20), allowNull: true },
}, { tableName: 'blacklist' });

module.exports = Blacklist;
