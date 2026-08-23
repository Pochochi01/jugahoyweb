const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Consumo de cantina asociado a un turno (se acumula durante el partido).
// El stock se descuenta al agregarlo; el ingreso a caja se registra al cobrar.
const BookingConsumo = sequelize.define('BookingConsumo', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  booking_id:      { type: DataTypes.INTEGER, allowNull: false },
  producto_id:     { type: DataTypes.INTEGER, allowNull: false },
  nombre_producto: { type: DataTypes.STRING(150), allowNull: false },   // snapshot
  cantidad:        { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
  precio_unitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  subtotal:        { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  usuario_id:      { type: DataTypes.INTEGER },
}, { tableName: 'booking_consumos' });

module.exports = BookingConsumo;
