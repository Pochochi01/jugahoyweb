const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Clase concreta cargada por el profesor. Los horarios "disponibles" no se
// guardan: se calculan a partir de ProfesorCancha menos lo ocupado.
const HorarioProfesor = sequelize.define('HorarioProfesor', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  profesor_id: { type: DataTypes.INTEGER, allowNull: false },
  field_id:    { type: DataTypes.INTEGER, allowNull: false },
  fecha:       { type: DataTypes.DATEONLY, allowNull: false },
  hora_inicio: { type: DataTypes.STRING(5), allowNull: false },
  hora_fin:    { type: DataTypes.STRING(5), allowNull: false },
  estado:      { type: DataTypes.ENUM('ocupado', 'cancelado'), defaultValue: 'ocupado' },
  nota:        { type: DataTypes.STRING(255) },
}, { tableName: 'horarios_profesor' });

module.exports = HorarioProfesor;
