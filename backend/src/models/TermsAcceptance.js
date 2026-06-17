/**
 * models/TermsAcceptance.js
 * Registro de aceptaciones de T&C por usuario y versión.
 * La clave única (usuario_id, version) evita duplicados.
 */
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

const TermsAcceptance = sequelize.define('TermsAcceptance', {
  id:         { type: DataTypes.INTEGER,    primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER,    allowNull: false },
  version:    { type: DataTypes.STRING(20), allowNull: false },
  ip:         { type: DataTypes.STRING(45), allowNull: true  },
  user_agent: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'terms_aceptacion',
  indexes: [{ unique: true, fields: ['usuario_id', 'version'] }],
});

module.exports = TermsAcceptance;
