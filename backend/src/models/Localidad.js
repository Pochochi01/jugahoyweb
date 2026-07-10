'use strict';
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

/**
 * Localidad — catálogo de localidades censales de Argentina (fuente: INDEC / Georef).
 * Tabla de referencia (lookup) usada para selects encadenados provincia → departamento → localidad.
 * Sin timestamps: es data estática que se carga por seed y prácticamente no cambia.
 */
const Localidad = sequelize.define('Localidad', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  provincia_nombre:    { type: DataTypes.STRING(150), allowNull: false },
  // Un registro del dataset puede no tener departamento → nullable.
  departamento_nombre: { type: DataTypes.STRING(150), allowNull: true, defaultValue: null },
  localidad_nombre:    { type: DataTypes.STRING(150), allowNull: false },
}, {
  tableName: 'localidades',
  timestamps: false,
  indexes: [
    { name: 'idx_localidades_provincia',    fields: ['provincia_nombre'] },
    // Índice compuesto para el patrón de filtrado en cascada (provincia → departamento)
    { name: 'idx_localidades_prov_depto',    fields: ['provincia_nombre', 'departamento_nombre'] },
    { name: 'idx_localidades_localidad',     fields: ['localidad_nombre'] },
  ],
});

module.exports = Localidad;
