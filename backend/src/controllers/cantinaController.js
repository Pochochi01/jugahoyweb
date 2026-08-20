'use strict';
/**
 * controllers/cantinaController.js — Módulo Cantina
 * Productos, stock, ventas, reportes, dashboard y caja diaria.
 */
const { Op } = require('sequelize');
const {
  CantinaProducto, CantinaVenta, CantinaDetalleVenta, CantinaMovimiento,
  sequelize,
} = require('../models');
const caja = require('../services/cajaService');

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

// ── Helper: aplica un movimiento de stock a un producto (dentro de una transacción) ──
async function aplicarMovimiento({ producto, tipo, motivo, cantidad, venta_id, usuario_id, notas }, t) {
  const anterior = num(producto.stock);
  let resultante;
  if (tipo === 'entrada')      resultante = anterior + cantidad;
  else if (tipo === 'salida')  resultante = anterior - cantidad;
  else /* ajuste */            resultante = cantidad;   // ajuste = stock exacto
  if (resultante < 0) resultante = 0;

  await producto.update({ stock: resultante }, { transaction: t });
  await CantinaMovimiento.create({
    producto_id: producto.id, tipo, motivo, cantidad,
    stock_anterior: anterior, stock_resultante: resultante,
    venta_id: venta_id || null, usuario_id: usuario_id || null, notas: notas || null,
  }, { transaction: t });
  return resultante;
}

