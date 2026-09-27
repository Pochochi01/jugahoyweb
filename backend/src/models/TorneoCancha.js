const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Cancha (field) que el club cede al torneo, con sus franjas disponibles.
// disponibilidad_horaria: [{ fecha: 'YYYY-MM-DD' | null, desde: '09:00', hasta: '22:00' }]
// fecha null → aplica a todos los días del torneo.
const TorneoCancha = sequelize.define('TorneoCancha', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: DataTypes.INTEGER, allowNull: false },
  field_id:  { type: DataTypes.INTEGER, allowNull: false },
  disponibilidad_horaria: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, { tableName: 'torneo_canchas' });

module.exports = TorneoCancha;
