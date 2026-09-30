const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Cantina — proveedores, clientes y pedidos (compras y ventas por pedido).
 * El stock sigue en cantina_productos.stock; cada cambio queda en cantina_movimientos.
 */
const ESTADO = { type: DataTypes.ENUM('activo', 'inactivo'), defaultValue: 'activo' };

const CantinaProveedor = sequelize.define('CantinaProveedor', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
  nombre:     { type: DataTypes.STRING(150), allowNull: false },
  contacto:   { type: DataTypes.STRING(150) },      // persona de contacto
  whatsapp:   { type: DataTypes.STRING(30) },       // solo dígitos, con código de país
  email:      { type: DataTypes.STRING(150) },
  estado:     ESTADO,
}, { tableName: 'cantina_proveedores' });

const CantinaCliente = sequelize.define('CantinaCliente', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
  nombre:     { type: DataTypes.STRING(150), allowNull: false },
  dni:        { type: DataTypes.STRING(15) },
  whatsapp:   { type: DataTypes.STRING(30) },
  email:      { type: DataTypes.STRING(150) },
  estado:     ESTADO,
}, { tableName: 'cantina_clientes' });

// Compra: pendiente → confirmado_parcial (llegó una parte) → confirmado_total | cancelado
const CantinaPedidoProveedor = sequelize.define('CantinaPedidoProveedor', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:    { type: DataTypes.INTEGER, allowNull: false },
  proveedor_id:  { type: DataTypes.INTEGER, allowNull: false },
  fecha:         { type: DataTypes.DATEONLY, allowNull: false },
  estado:        { type: DataTypes.ENUM('pendiente', 'confirmado_parcial', 'confirmado_total', 'cancelado'), defaultValue: 'pendiente' },
  notas:         { type: DataTypes.TEXT },
  usuario_id:    { type: DataTypes.INTEGER },
  confirmado_at: { type: DataTypes.DATE },
}, { tableName: 'cantina_pedidos_proveedor' });

// Venta por pedido: pendiente → entregado (resta stock) | cancelado
const CantinaPedidoCliente = sequelize.define('CantinaPedidoCliente', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:   { type: DataTypes.INTEGER, allowNull: false },
  cliente_id:   { type: DataTypes.INTEGER, allowNull: false },
  fecha:        { type: DataTypes.DATEONLY, allowNull: false },
  estado:       { type: DataTypes.ENUM('pendiente', 'entregado', 'cancelado'), defaultValue: 'pendiente' },
  notas:        { type: DataTypes.TEXT },
  usuario_id:   { type: DataTypes.INTEGER },
  entregado_at: { type: DataTypes.DATE },
}, { tableName: 'cantina_pedidos_cliente' });

// Ítem de un pedido (de proveedor O de cliente: exactamente una de las dos FK)
const CantinaItemPedido = sequelize.define('CantinaItemPedido', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pedido_proveedor_id: { type: DataTypes.INTEGER, allowNull: true },
  pedido_cliente_id:   { type: DataTypes.INTEGER, allowNull: true },
  producto_id:         { type: DataTypes.INTEGER, allowNull: false },
  cantidad:            { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  cantidad_recibida:   { type: DataTypes.DECIMAL(10, 2) },
  precio_unitario:     { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  estado:              { type: DataTypes.ENUM('pendiente', 'recibido', 'entregado'), defaultValue: 'pendiente' },
}, { tableName: 'cantina_items_pedido' });

module.exports = { CantinaProveedor, CantinaCliente, CantinaPedidoProveedor, CantinaPedidoCliente, CantinaItemPedido };
