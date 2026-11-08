'use strict';
/**
 * services/pay/handlers.js — Qué hace cada módulo cuando se aprueba (o reembolsa) uno de sus cobros.
 *
 * El motor no conoce a los módulos: cada uno registra un handler.
 *   registrarHandler(modulo, { categoriaCaja, onAprobado(orden, pago, ctx), onReembolsado(orden, ctx) })
 * ctx = { transaction, usuario, metodo }. Si el handler no define onAprobado, se registra el ingreso
 * en la caja del club con su categoría (comportamiento por defecto para cantina, portería, torneos, etc.).
 * Todo corre dentro de la MISMA transacción que confirma el pago (ACID).
 */
const caja = require('../cajaService');

const handlers = new Map();
const registrarHandler = (modulo, h) => handlers.set(modulo, h);
const handlerDe = (modulo) => handlers.get(modulo) || {};

const metodoCaja = (m) => (['efectivo', 'transferencia', 'tarjeta'].includes(m) ? m : 'mercadopago');

/** Ingreso por defecto en la caja del club (best-effort: sin caja abierta no se registra). */
async function ingresoCaja(orden, monto, { transaction, metodo, categoria, concepto }) {
  return caja.registrarEnCaja(orden.complex_id, {
    tipo: 'ingreso', categoria: categoria || handlerDe(orden.modulo).categoriaCaja || 'otros',
    concepto: concepto || `Jugahoy Pay · ${orden.concepto}${orden.cliente_nombre ? ` · ${orden.cliente_nombre}` : ''}`,
    monto, metodo_pago: metodoCaja(metodo || orden.metodo), usuario_id: orden.creado_por_id || null,
  }, transaction);
}
async function egresoCaja(orden, monto, { transaction, metodo }) {
  return caja.registrarEnCaja(orden.complex_id, {
    tipo: 'egreso', categoria: handlerDe(orden.modulo).categoriaCaja || 'otros',
    concepto: `Reembolso Jugahoy Pay · ${orden.concepto}`, monto, metodo_pago: metodoCaja(metodo || orden.metodo), usuario_id: null,
  }, transaction);
}

// ── Handlers por módulo ───────────────────────────────────────
for (const [modulo, categoriaCaja] of Object.entries({
  cantina: 'cantina', buffet: 'cantina', porteria: 'otros', torneo: 'torneo', gym: 'gym', clase: 'clase',
  clinica: 'clase', evento: 'evento', alquiler: 'alquiler', producto: 'cantina', multa: 'otros', otro: 'otros',
})) registrarHandler(modulo, { categoriaCaja });

/**
 * Reserva / turno (liquidación de cancha + consumos):
 *  - cada orden aprobada entra a la caja desglosada (cancha → 'turno', consumos → 'cantina');
 *  - cuando TODAS las órdenes del turno están aprobadas, el turno queda cobrado y sus consumos
 *    pasan a venta de cantina (igual que el cobro manual de la agenda).
 */
registrarHandler('reserva', {
  categoriaCaja: 'turno',
  async onAprobado(orden, pago, { transaction: t, metodo }) {
    const m = require('../../models');
    const proporcion = Number(pago.monto) / Number(orden.importe);   // pago parcial → proporcional
    for (const it of orden.detalle || []) {
      const monto = Math.round(Number(it.importe) * proporcion * 100) / 100;
      if (monto > 0) await ingresoCaja(orden, monto, { transaction: t, metodo, categoria: it.tipo === 'consumo' ? 'cantina' : 'turno', concepto: `Jugahoy Pay · ${it.concepto} · ${orden.cliente_nombre || ''}`.trim() });
    }
    if (orden.referencia_tipo !== 'booking' || !orden.referencia_id) return;
    const grupo = await m.PayOrder.findAll({ where: { grupo: orden.grupo }, transaction: t, lock: t.LOCK.UPDATE });
    const listo = grupo.every(o => (o.id === orden.id ? true : o.estado === 'aprobado' || o.estado === 'cancelado'));
    if (!listo || Number(orden.importe_pagado) < Number(orden.importe)) return;
    const booking = await m.Booking.findByPk(orden.referencia_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!booking || booking.cobrado) return;
    const consumos = await m.BookingConsumo.findAll({ where: { booking_id: booking.id }, transaction: t });
    if (consumos.length) {
      const total = consumos.reduce((a, c) => a + Number(c.subtotal), 0);
      const venta = await m.CantinaVenta.create({
        complex_id: orden.complex_id, subtotal: total, descuento: 0, total, metodo_pago: 'mercadopago', estado: 'completada',
        usuario_id: orden.creado_por_id || null, notas: `Consumos turno #${booking.id} — Jugahoy Pay`,
      }, { transaction: t });
      for (const c of consumos) {
        await m.CantinaDetalleVenta.create({
          venta_id: venta.id, producto_id: c.producto_id, nombre_producto: c.nombre_producto,
          cantidad: Number(c.cantidad), precio_unitario: Number(c.precio_unitario), descuento_linea: 0, subtotal: Number(c.subtotal),
        }, { transaction: t });
      }
    }
    const aprobadas = grupo.filter(o => o.id === orden.id || o.estado === 'aprobado');
    await booking.update({
      cobrado: true, cobrado_at: new Date(), metodo_pago: 'mercadopago',
      cobro_detalle: {
        via: 'jugahoy_pay', grupo: orden.grupo, jugadores: aprobadas.length,
        total: aprobadas.reduce((a, o) => a + Number(o.importe), 0),
        pagos: aprobadas.map(o => ({ nombre: o.cliente_nombre, importe: Number(o.importe), token: o.token, pagado: true, metodo: o.id === orden.id ? metodo : o.metodo })),
      },
    }, { transaction: t });
  },
  async onReembolsado(orden, { transaction: t, monto, metodo }) {
    await egresoCaja(orden, monto, { transaction: t, metodo });
  },
});

