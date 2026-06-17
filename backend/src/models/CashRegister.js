const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CashRegister = sequelize.define('CashRegister', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
  fecha_apertura: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  fecha_cierre: { type: DataTypes.DATE },
  monto_inicial: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  monto_final: { type: DataTypes.DECIMAL(10, 2) },
  estado: { type: DataTypes.ENUM('abierta', 'cerrada'), defaultValue: 'abierta' },
  usuario_apertura_id: { type: DataTypes.INTEGER },
  usuario_cierre_id: { type: DataTypes.INTEGER },
  notas: { type: DataTypes.TEXT },
}, { tableName: 'cash_registers' });

module.exports = CashRegister;
