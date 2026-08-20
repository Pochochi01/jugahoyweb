const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Producto de la cantina (catálogo por complejo).
const CantinaProducto = sequelize.define('CantinaProducto', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:    { type: DataTypes.INTEGER, allowNull: false },
  categoria:     { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'otros' },
  nombre:        { type: DataTypes.STRING(150), allowNull: false },
  descripcion:   { type: DataTypes.TEXT },
  precio_costo:  { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  precio_venta:  { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  unidad_medida: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unidad' },
  imagen_url:    { type: DataTypes.STRING(500) },
  stock:         { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  stock_minimo:  { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  activo:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'cantina_productos' });

module.exports = CantinaProducto;
