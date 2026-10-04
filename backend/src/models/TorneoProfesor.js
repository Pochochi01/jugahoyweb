const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Profesor asignado a un torneo (coordinador, árbitro, etc.). Mismo complejo que el torneo.
const TorneoProfesor = sequelize.define('TorneoProfesor', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id:   { type: DataTypes.INTEGER, allowNull: false },
  profesor_id: { type: DataTypes.INTEGER, allowNull: false },
  rol:         { type: DataTypes.STRING(40) },
}, { tableName: 'torneo_profesores' });

module.exports = TorneoProfesor;
