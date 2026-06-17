const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:       { type: DataTypes.INTEGER, allowNull: false, unique: true },
  precio_mensual:   { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  estado:           { type: DataTypes.ENUM('activo', 'inactivo'), defaultValue: 'activo' },
  fecha_inicio:     { type: DataTypes.DATEONLY },
  fecha_pago:       { type: DataTypes.DATEONLY },
  fecha_vencimiento:{ type: DataTypes.DATEONLY },
  notas:            { type: DataTypes.TEXT },
  created_by:       { type: DataTypes.INTEGER },
}, { tableName: 'subscriptions' });

module.exports = Subscription;
