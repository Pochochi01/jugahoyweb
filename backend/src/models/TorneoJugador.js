const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TorneoJugador = sequelize.define('TorneoJugador', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pareja_id: { type: DataTypes.INTEGER, allowNull: false },
  jugador_id: { type: DataTypes.INTEGER, allowNull: true },   // padel_jugadores (registro único del club)
  // Puntaje manual en las posiciones del torneo (NULL = el calculado por los partidos)
  puntos_manual: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  nombre:    { type: DataTypes.STRING(150), allowNull: false },
  dni:       { type: DataTypes.STRING(15), allowNull: false },
  whatsapp:  { type: DataTypes.STRING(30), allowNull: false },
  email:     { type: DataTypes.STRING(150) },
  categoria: { type: DataTypes.TINYINT, allowNull: false, validate: { min: 1, max: 8 } },
  genero:    { type: DataTypes.ENUM('masculino', 'femenino'), allowNull: false },
}, { tableName: 'torneo_jugadores' });

module.exports = TorneoJugador;
