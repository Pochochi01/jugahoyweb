const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Alumno de una clase (una clase puede tener varios alumnos).
const Alumno = sequelize.define('Alumno', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_horario: { type: DataTypes.INTEGER, allowNull: false },
  nombre:     { type: DataTypes.STRING(150), allowNull: false },
  celular:    { type: DataTypes.STRING(30), allowNull: false },
}, { tableName: 'alumnos' });

module.exports = Alumno;
