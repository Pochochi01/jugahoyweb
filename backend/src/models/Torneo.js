const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Torneo de pádel de un club (tenant). Categoría 1ª (mejor) a 8ª.
const Torneo = sequelize.define('Torneo', {
  id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant:          { type: DataTypes.INTEGER, allowNull: false },   // complexes.id
  nombre:             { type: DataTypes.STRING(150), allowNull: false },
  descripcion:        { type: DataTypes.TEXT },
  categoria:          { type: DataTypes.TINYINT, allowNull: false, validate: { min: 1, max: 8 } },
  genero:             { type: DataTypes.ENUM('masculino', 'femenino', 'mixto'), allowNull: false },
  // borrador → inscripcion → zonas → llaves → finalizado  (o cancelado)
  estado:             { type: DataTypes.ENUM('borrador', 'inscripcion', 'zonas', 'llaves', 'finalizado', 'cancelado'), defaultValue: 'borrador' },
  fecha_inicio:       { type: DataTypes.DATEONLY, allowNull: false },
  fecha_fin:          { type: DataTypes.DATEONLY, allowNull: false },
  cupo_parejas:       { type: DataTypes.INTEGER, defaultValue: 16 },
  precio_inscripcion: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  parejas_por_zona:   { type: DataTypes.TINYINT, defaultValue: 3 },
  clasifican_por_zona:{ type: DataTypes.TINYINT, defaultValue: 2 },
  duracion_partido:   { type: DataTypes.INTEGER, defaultValue: 90 },   // minutos
  descanso_minimo:    { type: DataTypes.INTEGER, defaultValue: 60 },   // minutos entre partidos de una pareja
  imagen_evento:      { type: DataTypes.STRING(255) },
}, { tableName: 'torneos' });

module.exports = Torneo;
