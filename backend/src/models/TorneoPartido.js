const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Partido de zona o de llave. En la llave, el ganador avanza a
// siguiente_partido_id ocupando el lugar siguiente_slot (1 | 2).
const TorneoPartido = sequelize.define('TorneoPartido', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id:  { type: DataTypes.INTEGER, allowNull: false },
  zona_id:    { type: DataTypes.INTEGER, allowNull: true },
  ronda:      { type: DataTypes.ENUM('zona', 'octavos', 'cuartos', 'semifinal', 'final'), allowNull: false },
  orden:      { type: DataTypes.INTEGER, defaultValue: 0 },
  pareja1_id: { type: DataTypes.INTEGER, allowNull: true },
  pareja2_id: { type: DataTypes.INTEGER, allowNull: true },
  es_bye:     { type: DataTypes.BOOLEAN, defaultValue: false },
  siguiente_partido_id: { type: DataTypes.INTEGER, allowNull: true },
  siguiente_slot: { type: DataTypes.TINYINT, allowNull: true },
  field_id:   { type: DataTypes.INTEGER, allowNull: true },
  fecha:      { type: DataTypes.DATEONLY, allowNull: true },
  hora:       { type: DataTypes.STRING(5), allowNull: true },
  // true si no se encontró un horario dentro de las preferencias de ambas parejas
  fuera_preferencia: { type: DataTypes.BOOLEAN, defaultValue: false },
  estado:     { type: DataTypes.ENUM('pendiente', 'programado', 'jugado', 'walkover'), defaultValue: 'pendiente' },
}, { tableName: 'torneo_partidos' });

module.exports = TorneoPartido;
