const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TorneoZona = sequelize.define('TorneoZona', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: DataTypes.INTEGER, allowNull: false },
  categoria_id: { type: DataTypes.TINYINT, allowNull: true },
  nombre:    { type: DataTypes.STRING(30), allowNull: false },   // "Zona A"
  // Relámpago todos contra todos: pareja sorteada de la zona de 5 y auditoría del sorteo
  // { semilla, candidatos, pareja_sorteada_id, rival_id, cruces_excluidos, fecha, usuario }
  pareja_sorteada_id: { type: DataTypes.INTEGER, allowNull: true },
  sorteo:    { type: DataTypes.JSON, allowNull: true },
}, { tableName: 'torneo_zonas' });

module.exports = TorneoZona;
