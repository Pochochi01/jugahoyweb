const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// sets: [[games pareja1, games pareja2], ...]  ej. [[6,3],[4,6],[10,7]]
const TorneoResultado = sequelize.define('TorneoResultado', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  partido_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  sets:       { type: DataTypes.JSON, allowNull: false },
  ganador_id: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'torneo_resultados' });

module.exports = TorneoResultado;
