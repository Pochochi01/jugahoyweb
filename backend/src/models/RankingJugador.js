const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ranking anual del club: puntos de cada jugador (por DNI) en una categoría y
// género de circuito, para una temporada. Se suma al finalizar cada torneo
// 'anual' y el organizador puede ajustarlo a mano.
const RankingJugador = sequelize.define('RankingJugador', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: DataTypes.INTEGER, allowNull: false },
  dni:       { type: DataTypes.STRING(15), allowNull: false },
  nombre:    { type: DataTypes.STRING(150), allowNull: false },
  categoria: { type: DataTypes.TINYINT, allowNull: false },
  genero:    { type: DataTypes.ENUM('masculino', 'femenino', 'mixto'), allowNull: false },
  temporada: { type: DataTypes.SMALLINT, allowNull: false },
  puntos:    { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'ranking_jugadores' });

module.exports = RankingJugador;
