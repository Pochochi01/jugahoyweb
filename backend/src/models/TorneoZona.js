const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TorneoZona = sequelize.define('TorneoZona', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: DataTypes.INTEGER, allowNull: false },
  nombre:    { type: DataTypes.STRING(30), allowNull: false },   // "Zona A"
}, { tableName: 'torneo_zonas' });

module.exports = TorneoZona;
