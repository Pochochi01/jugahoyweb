'use strict';
/**
 * Migration 028 — Módulo Cantina
 *
 * Tablas (3NF, con integridad referencial):
 *   - cantina_productos        → catálogo (categoría, precios, stock, unidad)
 *   - cantina_movimientos      → historial de stock (entradas/salidas/ajustes)
 *   - cantina_ventas           → ventas (cabecera)
 *   - cantina_detalle_ventas   → ítems de cada venta
 *
 * Se integra con lo existente:
 *   - usuarios  → tabla `users`
 *   - turnos    → tabla `bookings`
 *   - caja      → `cash_registers` / `cash_transactions` (la venta genera un ingreso)
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const N = Sequelize;

    if (!tablas.includes('cantina_productos')) {
      await queryInterface.createTable('cantina_productos', {
        id:            { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:    { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        categoria:     { type: N.STRING(50), allowNull: false, defaultValue: 'otros' },
        nombre:        { type: N.STRING(150), allowNull: false },
        descripcion:   { type: N.TEXT },
        precio_costo:  { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        precio_venta:  { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        unidad_medida: { type: N.STRING(20), allowNull: false, defaultValue: 'unidad' },
        imagen_url:    { type: N.STRING(500) },
        stock:         { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        stock_minimo:  { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        activo:        { type: N.BOOLEAN, allowNull: false, defaultValue: true },
        created_at:    { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at:    { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('cantina_productos', ['complex_id', 'activo']);
    }

    if (!tablas.includes('cantina_ventas')) {
      await queryInterface.createTable('cantina_ventas', {
        id:                 { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:         { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        fecha:              { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        subtotal:           { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        descuento:          { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        total:              { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        metodo_pago:        { type: N.ENUM('efectivo', 'tarjeta', 'billetera', 'transferencia', 'mercadopago'), allowNull: false, defaultValue: 'efectivo' },
        estado:             { type: N.ENUM('completada', 'anulada'), allowNull: false, defaultValue: 'completada' },
        usuario_id:         { type: N.INTEGER, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
        cash_transaction_id:{ type: N.INTEGER, references: { model: 'cash_transactions', key: 'id' }, onDelete: 'SET NULL' },
        notas:              { type: N.TEXT },
        created_at:         { type: N.DATE, allowNull: false, defaultValue: N.NOW },
        updated_at:         { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('cantina_ventas', ['complex_id', 'fecha']);
    }

    if (!tablas.includes('cantina_detalle_ventas')) {
      await queryInterface.createTable('cantina_detalle_ventas', {
        id:              { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        venta_id:        { type: N.INTEGER, allowNull: false, references: { model: 'cantina_ventas', key: 'id' }, onDelete: 'CASCADE' },
        producto_id:     { type: N.INTEGER, allowNull: false, references: { model: 'cantina_productos', key: 'id' }, onDelete: 'RESTRICT' },
        nombre_producto: { type: N.STRING(150), allowNull: false },
        cantidad:        { type: N.DECIMAL(10, 2), allowNull: false },
        precio_unitario: { type: N.DECIMAL(10, 2), allowNull: false },
        descuento_linea: { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        subtotal:        { type: N.DECIMAL(10, 2), allowNull: false },
      });
      await queryInterface.addIndex('cantina_detalle_ventas', ['venta_id']);
      await queryInterface.addIndex('cantina_detalle_ventas', ['producto_id']);
    }

    if (!tablas.includes('cantina_movimientos')) {
      await queryInterface.createTable('cantina_movimientos', {
        id:               { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        producto_id:      { type: N.INTEGER, allowNull: false, references: { model: 'cantina_productos', key: 'id' }, onDelete: 'CASCADE' },
        tipo:             { type: N.ENUM('entrada', 'salida', 'ajuste'), allowNull: false },
        motivo:           { type: N.ENUM('compra', 'reposicion', 'venta', 'merma', 'devolucion', 'ajuste', 'stock_inicial'), allowNull: false },
        cantidad:         { type: N.DECIMAL(10, 2), allowNull: false },
        stock_anterior:   { type: N.DECIMAL(10, 2) },
        stock_resultante: { type: N.DECIMAL(10, 2) },
        venta_id:         { type: N.INTEGER, references: { model: 'cantina_ventas', key: 'id' }, onDelete: 'SET NULL' },
        usuario_id:       { type: N.INTEGER, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
        notas:            { type: N.TEXT },
        created_at:       { type: N.DATE, allowNull: false, defaultValue: N.NOW },
      });
      await queryInterface.addIndex('cantina_movimientos', ['producto_id', 'created_at']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cantina_movimientos');
    await queryInterface.dropTable('cantina_detalle_ventas');
    await queryInterface.dropTable('cantina_ventas');
    await queryInterface.dropTable('cantina_productos');
  },
};
