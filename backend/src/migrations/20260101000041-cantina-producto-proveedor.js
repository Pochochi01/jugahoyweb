'use strict';
/**
 * Migration 041 — Catálogo de precios por proveedor (producto ↔ proveedor, N:N)
 *
 *  cantina_producto_proveedor
 *    precio_compra   precio de lista del proveedor para ese producto
 *    precio_venta    precio de venta sugerido por el proveedor (opcional, informativo)
 *    minimo_compra   cantidad mínima para que aplique el precio (opcional)
 *    descuento_pct   descuento sobre precio_compra (opcional) → precio efectivo
 *    condiciones     texto libre (plazos, bonificaciones, flete…)
 *
 * Un producto puede estar en varios proveedores con precios distintos; al
 * pedir, se compara el precio efectivo contra los demás proveedores.
 *
 * Segura / idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    if (tablas.includes('cantina_producto_proveedor')) return;
    await queryInterface.createTable('cantina_producto_proveedor', {
      id:            { type: N.INTEGER, primaryKey: true, autoIncrement: true },
      producto_id:   { type: N.INTEGER, allowNull: false, references: { model: 'cantina_productos', key: 'id' }, onDelete: 'CASCADE' },
      proveedor_id:  { type: N.INTEGER, allowNull: false, references: { model: 'cantina_proveedores', key: 'id' }, onDelete: 'CASCADE' },
      precio_compra: { type: N.DECIMAL(10, 2), allowNull: false },
      precio_venta:  { type: N.DECIMAL(10, 2), allowNull: true },
      minimo_compra: { type: N.DECIMAL(10, 2), allowNull: true },
      descuento_pct: { type: N.DECIMAL(5, 2), allowNull: true },
      condiciones:   { type: N.STRING(255), allowNull: true },
      created_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('cantina_producto_proveedor', ['producto_id', 'proveedor_id'], { unique: true, name: 'uq_producto_proveedor' });
    await queryInterface.addIndex('cantina_producto_proveedor', ['proveedor_id'], { name: 'ix_pp_proveedor' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cantina_producto_proveedor').catch(() => {});
  },
};
