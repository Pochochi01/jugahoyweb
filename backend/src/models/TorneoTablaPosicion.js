const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Tabla de posiciones persistida por zona. La recalcula torneoService
// (recalcularTablaZona) cada vez que se carga, corrige o borra un resultado.
const TorneoTablaPosicion = sequelize.define('TorneoTablaPosicion', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id:  { type: DataTypes.INTEGER, allowNull: false },
  zona_id:    { type: DataTypes.INTEGER, allowNull: false },
  pareja_id:  { type: DataTypes.INTEGER, allowNull: false },
  posicion:   { type: DataTypes.TINYINT, allowNull: false },
  pj:         { type: DataTypes.TINYINT, defaultValue: 0 },
  pg:         { type: DataTypes.TINYINT, defaultValue: 0 },
  pp:         { type: DataTypes.TINYINT, defaultValue: 0 },
  puntos:           { type: DataTypes.INTEGER, defaultValue: 0 },
  sets_favor:       { type: DataTypes.INTEGER, defaultValue: 0 },
  sets_contra:      { type: DataTypes.INTEGER, defaultValue: 0 },
  games_favor:      { type: DataTypes.INTEGER, defaultValue: 0 },
  games_contra:     { type: DataTypes.INTEGER, defaultValue: 0 },
  diferencia_sets:  { type: DataTypes.INTEGER, defaultValue: 0 },
  diferencia_games: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'torneo_tabla_posiciones' });

module.exports = TorneoTablaPosicion;
