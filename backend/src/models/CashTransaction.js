const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CashTransaction = sequelize.define('CashTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  cash_register_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo: { type: DataTypes.ENUM('ingreso', 'egreso'), allowNull: false },
  concepto: { type: DataTypes.STRING(255), allowNull: false },
  monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  metodo_pago: {
    type: DataTypes.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'),
    defaultValue: 'efectivo',
  },
  categoria: { type: DataTypes.STRING(100) },
  agenda_id: { type: DataTypes.INTEGER },
  usuario_id: { type: DataTypes.INTEGER },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  notas: { type: DataTypes.TEXT },
}, { tableName: 'cash_transactions' });

module.exports = CashTransaction;
