/**
 * models/TermsVersion.js
 * Versiones de los Términos y Condiciones. Solo la activa se muestra al usuario.
 */
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

const TermsVersion = sequelize.define('TermsVersion', {
  id:        { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
  version:   { type: DataTypes.STRING(20),  allowNull: false, unique: true },
  contenido: { type: DataTypes.TEXT('long'), allowNull: false },
  activo:    { type: DataTypes.BOOLEAN,     defaultValue: true },
}, { tableName: 'terminos' });

module.exports = TermsVersion;
