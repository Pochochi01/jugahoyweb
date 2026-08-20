const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Movimiento de stock de un producto (historial: entradas, salidas, ajustes).
const CantinaMovimiento = sequelize.define('CantinaMovimiento', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  producto_id:      { type: DataTypes.INTEGER, allowNull: false },
  tipo:             { type: DataTypes.ENUM('entrada', 'salida', 'ajuste'), allowNull: false },
  motivo:           { type: DataTypes.ENUM('compra', 'reposicion', 'venta', 'merma', 'devolucion', 'ajuste', 'stock_inicial'), allowNull: false },
  cantidad:         { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  stock_anterior:   { type: DataTypes.DECIMAL(10, 2) },
  stock_resultante: { type: DataTypes.DECIMAL(10, 2) },
  venta_id:         { type: DataTypes.INTEGER },
  usuario_id:       { type: DataTypes.INTEGER },
  notas:            { type: DataTypes.TEXT },
}, { tableName: 'cantina_movimientos', updatedAt: false });

module.exports = CantinaMovimiento;
