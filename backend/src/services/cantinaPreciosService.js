'use strict';
/**
 * services/cantinaPreciosService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Precios de compra por proveedor (cantina_producto_proveedor) y comparación
 * entre proveedores antes de generar un pedido.
 *
 * Precio EFECTIVO de un producto en un proveedor, para una cantidad dada:
 *   - si la cantidad no llega a `minimo_compra` → ese proveedor NO es opción (null)
 *   - si no → precio_compra × (1 − descuento_pct / 100), redondeado a centavos
 *
 * Así la alerta de "más barato en otro proveedor" solo sugiere precios que
 * realmente se pueden conseguir con esa cantidad.
 */
const { Op } = require('sequelize');
const { CantinaProductoProveedor, CantinaProveedor, CantinaProducto } = require('../models');
const { num } = require('./cantinaStockService');

const redondear = (n) => Math.round(n * 100) / 100;

/** @returns {number|null} precio unitario efectivo, o null si no se alcanza el mínimo */
function precioEfectivo(link, cantidad) {
  const minimo = num(link.minimo_compra);
  if (minimo > 0 && num(cantidad) < minimo) return null;
  const desc = Math.min(Math.max(num(link.descuento_pct), 0), 100);
  return redondear(num(link.precio_compra) * (1 - desc / 100));
}

/** Catálogo (productos + precios) de un proveedor del complejo. */
async function catalogoProveedor(complexId, proveedorId) {
  return CantinaProductoProveedor.findAll({
    where: { proveedor_id: proveedorId },
    include: [
      { model: CantinaProducto, as: 'producto', where: { complex_id: complexId }, attributes: ['id', 'nombre', 'categoria', 'unidad_medida', 'stock', 'activo', 'precio_costo', 'precio_venta'] },
    ],
    order: [[{ model: CantinaProducto, as: 'producto' }, 'nombre', 'ASC']],
  });
}

/**
 * Compara los ítems de un pedido contra el resto de los proveedores ACTIVOS
 * del complejo que tienen esos productos.
 *
 * @param {Array<{producto_id, cantidad}>} items
 * @returns {Promise<Array<{producto_id, producto, cantidad, precio_actual, mejor_precio,
 *           mejor_proveedor:{id,nombre,whatsapp}, ahorro_unitario, ahorro_total}>>}
 *          vacío si el proveedor elegido ya es el más barato en todo
 */
async function compararPrecios(complexId, proveedorId, items) {
  const ids = items.map(i => Number(i.producto_id));
  if (!ids.length) return [];
  const links = await CantinaProductoProveedor.findAll({
    where: { producto_id: ids },
    include: [
      { model: CantinaProveedor, as: 'proveedor', where: { complex_id: complexId, [Op.or]: [{ estado: 'activo' }, { id: proveedorId }] }, attributes: ['id', 'nombre', 'whatsapp', 'estado'] },
      { model: CantinaProducto, as: 'producto', attributes: ['id', 'nombre'] },
    ],
  });

  const alertas = [];
  for (const it of items) {
    const delProducto = links.filter(l => l.producto_id === Number(it.producto_id));
    const propio = delProducto.find(l => l.proveedor_id === Number(proveedorId));
    if (!propio) continue;
    const actual = precioEfectivo(propio, it.cantidad);
    if (actual == null) continue;   // se valida aparte (mínimo de compra)

    let mejor = null;
    for (const l of delProducto) {
      if (l.proveedor_id === Number(proveedorId) || l.proveedor.estado !== 'activo') continue;
      const p = precioEfectivo(l, it.cantidad);
      if (p != null && p < actual && (!mejor || p < mejor.precio)) mejor = { precio: p, link: l };
    }
    if (mejor) {
      alertas.push({
        producto_id: propio.producto_id,
        producto: propio.producto.nombre,
        cantidad: num(it.cantidad),
        precio_actual: actual,
        mejor_precio: mejor.precio,
        mejor_proveedor: { id: mejor.link.proveedor.id, nombre: mejor.link.proveedor.nombre, whatsapp: mejor.link.proveedor.whatsapp },
        ahorro_unitario: redondear(actual - mejor.precio),
        ahorro_total: redondear((actual - mejor.precio) * num(it.cantidad)),
      });
    }
  }
  return alertas;
}

module.exports = { precioEfectivo, catalogoProveedor, compararPrecios };
