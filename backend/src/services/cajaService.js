'use strict';
/**
 * services/cajaService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integración de la Cantina y los turnos con la caja diaria existente
 * (cash_registers / cash_transactions).
 *
 *  - Cada venta/compra de cantina intenta registrarse como transacción en la
 *    caja ABIERTA del complejo (best-effort: si no hay caja abierta, la operación
 *    igual se concreta y queda registrada en las tablas de cantina).
 *  - El "resumen de caja" combina: ingresos de cantina + ingresos de turnos
 *    (confirmados; los "no asistido" NO suman) − egresos.
 */
const { Op } = require('sequelize');
const { CashRegister, CashTransaction, CantinaVenta, Booking, Field, sequelize } = require('../models');

// La caja acepta estos métodos; 'billetera' de cantina se mapea a 'mercadopago'.
function metodoCaja(m) {
  if (m === 'billetera') return 'mercadopago';
  return ['efectivo', 'transferencia', 'mercadopago', 'tarjeta'].includes(m) ? m : 'efectivo';
}

/** Caja abierta del complejo (o null). */
async function cajaAbierta(complexId, transaction) {
  return CashRegister.findOne({ where: { complex_id: complexId, estado: 'abierta' }, transaction });
}

/**
 * Registra una transacción en la caja abierta (best-effort).
 * @returns {CashTransaction|null} la transacción creada, o null si no había caja abierta.
 */
async function registrarEnCaja(complexId, { tipo, concepto, monto, metodo_pago, categoria, usuario_id, agenda_id, notas }, transaction) {
  const caja = await cajaAbierta(complexId, transaction);
  if (!caja) return null;
  return CashTransaction.create({
    cash_register_id: caja.id,
    tipo,
    concepto,
    monto,
    metodo_pago: metodoCaja(metodo_pago),
    categoria: categoria || null,
    agenda_id: agenda_id || null,
    usuario_id: usuario_id || null,
    notas: notas || null,
  }, { transaction });
}

/**
 * Resumen de la caja diaria: ingresos de cantina + turnos − egresos.
 * Los turnos "no asistido" (y cancelados/rechazados) NO se suman a los ingresos.
 */
async function resumenCaja(complexId, { desde, hasta } = {}) {
  const rangoFecha = (col) => {
    const f = {};
    if (desde) f[Op.gte] = desde;
    if (hasta) f[Op.lte] = hasta;
    return (desde || hasta) ? { [col]: f } : {};
  };

  // Ingresos de cantina (ventas completadas)
  const ventaWhere = { complex_id: complexId, estado: 'completada', ...rangoFecha('fecha') };
  const ingresosCantina = parseFloat(await CantinaVenta.sum('total', { where: ventaWhere }) || 0);

  // Ingresos de turnos: solo confirmados (los "no asistido" NO suman)
  const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
  const fieldIds = fields.map(f => f.id);
  let ingresosTurnos = 0;
  if (fieldIds.length) {
    const turnoWhere = { field_id: { [Op.in]: fieldIds }, estado: 'confirmado', ...rangoFecha('fecha') };
    ingresosTurnos = parseFloat(await Booking.sum('monto', { where: turnoWhere }) || 0);
  }

  // Egresos (compras de cantina + egresos manuales) registrados en la caja del complejo
  const cajas = await CashRegister.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
  const cajaIds = cajas.map(c => c.id);
  let egresos = 0;
  if (cajaIds.length) {
    const egWhere = { cash_register_id: { [Op.in]: cajaIds }, tipo: 'egreso', ...rangoFecha('fecha') };
    egresos = parseFloat(await CashTransaction.sum('monto', { where: egWhere }) || 0);
  }

  const ingresos = ingresosCantina + ingresosTurnos;
  return {
    ingresos_cantina: ingresosCantina,
    ingresos_turnos:  ingresosTurnos,
    ingresos_total:   ingresos,
    egresos,
    neto: ingresos - egresos,
  };
}

module.exports = { cajaAbierta, registrarEnCaja, resumenCaja };
