'use strict';
/**
 * Migration 040 — Cantina: pedidos a proveedores y de clientes
 *
 *  cantina_proveedores        CRUD de proveedores por complejo
 *  cantina_clientes           CRUD de clientes por complejo
 *  cantina_pedidos_proveedor  compra: pendiente → confirmado_parcial → confirmado_total | cancelado
 *  cantina_pedidos_cliente    venta:  pendiente → entregado | cancelado
 *  cantina_items_pedido       ítems de ambos tipos de pedido (una FK u otra)
 *  cantina_movimientos        + pedido_proveedor_id / pedido_cliente_id (trazabilidad del stock)
 *
 * El stock NO tiene tabla aparte: sigue siendo cantina_productos.stock, y cada
 * cambio queda auditado en cantina_movimientos (mismo mecanismo que el POS).
 *
 * Segura / idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model, onDelete = 'CASCADE', allowNull = false) =>
      ({ type: N.INTEGER, allowNull, references: { model, key: 'id' }, onDelete });
    const estado = { type: N.ENUM('activo', 'inactivo'), allowNull: false, defaultValue: 'activo' };

    if (!tablas.includes('cantina_proveedores')) {
      await queryInterface.createTable('cantina_proveedores', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id: fk('complexes'),
        nombre:     { type: N.STRING(150), allowNull: false },
        contacto:   { type: N.STRING(150) },
        whatsapp:   { type: N.STRING(30) },
        email:      { type: N.STRING(150) },
        estado,
        ...ts,
      });
    }

    if (!tablas.includes('cantina_clientes')) {
      await queryInterface.createTable('cantina_clientes', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id: fk('complexes'),
        nombre:     { type: N.STRING(150), allowNull: false },
        dni:        { type: N.STRING(15) },
        whatsapp:   { type: N.STRING(30) },
        email:      { type: N.STRING(150) },
        estado,
        ...ts,
      });
      await queryInterface.addIndex('cantina_clientes', ['complex_id', 'dni'], { unique: true, name: 'uq_cantina_cliente_dni' });
    }

    if (!tablas.includes('cantina_pedidos_proveedor')) {
      await queryInterface.createTable('cantina_pedidos_proveedor', {
        id:            { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:    fk('complexes'),
        proveedor_id:  fk('cantina_proveedores', 'RESTRICT'),
        fecha:         { type: N.DATEONLY, allowNull: false },
        estado:        { type: N.ENUM('pendiente', 'confirmado_parcial', 'confirmado_total', 'cancelado'), allowNull: false, defaultValue: 'pendiente' },
        notas:         { type: N.TEXT },
        usuario_id:    fk('users', 'SET NULL', true),
        confirmado_at: { type: N.DATE },
        ...ts,
      });
    }

    if (!tablas.includes('cantina_pedidos_cliente')) {
      await queryInterface.createTable('cantina_pedidos_cliente', {
        id:           { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:   fk('complexes'),
        cliente_id:   fk('cantina_clientes', 'RESTRICT'),
        fecha:        { type: N.DATEONLY, allowNull: false },
        estado:       { type: N.ENUM('pendiente', 'entregado', 'cancelado'), allowNull: false, defaultValue: 'pendiente' },
        notas:        { type: N.TEXT },
        usuario_id:   fk('users', 'SET NULL', true),
        entregado_at: { type: N.DATE },
        ...ts,
      });
    }

    if (!tablas.includes('cantina_items_pedido')) {
      await queryInterface.createTable('cantina_items_pedido', {
        id:                  { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        pedido_proveedor_id: fk('cantina_pedidos_proveedor', 'CASCADE', true),
        pedido_cliente_id:   fk('cantina_pedidos_cliente', 'CASCADE', true),
        producto_id:         fk('cantina_productos', 'RESTRICT'),
        cantidad:            { type: N.DECIMAL(10, 2), allowNull: false },
        // Compra: lo que efectivamente llegó (puede diferir de lo pedido)
        cantidad_recibida:   { type: N.DECIMAL(10, 2) },
        precio_unitario:     { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },   // costo (compra) o venta (cliente)
        estado:              { type: N.ENUM('pendiente', 'recibido', 'entregado'), allowNull: false, defaultValue: 'pendiente' },
        ...ts,
      });
    }

    const mov = await queryInterface.describeTable('cantina_movimientos');
    if (!mov.pedido_proveedor_id) {
      await queryInterface.addColumn('cantina_movimientos', 'pedido_proveedor_id', fk('cantina_pedidos_proveedor', 'SET NULL', true));
    }
    if (!mov.pedido_cliente_id) {
      await queryInterface.addColumn('cantina_movimientos', 'pedido_cliente_id', fk('cantina_pedidos_cliente', 'SET NULL', true));
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cantina_movimientos', 'pedido_cliente_id').catch(() => {});
    await queryInterface.removeColumn('cantina_movimientos', 'pedido_proveedor_id').catch(() => {});
    for (const t of ['cantina_items_pedido', 'cantina_pedidos_cliente', 'cantina_pedidos_proveedor', 'cantina_clientes', 'cantina_proveedores']) {
      await queryInterface.dropTable(t).catch(() => {});
    }
  },
};
