const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ventana semanal habilitada por el admin para que el profesor dé clases:
// cancha + día de la semana (0 = domingo) + franja horaria.
const ProfesorCancha = sequelize.define('ProfesorCancha', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  profesor_id: { type: DataTypes.INTEGER, allowNull: false },
  field_id:    { type: DataTypes.INTEGER, allowNull: false },
  dia_semana:  { type: DataTypes.TINYINT, allowNull: false, validate: { min: 0, max: 6 } },
  hora_desde:  { type: DataTypes.STRING(5), allowNull: false },
  hora_hasta:  { type: DataTypes.STRING(5), allowNull: false },
}, { tableName: 'profesor_canchas' });

module.exports = ProfesorCancha;