/** Cuota de escuela: usa el registro de pago existente (marca la cuota pagada + ingreso en caja). */
registrarHandler('escuela', {
  categoriaCaja: 'escuela',
  async onAprobado(orden, pago, { transaction: t, metodo }) {
    const m = require('../../models');
    if (orden.referencia_tipo !== 'escuela_pago' || !orden.referencia_id) return ingresoCaja(orden, Number(pago.monto), { transaction: t, metodo });
    const cuota = await m.EscuelaPago.findByPk(orden.referencia_id, { transaction: t, lock: t.LOCK.UPDATE });
    const alumno = cuota && await m.EscuelaAlumno.findByPk(cuota.alumno_id, { attributes: ['nombre'], transaction: t });
    if (!cuota || cuota.estado === 'pagado') return;
    await cuota.update({ estado: 'pagado', fecha_pago: new Date().toISOString().slice(0, 10), metodo_pago: metodoCaja(metodo), comprobante: `PAY-${orden.token.slice(0, 8).toUpperCase()}` }, { transaction: t });
    await ingresoCaja(orden, Number(pago.monto), { transaction: t, metodo, concepto: `Escuela: cuota ${cuota.periodo} · ${alumno?.nombre || orden.cliente_nombre || ''} (Jugahoy Pay)` });
  },
  async onReembolsado(orden, { transaction: t, monto, metodo }) {
    const m = require('../../models');
    if (orden.referencia_tipo === 'escuela_pago') await m.EscuelaPago.update({ estado: 'pendiente', fecha_pago: null, metodo_pago: null, comprobante: null }, { where: { id: orden.referencia_id }, transaction: t });
    await egresoCaja(orden, monto, { transaction: t, metodo });
  },
});

/**
 * Saldo de cuenta corriente (Modo 9): el pago cancela las órdenes pendientes que incluía.
 * Cada una se marca aprobada y ejecuta el handler de SU módulo (caja, turno, cuota…).
 */
registrarHandler('cuenta', {
  categoriaCaja: 'otros',
  async onAprobado(orden, pago, ctx) {
    const m = require('../../models');
    const ids = orden.metadata?.ordenes || [];
    if (!ids.length) return ingresoCaja(orden, Number(pago.monto), ctx);
    const incluidas = await m.PayOrder.findAll({ where: { id: ids, complex_id: orden.complex_id, estado: ['pendiente', 'parcial', 'rechazado', 'vencido'] }, transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
    for (const o of incluidas) {
      const saldo = Math.round((Number(o.importe) - Number(o.importe_pagado)) * 100) / 100;
      await o.update({ estado: 'aprobado', importe_pagado: o.importe, pagado_at: new Date(), metodo: ctx.metodo }, { transaction: ctx.transaction });
      await m.PayEvent.create({ order_id: o.id, tipo: 'cubierta_por_saldo', estado_anterior: o.previous('estado'), estado_nuevo: 'aprobado', origen: ctx.origen || 'sistema', datos: { orden_saldo: orden.token, monto: saldo } }, { transaction: ctx.transaction });
      const h = handlerDe(o.modulo);
      if (h.onAprobado) await h.onAprobado(o, { monto: saldo }, ctx);
      else await ingresoCaja(o, saldo, ctx);
    }
  },
});

module.exports = { registrarHandler, handlerDe, ingresoCaja, egresoCaja };