// ─────────────────────────────────────────────────────────────
//  PRODUCTOS (CRUD)
// ─────────────────────────────────────────────────────────────
async function listProductos(req, res) {
  try {
    const { complexId } = req.params;
    const { categoria, q, soloDisponibles } = req.query;
    const where = { complex_id: complexId };
    if (categoria) where.categoria = categoria;
    if (q) where.nombre = { [Op.like]: `%${q}%` };
    if (soloDisponibles === 'true') { where.activo = true; where.stock = { [Op.gt]: 0 }; }

    const productos = await CantinaProducto.findAll({ where, order: [['nombre', 'ASC']] });
    // Bloqueo automático: sin stock o inactivo → no disponible para vender.
    const data = productos.map(p => {
      const j = p.toJSON();
      j.disponible = j.activo && num(j.stock) > 0;
      j.stock_bajo = num(j.stock_minimo) > 0 && num(j.stock) <= num(j.stock_minimo);
      return j;
    });
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

async function getProducto(req, res) {
  try {
    const p = await CantinaProducto.findOne({ where: { id: req.params.id, complex_id: req.params.complexId } });
    if (!p) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

async function createProducto(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId } = req.params;
    const b = req.body;
    if (!b.nombre?.trim()) { await t.rollback(); return res.status(400).json({ message: 'El nombre es obligatorio.' }); }

    const producto = await CantinaProducto.create({
      complex_id:    complexId,
      categoria:     b.categoria || 'otros',
      nombre:        b.nombre.trim(),
      descripcion:   b.descripcion || null,
      precio_costo:  num(b.precio_costo),
      precio_venta:  num(b.precio_venta),
      unidad_medida: b.unidad_medida || 'unidad',
      imagen_url:    b.imagen_url || null,
      stock:         num(b.stock),
      stock_minimo:  num(b.stock_minimo),
      activo:        b.activo !== false,
    }, { transaction: t });

    // Stock inicial → movimiento de historial
    if (num(b.stock) > 0) {
      await CantinaMovimiento.create({
        producto_id: producto.id, tipo: 'entrada', motivo: 'stock_inicial',
        cantidad: num(b.stock), stock_anterior: 0, stock_resultante: num(b.stock),
        usuario_id: req.user.id, notas: 'Carga inicial',
      }, { transaction: t });
    }

    await t.commit();
    res.status(201).json(producto);
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

async function updateProducto(req, res) {
  try {
    const p = await CantinaProducto.findOne({ where: { id: req.params.id, complex_id: req.params.complexId } });
    if (!p) return res.status(404).json({ message: 'Producto no encontrado' });
    const b = req.body;
    // El stock NO se cambia acá: se ajusta por movimientos (auditable).
    await p.update({
      categoria:     b.categoria     ?? p.categoria,
      nombre:        b.nombre?.trim() ?? p.nombre,
      descripcion:   b.descripcion    ?? p.descripcion,
      precio_costo:  b.precio_costo  != null ? num(b.precio_costo) : p.precio_costo,
      precio_venta:  b.precio_venta  != null ? num(b.precio_venta) : p.precio_venta,
      unidad_medida: b.unidad_medida  ?? p.unidad_medida,
      imagen_url:    b.imagen_url     ?? p.imagen_url,
      stock_minimo:  b.stock_minimo  != null ? num(b.stock_minimo) : p.stock_minimo,
      activo:        b.activo != null ? !!b.activo : p.activo,
    });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

async function deleteProducto(req, res) {
  try {
    const p = await CantinaProducto.findOne({ where: { id: req.params.id, complex_id: req.params.complexId } });
    if (!p) return res.status(404).json({ message: 'Producto no encontrado' });
    // Baja lógica (preserva integridad con el detalle de ventas).
    await p.update({ activo: false });
    res.json({ message: 'Producto dado de baja.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// ─────────────────────────────────────────────────────────────
//  STOCK
// ─────────────────────────────────────────────────────────────
async function crearMovimiento(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId } = req.params;
    const { producto_id, tipo, motivo, cantidad, notas } = req.body;
    const cant = num(cantidad);
    if (!['entrada', 'salida', 'ajuste'].includes(tipo)) { await t.rollback(); return res.status(400).json({ message: 'tipo inválido' }); }
    if (tipo !== 'ajuste' && cant <= 0) { await t.rollback(); return res.status(400).json({ message: 'La cantidad debe ser > 0' }); }

    const producto = await CantinaProducto.findOne({ where: { id: producto_id, complex_id: complexId }, transaction: t, lock: true });
    if (!producto) { await t.rollback(); return res.status(404).json({ message: 'Producto no encontrado' }); }
    if (tipo === 'salida' && cant > num(producto.stock)) { await t.rollback(); return res.status(409).json({ message: `Stock insuficiente (hay ${num(producto.stock)}).` }); }

    const resultante = await aplicarMovimiento({
      producto, tipo, motivo: motivo || (tipo === 'entrada' ? 'compra' : tipo === 'salida' ? 'merma' : 'ajuste'),
      cantidad: cant, usuario_id: req.user.id, notas,
    }, t);

    // Si es una compra (entrada) con costo → egreso en caja (best-effort).
    if (tipo === 'entrada' && (motivo === 'compra' || motivo === 'reposicion') && num(producto.precio_costo) > 0) {
      await caja.registrarEnCaja(complexId, {
        tipo: 'egreso', concepto: `Compra cantina: ${producto.nombre} x${cant}`,
        monto: num(producto.precio_costo) * cant, metodo_pago: 'efectivo',
        categoria: 'cantina_compra', usuario_id: req.user.id,
      }, t);
    }

    await t.commit();
    res.status(201).json({ message: 'Movimiento registrado.', stock: resultante });
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

async function listMovimientos(req, res) {
  try {
    const { complexId } = req.params;
    const { producto_id, desde, hasta } = req.query;
    const prodWhere = { complex_id: complexId };
    if (producto_id) prodWhere.id = producto_id;
    const productos = await CantinaProducto.findAll({ where: prodWhere, attributes: ['id'] });
    const ids = productos.map(p => p.id);
    if (!ids.length) return res.json([]);

    const where = { producto_id: { [Op.in]: ids } };
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt[Op.gte] = new Date(desde);
      if (hasta) where.createdAt[Op.lte] = new Date(hasta + 'T23:59:59');
    }
    const movs = await CantinaMovimiento.findAll({
      where, include: [{ model: CantinaProducto, as: 'producto', attributes: ['nombre'] }],
      order: [['createdAt', 'DESC']], limit: 200,
    });
    res.json(movs);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

async function getAlertas(req, res) {
  try {
    const { complexId } = req.params;
    const productos = await CantinaProducto.findAll({ where: { complex_id: complexId, activo: true } });
    const alertas = productos
      .filter(p => num(p.stock) <= 0 || (num(p.stock_minimo) > 0 && num(p.stock) <= num(p.stock_minimo)))
      .map(p => ({ id: p.id, nombre: p.nombre, stock: num(p.stock), stock_minimo: num(p.stock_minimo), sin_stock: num(p.stock) <= 0 }));
    res.json(alertas);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// ─────────────────────────────────────────────────────────────
//  VENTAS
// ─────────────────────────────────────────────────────────────
async function crearVenta(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId } = req.params;
    const { items, metodo_pago, descuento, notas } = req.body;
    if (!Array.isArray(items) || items.length === 0) { await t.rollback(); return res.status(400).json({ message: 'La venta debe tener al menos un producto.' }); }

    let subtotal = 0;
    const lineas = [];
    for (const it of items) {
      const producto = await CantinaProducto.findOne({ where: { id: it.producto_id, complex_id: complexId }, transaction: t, lock: true });
      if (!producto)            { await t.rollback(); return res.status(404).json({ message: `Producto ${it.producto_id} no encontrado` }); }
      if (!producto.activo)     { await t.rollback(); return res.status(409).json({ message: `"${producto.nombre}" está inactivo.` }); }
      const cant = num(it.cantidad);
      if (cant <= 0)            { await t.rollback(); return res.status(400).json({ message: `Cantidad inválida para "${producto.nombre}".` }); }
      if (cant > num(producto.stock)) { await t.rollback(); return res.status(409).json({ message: `Sin stock suficiente de "${producto.nombre}" (hay ${num(producto.stock)}).` }); }

      const precio = it.precio_unitario != null ? num(it.precio_unitario) : num(producto.precio_venta);
      const descL  = num(it.descuento_linea);
      const sub    = precio * cant - descL;
      subtotal += sub;
      lineas.push({ producto, cant, precio, descL, sub });
    }

    const desc  = num(descuento);
    const total = Math.max(0, subtotal - desc);

    const venta = await CantinaVenta.create({
      complex_id: complexId, subtotal, descuento: desc, total,
      metodo_pago: metodo_pago || 'efectivo', estado: 'completada',
      usuario_id: req.user.id, notas: notas || null,
    }, { transaction: t });

    for (const l of lineas) {
      await CantinaDetalleVenta.create({
        venta_id: venta.id, producto_id: l.producto.id, nombre_producto: l.producto.nombre,
        cantidad: l.cant, precio_unitario: l.precio, descuento_linea: l.descL, subtotal: l.sub,
      }, { transaction: t });
      await aplicarMovimiento({ producto: l.producto, tipo: 'salida', motivo: 'venta', cantidad: l.cant, venta_id: venta.id, usuario_id: req.user.id }, t);
    }

    // Ingreso en la caja diaria (best-effort si hay caja abierta)
    const tx = await caja.registrarEnCaja(complexId, {
      tipo: 'ingreso', concepto: `Venta cantina #${venta.id}`, monto: total,
      metodo_pago: metodo_pago || 'efectivo', categoria: 'cantina', usuario_id: req.user.id,
    }, t);
    if (tx) await venta.update({ cash_transaction_id: tx.id }, { transaction: t });

    await t.commit();
    const full = await CantinaVenta.findByPk(venta.id, { include: [{ model: CantinaDetalleVenta, as: 'detalle' }] });
    res.status(201).json({ ...full.toJSON(), en_caja: !!tx });
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

async function listVentas(req, res) {
  try {
    const { complexId } = req.params;
    const { desde, hasta, estado } = req.query;
    const where = { complex_id: complexId };
    if (estado) where.estado = estado;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = new Date(desde);
      if (hasta) where.fecha[Op.lte] = new Date(hasta + 'T23:59:59');
    }
    const ventas = await CantinaVenta.findAll({
      where, include: [{ model: CantinaDetalleVenta, as: 'detalle' }],
      order: [['fecha', 'DESC']], limit: 200,
    });
    res.json(ventas);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

async function getVenta(req, res) {
  try {
    const venta = await CantinaVenta.findOne({
      where: { id: req.params.id, complex_id: req.params.complexId },
      include: [{ model: CantinaDetalleVenta, as: 'detalle' }],
    });
    if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });
    res.json(venta);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Devolución: anula la venta, repone el stock y registra el egreso en caja.
async function devolverVenta(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, id } = req.params;
    const venta = await CantinaVenta.findOne({
      where: { id, complex_id: complexId }, include: [{ model: CantinaDetalleVenta, as: 'detalle' }], transaction: t,
    });
    if (!venta) { await t.rollback(); return res.status(404).json({ message: 'Venta no encontrada' }); }
    if (venta.estado === 'anulada') { await t.rollback(); return res.status(409).json({ message: 'La venta ya fue anulada.' }); }

    for (const d of venta.detalle) {
      const producto = await CantinaProducto.findByPk(d.producto_id, { transaction: t, lock: true });
      if (producto) await aplicarMovimiento({ producto, tipo: 'entrada', motivo: 'devolucion', cantidad: num(d.cantidad), venta_id: venta.id, usuario_id: req.user.id, notas: `Devolución venta #${venta.id}` }, t);
    }

    await venta.update({ estado: 'anulada' }, { transaction: t });

    // Egreso en caja por la devolución (best-effort)
    await caja.registrarEnCaja(complexId, {
      tipo: 'egreso', concepto: `Devolución cantina venta #${venta.id}`, monto: num(venta.total),
      metodo_pago: venta.metodo_pago, categoria: 'cantina_devolucion', usuario_id: req.user.id,
    }, t);

    await t.commit();
    res.json({ message: 'Venta anulada y stock repuesto.' });
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

// ─────────────────────────────────────────────────────────────
//  REPORTES / ESTADÍSTICAS
// ─────────────────────────────────────────────────────────────
async function reporteVentas(req, res) {
  try {
    const { complexId } = req.params;
    const { desde, hasta } = req.query;
    const where = { complex_id: complexId, estado: 'completada' };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = new Date(desde);
      if (hasta) where.fecha[Op.lte] = new Date(hasta + 'T23:59:59');
    }
    const filas = await CantinaVenta.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('fecha')), 'dia'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'ventas'],
        [sequelize.fn('SUM', sequelize.col('total')), 'total'],
      ],
      group: [sequelize.fn('DATE', sequelize.col('fecha'))],
      order: [[sequelize.fn('DATE', sequelize.col('fecha')), 'ASC']],
      raw: true,
    });
    const totalGeneral = filas.reduce((s, f) => s + num(f.total), 0);
    const ventasGeneral = filas.reduce((s, f) => s + parseInt(f.ventas), 0);
    res.json({ por_dia: filas.map(f => ({ dia: f.dia, ventas: parseInt(f.ventas), total: num(f.total) })), total: totalGeneral, cantidad: ventasGeneral });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

async function reporteProductos(req, res) {
  try {
    const { complexId } = req.params;
    const { desde, hasta } = req.query;
    const ventaWhere = { complex_id: complexId, estado: 'completada' };
    if (desde || hasta) {
      ventaWhere.fecha = {};
      if (desde) ventaWhere.fecha[Op.gte] = new Date(desde);
      if (hasta) ventaWhere.fecha[Op.lte] = new Date(hasta + 'T23:59:59');
    }

    const filas = await CantinaDetalleVenta.findAll({
      attributes: [
        'producto_id', 'nombre_producto',
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'unidades'],
        [sequelize.fn('SUM', sequelize.col('CantinaDetalleVenta.subtotal')), 'total'],
      ],
      include: [
        { model: CantinaVenta, as: 'venta', attributes: [], where: ventaWhere },
        { model: CantinaProducto, as: 'producto', attributes: ['precio_costo', 'categoria'] },
      ],
      group: ['producto_id', 'nombre_producto', 'producto.id'],
      order: [[sequelize.literal('unidades'), 'DESC']],
      raw: true, nest: true,
    });

    const productos = filas.map(f => {
      const unidades = num(f.unidades);
      const total    = num(f.total);
      const costo    = num(f.producto?.precio_costo) * unidades;
      return {
        producto_id: f.producto_id, nombre: f.nombre_producto, categoria: f.producto?.categoria,
        unidades, total, margen: total - costo,
      };
    });
    res.json({
      mas_vendidos:   productos.slice(0, 10),
      menos_vendidos: [...productos].reverse().slice(0, 10),
      total_margen:   productos.reduce((s, p) => s + p.margen, 0),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Caja diaria: ingresos (cantina + turnos) − egresos. No-shows NO suman.
async function getResumenCaja(req, res) {
  try {
    const { desde, hasta } = req.query;
    const resumen = await caja.resumenCaja(req.params.complexId, { desde, hasta });
    res.json(resumen);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Dashboard: indicadores del día.
async function getDashboard(req, res) {
  try {
    const { complexId } = req.params;
    const hoy = new Date().toISOString().slice(0, 10);
    const [ventasHoy, alertasCount, activos] = await Promise.all([
      CantinaVenta.findOne({
        where: { complex_id: complexId, estado: 'completada', fecha: { [Op.gte]: new Date(hoy + 'T00:00:00'), [Op.lte]: new Date(hoy + 'T23:59:59') } },
        attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('total')), 'total']], raw: true,
      }),
      CantinaProducto.count({ where: { complex_id: complexId, activo: true, stock: { [Op.lte]: 0 } } }),
      CantinaProducto.count({ where: { complex_id: complexId, activo: true } }),
    ]);
    const criticos = await CantinaProducto.findAll({
      where: { complex_id: complexId, activo: true, [Op.or]: [{ stock: { [Op.lte]: 0 } }, sequelize.where(sequelize.col('stock'), Op.lte, sequelize.col('stock_minimo'))] },
      attributes: ['id', 'nombre', 'stock', 'stock_minimo'], limit: 20,
    });
    res.json({
      ventas_dia: { cantidad: parseInt(ventasHoy?.n || 0), total: num(ventasHoy?.total) },
      productos_activos: activos,
      sin_stock: alertasCount,
      stock_critico: criticos,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = {
  listProductos, getProducto, createProducto, updateProducto, deleteProducto,
  crearMovimiento, listMovimientos, getAlertas,
  crearVenta, listVentas, getVenta, devolverVenta,
  reporteVentas, reporteProductos, getResumenCaja, getDashboard,
};
