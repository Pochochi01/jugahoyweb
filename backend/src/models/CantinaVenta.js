const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Venta de cantina (cabecera). El detalle está en cantina_detalle_ventas.
const CantinaVenta = sequelize.define('CantinaVenta', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:          { type: DataTypes.INTEGER, allowNull: false },
  fecha:               { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  subtotal:            { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  descuento:           { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  total:               { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  metodo_pago:         { type: DataTypes.ENUM('efectivo', 'tarjeta', 'billetera', 'transferencia', 'mercadopago'), allowNull: false, defaultValue: 'efectivo' },
  estado:              { type: DataTypes.ENUM('completada', 'anulada'), allowNull: false, defaultValue: 'completada' },
  usuario_id:          { type: DataTypes.INTEGER },
  cash_transaction_id: { type: DataTypes.INTEGER },
  notas:               { type: DataTypes.TEXT },
}, { tableName: 'cantina_ventas' });

module.exports = CantinaVenta;
