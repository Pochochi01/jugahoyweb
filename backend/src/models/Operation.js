const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Operation = sequelize.define('Operation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo: {
    type: DataTypes.ENUM('reserva', 'cancelacion', 'confirmacion', 'pago', 'ajuste'),
    allowNull: false,
  },
  descripcion: { type: DataTypes.TEXT },
  agenda_id: { type: DataTypes.INTEGER },
  usuario_id: { type: DataTypes.INTEGER },
  monto: { type: DataTypes.DECIMAL(10, 2) },
  fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'operations' });

module.exports = Operation;
