'use strict';
/**
 * services/gym/cobranzasService.js — Membresías (alta/renovación), pagos con recibo,
 * cuenta corriente, morosos y alertas de vencimiento. Los pagos entran a la caja
 * abierta del complejo (services/cajaService.registrarEnCaja), igual que la Cantina.
 */
const { Op } = require('sequelize');
const { sequelize, GymMembresia, GymPlan, GymPago, GymSocio, GymConfig } = require('../../models');
const { constantes } = require('../../models/gym');
const { registrarEnCaja } = require('../cajaService');
const socios = require('./sociosService');
const { httpError, campos, todayAR, sumarDias, finDePeriodo, nombreCompleto } = require('./comun');

const r2 = (n) => Math.round(Number(n) * 100) / 100;
// Medios del gym → métodos de la caja (débito/crédito = tarjeta)
const METODO_CAJA = { efectivo: 'efectivo', transferencia: 'transferencia', debito: 'tarjeta', credito: 'tarjeta', mercadopago: 'mercadopago' };

/**
 * Asigna un plan al socio (alta o renovación). La nueva membresía empieza hoy, o al
 * día siguiente del vencimiento de la vigente si se renueva por adelantado.
 */
async function asignarPlan(complexId, socioId, body, usuarioId) {
  const data = campos(body, { plan_id: { req: true, tipo: 'int', label: 'Plan' }, fecha_inicio: { tipo: 'fecha', label: 'Inicio' }, descuento: { tipo: 'num', label: 'Descuento' } });
  const socio = await socios.obtener(complexId, socioId);
  if (socio.estado === 'baja') throw httpError(409, 'El socio está dado de baja: reactivalo antes de asignar un plan.');
  const plan = await GymPlan.findOne({ where: { id: data.plan_id, complex_id: complexId, activo: true } });
  if (!plan) throw httpError(404, 'Plan no encontrado o inactivo.');

  const hoy = todayAR();
  const vigente = await GymMembresia.findOne({ where: { socio_id: socioId, estado: 'vigente', fecha_fin: { [Op.gte]: hoy } }, order: [['fecha_fin', 'DESC']] });
  const inicio = data.fecha_inicio || (vigente ? sumarDias(vigente.fecha_fin, 1) : hoy);
  const precio = r2(plan.precio);
  const descuento = r2(data.descuento ?? (precio * Number(plan.descuento_pct || 0)) / 100);
  if (descuento > precio) throw httpError(400, 'El descuento no puede superar el precio.');

  return sequelize.transaction(async (t) => {
    const m = await GymMembresia.create({
      complex_id: complexId, socio_id: socioId, plan_id: plan.id, fecha_inicio: inicio, fecha_fin: finDePeriodo(inicio, plan.periodo),
      precio, descuento, total: r2(precio - descuento), estado: 'vigente', renovacion_de_id: vigente?.id || null, usuario_id: usuarioId,
    }, { transaction: t });
    await socios.historial(complexId, socioId, vigente ? 'renovacion' : 'plan', `${vigente ? 'Renovación' : 'Plan asignado'}: ${plan.nombre} (${inicio} a ${m.fecha_fin}) · $${m.total}`, usuarioId, t);
    // Un moroso que vuelve a tener plan queda activo si no debe nada (se reevalúa al pagar)
    return m;
  });
}

async function cancelarMembresia(complexId, membresiaId, usuarioId) {
  const m = await GymMembresia.findOne({ where: { id: membresiaId, complex_id: complexId } });
  if (!m) throw httpError(404, 'Membresía no encontrada.');
  if (m.estado === 'cancelada') return m;
  const pagado = await GymPago.sum('monto', { where: { membresia_id: m.id, anulado: false } });
  if (pagado > 0) throw httpError(409, 'La membresía tiene pagos: anulá los pagos antes de cancelarla.');
  await m.update({ estado: 'cancelada' });
  await socios.historial(complexId, m.socio_id, 'plan', `Membresía #${m.id} cancelada`, usuarioId);
  return m;
}

/** Número de recibo correlativo por complejo (con bloqueo de la fila de config). */
async function siguienteRecibo(complexId, t) {
  await GymConfig.findOrCreate({ where: { complex_id: complexId }, defaults: { complex_id: complexId }, transaction: t });
  const cfg = await GymConfig.findByPk(complexId, { transaction: t, lock: t.LOCK.UPDATE });
  const n = cfg.proximo_recibo;
  await cfg.update({ proximo_recibo: n + 1 }, { transaction: t });
  return `${cfg.recibo_prefijo}-${String(n).padStart(8, '0')}`;
}

