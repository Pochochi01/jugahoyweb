const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ítem de una venta de cantina.
const CantinaDetalleVenta = sequelize.define('CantinaDetalleVenta', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  venta_id:        { type: DataTypes.INTEGER, allowNull: false },
  producto_id:     { type: DataTypes.INTEGER, allowNull: false },
  nombre_producto: { type: DataTypes.STRING(150), allowNull: false },   // snapshot al momento de la venta
  cantidad:        { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  precio_unitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  descuento_linea: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  subtotal:        { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, { tableName: 'cantina_detalle_ventas', timestamps: false });

module.exports = CantinaDetalleVenta;
