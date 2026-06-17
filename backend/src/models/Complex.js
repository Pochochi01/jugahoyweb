const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Complex = sequelize.define('Complex', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(150), allowNull: false },
  descripcion: { type: DataTypes.TEXT },
  direccion: { type: DataTypes.STRING(255), allowNull: false },
  ciudad: { type: DataTypes.STRING(100) },
  provincia: { type: DataTypes.STRING(100) },
  telefono: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(150) },
  prestaciones: { type: DataTypes.JSON },
  logo_url: { type: DataTypes.STRING(255) },
  banner_url: { type: DataTypes.STRING(255) },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  mercadopago_token: { type: DataTypes.STRING(255) },
  cuentas_bancarias: { type: DataTypes.JSON },
}, { tableName: 'complexes' });

module.exports = Complex;