/** Registra un pago (opcionalmente imputado a una membresía), genera recibo y lo pasa a caja. */
async function registrarPago(complexId, socioId, body, usuarioId) {
  const data = campos(body, {
    monto: { req: true, tipo: 'num', label: 'Monto' }, metodo: { req: true, tipo: 'enum', valores: constantes.METODOS_PAGO, label: 'Medio de pago' },
    membresia_id: { tipo: 'int' }, concepto: { max: 200 }, fecha: { tipo: 'fecha' }, sucursal_id: { tipo: 'int' },
  });
  if (data.monto <= 0) throw httpError(400, 'El monto debe ser mayor a 0.');
  const socio = await socios.obtener(complexId, socioId);
  let memb = null;
  if (data.membresia_id) {
    memb = await GymMembresia.findOne({ where: { id: data.membresia_id, socio_id: socioId }, include: [{ model: GymPlan, as: 'plan', attributes: ['nombre'] }] });
    if (!memb) throw httpError(404, 'Membresía no encontrada para este socio.');
  }
  const concepto = data.concepto || (memb ? `Cuota ${memb.plan?.nombre || ''} ${memb.fecha_inicio} a ${memb.fecha_fin}`.trim() : 'Pago a cuenta');

  const pago = await sequelize.transaction(async (t) => {
    const numero = await siguienteRecibo(complexId, t);
    const p = await GymPago.create({
      complex_id: complexId, socio_id: socioId, membresia_id: memb?.id || null, numero_recibo: numero, concepto,
      monto: r2(data.monto), metodo: data.metodo, fecha: data.fecha || todayAR(), usuario_id: usuarioId, sucursal_id: data.sucursal_id || socio.sucursal_id || null,
    }, { transaction: t });
    const tx = await registrarEnCaja(complexId, {
      tipo: 'ingreso', concepto: `Gym ${numero} · ${nombreCompleto(socio)} · ${concepto}`.slice(0, 250), monto: p.monto,
      metodo_pago: METODO_CAJA[data.metodo], categoria: 'gym', usuario_id: usuarioId,
    }, t);
    if (tx) await p.update({ cash_transaction_id: tx.id }, { transaction: t });
    await socios.historial(complexId, socioId, 'pago', `Pago ${numero}: $${p.monto} (${data.metodo})${tx ? '' : ' · sin caja abierta'}`, usuarioId, t);
    return p;
  });
  // Moroso que salda su deuda → vuelve a activo
  const cuenta = await socios.cuentaCorriente(socioId);
  if (socio.estado === 'moroso' && cuenta.saldo <= 0.009) await socios.cambiarEstado(complexId, socioId, { estado: 'activo', motivo: 'deuda saldada' }, usuarioId);
  return { pago, cuenta, en_caja: !!pago.cash_transaction_id };
}

/** Anula un pago (requiere permiso "aprobar"). Si entró a caja, registra el egreso compensatorio. */
async function anularPago(complexId, pagoId, motivo, usuarioId) {
  const p = await GymPago.findOne({ where: { id: pagoId, complex_id: complexId } });
  if (!p) throw httpError(404, 'Pago no encontrado.');
  if (p.anulado) return p;
  await sequelize.transaction(async (t) => {
    await p.update({ anulado: true }, { transaction: t });
    if (p.cash_transaction_id) {
      await registrarEnCaja(complexId, { tipo: 'egreso', concepto: `Anulación recibo gym ${p.numero_recibo}${motivo ? ` (${motivo})` : ''}`.slice(0, 250), monto: p.monto, metodo_pago: 'efectivo', categoria: 'gym', usuario_id: usuarioId }, t);
    }
    await socios.historial(complexId, p.socio_id, 'pago', `Recibo ${p.numero_recibo} anulado${motivo ? `: ${motivo}` : ''}`, usuarioId, t);
  });
  return p;
}

async function recibo(complexId, pagoId) {
  const p = await GymPago.findOne({ where: { id: pagoId, complex_id: complexId }, include: [{ model: GymSocio, as: 'socio', attributes: ['nombre', 'apellido', 'dni', 'codigo'] }, { model: GymMembresia, as: 'membresia' }] });
  if (!p) throw httpError(404, 'Pago no encontrado.');
  return p;
}

