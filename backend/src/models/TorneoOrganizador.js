const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Organizador de torneos: login propio (no es un User), acotado a un club.
const TorneoOrganizador = sequelize.define('TorneoOrganizador', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: DataTypes.INTEGER, allowNull: false },
  nombre:    { type: DataTypes.STRING(150) },
  usuario:   { type: DataTypes.STRING(80), allowNull: false, unique: true },
  password:  { type: DataTypes.STRING(255), allowNull: false },   // hash bcrypt
  whatsapp:  { type: DataTypes.STRING(30) },
  activo:    { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'torneo_organizadores',
  defaultScope: { attributes: { exclude: ['password'] } },
  scopes: { withPassword: { attributes: { include: ['password'] } } },
});

module.exports = TorneoOrganizador;
