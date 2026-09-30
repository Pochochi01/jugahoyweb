'use strict';
/**
 * services/cantinaStockService.js
 * Único punto de cambio del stock de la cantina (POS, ajustes y pedidos).
 * Actualiza cantina_productos.stock y deja el movimiento auditado.
 */
const { CantinaMovimiento } = require('../models');

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

/**
 * Aplica un movimiento de stock a un producto (dentro de una transacción).
 * @param {object} p
 *   - producto: instancia CantinaProducto (idealmente bloqueada FOR UPDATE)
 *   - tipo: 'entrada' | 'salida' | 'ajuste' (ajuste = stock exacto)
 *   - motivo: compra | reposicion | venta | merma | devolucion | ajuste | stock_inicial
 *   - pedido_proveedor_id / pedido_cliente_id: pedido que lo origina (opcional)
 * @returns {Promise<number>} stock resultante
 */
async function aplicarMovimiento({ producto, tipo, motivo, cantidad, venta_id, usuario_id, notas, pedido_proveedor_id, pedido_cliente_id }, t) {
  const anterior = num(producto.stock);
  let resultante;
  if (tipo === 'entrada')      resultante = anterior + cantidad;
  else if (tipo === 'salida')  resultante = anterior - cantidad;
  else /* ajuste */            resultante = cantidad;
  if (resultante < 0) resultante = 0;

  await producto.update({ stock: resultante }, { transaction: t });
  await CantinaMovimiento.create({
    producto_id: producto.id, tipo, motivo, cantidad,
    stock_anterior: anterior, stock_resultante: resultante,
    venta_id: venta_id || null, usuario_id: usuario_id || null, notas: notas || null,
    pedido_proveedor_id: pedido_proveedor_id || null, pedido_cliente_id: pedido_cliente_id || null,
  }, { transaction: t });
  return resultante;
}

module.exports = { aplicarMovimiento, num };