async function listarPagos(complexId, q = {}) {
  const where = { complex_id: complexId };
  where.fecha = { [Op.between]: [q.desde || sumarDias(todayAR(), -30), q.hasta || todayAR()] };
  if (q.metodo) where.metodo = q.metodo;
  if (q.socio_id) where.socio_id = Number(q.socio_id);
  if (q.anulados !== '1') where.anulado = false;
  const pagos = await GymPago.findAll({ where, include: [{ model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido', 'dni'] }], order: [['fecha', 'DESC'], ['id', 'DESC']], limit: 1000 });
  const total = r2(pagos.filter(p => !p.anulado).reduce((s, p) => s + Number(p.monto), 0));
  const porMetodo = pagos.filter(p => !p.anulado).reduce((m, p) => ({ ...m, [p.metodo]: r2((m[p.metodo] || 0) + Number(p.monto)) }), {});
  return { pagos, total, por_metodo: porMetodo };
}

/** Socios con saldo deudor (una consulta agregada). */
async function morosos(complexId) {
  const filas = await sequelize.query(`
    SELECT s.id, s.nombre, s.apellido, s.dni, s.whatsapp, s.telefono, s.estado,
           COALESCE(d.debe, 0) - COALESCE(p.pagado, 0) AS saldo, d.ultimo_vencimiento
    FROM gym_socios s
    LEFT JOIN (SELECT socio_id, SUM(total) debe, MAX(fecha_fin) ultimo_vencimiento FROM gym_membresias WHERE estado <> 'cancelada' GROUP BY socio_id) d ON d.socio_id = s.id
    LEFT JOIN (SELECT socio_id, SUM(monto) pagado FROM gym_pagos WHERE anulado = 0 GROUP BY socio_id) p ON p.socio_id = s.id
    WHERE s.complex_id = :c AND s.estado <> 'baja' AND COALESCE(d.debe, 0) - COALESCE(p.pagado, 0) > 0.009
    ORDER BY saldo DESC`, { replacements: { c: complexId }, type: sequelize.QueryTypes.SELECT });
  return filas.map(f => ({ ...f, saldo: r2(f.saldo) }));
}

/** Alertas: vence hoy, vence mañana, vencidos sin renovar (últimos 15 días) y morosos. */
async function alertas(complexId) {
  const hoy = todayAR(), manana = sumarDias(hoy, 1);
  const inc = [{ model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido', 'dni', 'whatsapp', 'estado'] }, { model: GymPlan, as: 'plan', attributes: ['nombre'] }];
  const [venceHoy, venceManana, vencidas, deudores] = await Promise.all([
    GymMembresia.findAll({ where: { complex_id: complexId, estado: 'vigente', fecha_fin: hoy }, include: inc }),
    GymMembresia.findAll({ where: { complex_id: complexId, estado: 'vigente', fecha_fin: manana }, include: inc }),
    GymMembresia.findAll({ where: { complex_id: complexId, estado: 'vencida', fecha_fin: { [Op.between]: [sumarDias(hoy, -15), sumarDias(hoy, -1)] } }, include: inc }),
    morosos(complexId),
  ]);
  // Vencidas que ya tienen una renovación posterior no son alerta
  const renovados = new Set((await GymMembresia.findAll({ where: { complex_id: complexId, estado: 'vigente', fecha_fin: { [Op.gte]: hoy } }, attributes: ['socio_id'], raw: true })).map(r => r.socio_id));
  return {
    vence_hoy: venceHoy, vence_manana: venceManana,
    vencidos: vencidas.filter(m => !renovados.has(m.socio_id) && m.socio?.estado !== 'baja'),
    morosos: deudores,
  };
}

/**
 * Mantenimiento periódico (scheduler): membresías vencidas → 'vencida';
 * socios activos sin plan vigente y con deuda pasados los días de gracia → 'moroso'.
 */
async function procesarVencimientos(complexId) {
  const hoy = todayAR();
  const [vencidas] = await GymMembresia.update({ estado: 'vencida' }, { where: { complex_id: complexId, estado: 'vigente', fecha_fin: { [Op.lt]: hoy } } });
  const cfg = await socios.config(complexId);
  const limite = sumarDias(hoy, -cfg.dias_gracia);
  let morososN = 0;
  for (const d of await morosos(complexId)) {
    if (d.estado !== 'activo' || !d.ultimo_vencimiento || d.ultimo_vencimiento >= limite) continue;
    await socios.cambiarEstado(complexId, d.id, { estado: 'moroso', motivo: `deuda $${d.saldo} con ${cfg.dias_gracia} días de gracia vencidos` }, null);
    morososN++;
  }
  if (vencidas || morososN) console.log(`[gym][vencimientos] complejo ${complexId}: ${vencidas} membresía(s) vencida(s), ${morososN} socio(s) a moroso`);
  return { vencidas, morosos: morososN };
}

module.exports = { asignarPlan, cancelarMembresia, registrarPago, anularPago, recibo, listarPagos, morosos, alertas, procesarVencimientos };
