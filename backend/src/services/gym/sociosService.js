'use strict';
/**
 * services/gym/sociosService.js — Socios, historial, apto médico, QR y control de acceso.
 */
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const {
  sequelize, GymSocio, GymSocioHistorial, GymAptoMedico, GymMembresia, GymPlan, GymPago, GymAcceso, GymAsistencia,
  GymConfig, GymSucursal, Complex, Notification,
} = require('../../models');
const { constantes } = require('../../models/gym');
const { httpError, campos, todayAR, nombreCompleto } = require('./comun');
const { nowAR } = require('../../utils/time');
const { frontendUrl } = require('../../config/urls');

const SPEC = {
  nombre: { req: true, max: 100, label: 'Nombre' }, apellido: { req: true, max: 100, label: 'Apellido' },
  dni: { req: true, max: 15, label: 'DNI' }, fecha_nacimiento: { tipo: 'fecha', label: 'Fecha de nacimiento' },
  sexo: { tipo: 'enum', valores: ['F', 'M', 'X'], label: 'Sexo' }, sucursal_id: { tipo: 'int', label: 'Sucursal' },
  foto_url: { max: 255 }, direccion: { max: 200 }, localidad: { max: 100 }, provincia: { max: 100 },
  telefono: { max: 30 }, whatsapp: { max: 30 }, email: { tipo: 'email', label: 'Email' },
  emergencia_nombre: { max: 150 }, emergencia_telefono: { max: 30 }, obra_social: { max: 100 }, observaciones: { max: 2000 },
};

async function config(complexId) {
  const [c] = await GymConfig.findOrCreate({ where: { complex_id: complexId }, defaults: { complex_id: complexId } });
  return c;
}

async function historial(complexId, socioId, tipo, descripcion, usuarioId = null, transaction) {
  return GymSocioHistorial.create({ complex_id: complexId, socio_id: socioId, tipo, descripcion: String(descripcion).slice(0, 255), usuario_id: usuarioId }, { transaction });
}

/** Código numérico corto y único por complejo (acceso por teclado). */
async function codigoUnico(complexId) {
  for (let i = 0; i < 20; i++) {
    const codigo = String(crypto.randomInt(100000, 999999));
    if (!(await GymSocio.count({ where: { complex_id: complexId, codigo } }))) return codigo;
  }
  throw httpError(500, 'No se pudo generar un código de socio.');
}

async function validarSucursal(complexId, sucursalId) {
  if (!sucursalId) return;
  if (!(await GymSucursal.count({ where: { id: sucursalId, complex_id: complexId } }))) throw httpError(400, 'La sucursal no pertenece a este complejo.');
}

async function obtener(complexId, id, opts = {}) {
  const s = await GymSocio.findOne({ where: { id, complex_id: complexId }, ...opts });
  if (!s) throw httpError(404, 'Socio no encontrado.');
  return s;
}

async function crear(complexId, body, usuarioId) {
  const data = campos(body, SPEC);
  data.dni = data.dni.replace(/\D/g, '');
  if (data.dni.length < 6) throw httpError(400, 'DNI inválido.');
  await validarSucursal(complexId, data.sucursal_id);
  if (await GymSocio.count({ where: { complex_id: complexId, dni: data.dni } })) throw httpError(409, 'Ya existe un socio con ese DNI.');
  return sequelize.transaction(async (t) => {
    const socio = await GymSocio.create({
      ...data, complex_id: complexId, estado: 'activo', fecha_alta: todayAR(),
      codigo: await codigoUnico(complexId), qr_token: crypto.randomBytes(24).toString('hex'),
    }, { transaction: t });
    await historial(complexId, socio.id, 'alta', 'Alta de socio', usuarioId, t);
    return socio;
  });
}

async function actualizar(complexId, id, body, usuarioId) {
  const socio = await obtener(complexId, id);
  const data = campos(body, SPEC, { parcial: true });
  if (data.dni) {
    data.dni = data.dni.replace(/\D/g, '');
    if (data.dni !== socio.dni && await GymSocio.count({ where: { complex_id: complexId, dni: data.dni, id: { [Op.ne]: id } } })) throw httpError(409, 'Ya existe un socio con ese DNI.');
  }
  await validarSucursal(complexId, data.sucursal_id);
  await socio.update(data);
  await historial(complexId, id, 'otro', 'Datos personales actualizados', usuarioId);
  return socio;
}

/** Cambio de estado (activo, suspendido, moroso, baja, congelado) con motivo e historial. */
async function cambiarEstado(complexId, id, { estado, motivo }, usuarioId) {
  if (!constantes.ESTADOS_SOCIO.includes(estado)) throw httpError(400, `Estado inválido. Valores: ${constantes.ESTADOS_SOCIO.join(', ')}.`);
  const socio = await obtener(complexId, id);
  if (socio.estado === estado) return socio;
  const anterior = socio.estado;
  return sequelize.transaction(async (t) => {
    await socio.update({ estado, fecha_baja: estado === 'baja' ? todayAR() : (anterior === 'baja' ? null : socio.fecha_baja) }, { transaction: t });
    // Congelar/descongelar arrastra la membresía vigente
    if (estado === 'congelado') await GymMembresia.update({ estado: 'congelada' }, { where: { socio_id: id, estado: 'vigente' }, transaction: t });
    if (anterior === 'congelado') await GymMembresia.update({ estado: 'vigente' }, { where: { socio_id: id, estado: 'congelada', fecha_fin: { [Op.gte]: todayAR() } }, transaction: t });
    const tipo = estado === 'baja' ? 'baja' : (anterior === 'baja' ? 'alta' : 'estado');
    await historial(complexId, id, tipo, `Estado: ${anterior} → ${estado}${motivo ? ` (${motivo})` : ''}`, usuarioId, t);
    return socio;
  });
}

/** Listado paginado con filtros (texto, estado, sucursal) y datos de vencimiento. */
async function listar(complexId, q = {}) {
  const where = { complex_id: complexId };
  if (q.estado) {
    const estados = String(q.estado).split(',');
    if (estados.some(e => !constantes.ESTADOS_SOCIO.includes(e))) throw httpError(400, 'Estado inválido.');
    where.estado = estados;
  }
  if (q.sucursal_id) where.sucursal_id = Number(q.sucursal_id);
  if (q.q) {
    const like = `%${String(q.q).trim()}%`;
    where[Op.or] = [{ nombre: { [Op.like]: like } }, { apellido: { [Op.like]: like } }, { dni: { [Op.like]: like } }, { codigo: String(q.q).trim() }];
  }
  const limite = Math.min(Number(q.limite) || 50, 200);
  const pagina = Math.max(Number(q.pagina) || 1, 1);
  const { rows, count } = await GymSocio.findAndCountAll({
    where, order: [['apellido', 'ASC'], ['nombre', 'ASC']], limit: limite, offset: (pagina - 1) * limite,
    attributes: { exclude: ['qr_token'] },
  });
  // Vencimientos en una sola consulta (sin N+1)
  const ids = rows.map(s => s.id);
  const vencs = ids.length ? await GymMembresia.findAll({
    where: { socio_id: ids, estado: ['vigente', 'congelada'] },
    attributes: ['socio_id', [sequelize.fn('MAX', sequelize.col('fecha_fin')), 'vence']], group: ['socio_id'], raw: true,
  }) : [];
  const venceDe = Object.fromEntries(vencs.map(v => [v.socio_id, v.vence]));
  return { total: count, pagina, limite, socios: rows.map(s => ({ ...s.toJSON(), vence: venceDe[s.id] || null })) };
}

/** Estado de cuenta: total de membresías − pagos no anulados. */
async function cuentaCorriente(socioId) {
  const [[deb], [cred]] = await Promise.all([
    sequelize.query('SELECT COALESCE(SUM(total),0) t FROM gym_membresias WHERE socio_id = ? AND estado <> "cancelada"', { replacements: [socioId], type: sequelize.QueryTypes.SELECT }).then(r => [r[0]]),
    sequelize.query('SELECT COALESCE(SUM(monto),0) t FROM gym_pagos WHERE socio_id = ? AND anulado = 0', { replacements: [socioId], type: sequelize.QueryTypes.SELECT }).then(r => [r[0]]),
  ]);
  const debe = Number(deb.t), pagado = Number(cred.t);
  return { debe, pagado, saldo: Math.round((debe - pagado) * 100) / 100 };
}

/** Ficha completa del socio (para el panel y el portal). */
async function ficha(complexId, id) {
  const socio = await obtener(complexId, id, { include: [{ model: GymSucursal, as: 'sucursal', attributes: ['id', 'nombre'] }] });
  const [membresias, pagos, aptos, hist, cuenta] = await Promise.all([
    GymMembresia.findAll({ where: { socio_id: id }, include: [{ model: GymPlan, as: 'plan', attributes: ['id', 'nombre', 'tipo', 'periodo'] }], order: [['fecha_fin', 'DESC']], limit: 24 }),
    GymPago.findAll({ where: { socio_id: id }, order: [['fecha', 'DESC'], ['id', 'DESC']], limit: 50 }),
    GymAptoMedico.findAll({ where: { socio_id: id }, order: [['fecha_vencimiento', 'DESC']] }),
    GymSocioHistorial.findAll({ where: { socio_id: id }, order: [['created_at', 'DESC']], limit: 100 }),
    cuentaCorriente(id),
  ]);
  const hoy = todayAR();
  const vigente = membresias.find(m => m.estado === 'vigente' && m.fecha_inicio <= hoy && m.fecha_fin >= hoy) || null;
  const apto = aptos[0] || null;
  return { socio, vigente, membresias, pagos, aptos, apto_vigente: !!apto && apto.fecha_vencimiento >= hoy, historial: hist, cuenta };
}

async function registrarApto(complexId, socioId, body, usuarioId) {
  await obtener(complexId, socioId);
  const data = campos(body, {
    fecha_emision: { req: true, tipo: 'fecha', label: 'Fecha de emisión' }, fecha_vencimiento: { req: true, tipo: 'fecha', label: 'Vencimiento' },
    profesional: { max: 150 }, archivo_url: { max: 255 }, observaciones: { max: 255 },
  });
  if (data.fecha_vencimiento < data.fecha_emision) throw httpError(400, 'El vencimiento no puede ser anterior a la emisión.');
  const apto = await GymAptoMedico.create({ ...data, socio_id: socioId });
  await historial(complexId, socioId, 'apto', `Apto médico cargado (vence ${data.fecha_vencimiento})`, usuarioId);
  return apto;
}

/** QR del socio (data URL) + link a su app. */
async function qr(complexId, id) {
  const socio = await obtener(complexId, id);
  const link = frontendUrl(`/gym/socio/${socio.qr_token}`);
  return { codigo: socio.codigo, link, qr: await QRCode.toDataURL(`GYM:${socio.qr_token}`, { margin: 1, width: 320 }) };
}

// ── Control de acceso ───────────────────────────────────────────────────────

/** Busca el socio por el dato leído/ingresado. */
async function buscarParaAcceso(complexId, metodo, dato) {
  const v = String(dato || '').trim();
  if (!v) return null;
  if (metodo === 'qr') return GymSocio.findOne({ where: { complex_id: complexId, qr_token: v.replace(/^GYM:/, '') } });
  if (metodo === 'codigo') return GymSocio.findOne({ where: { complex_id: complexId, codigo: v } });
  if (metodo === 'dni') return GymSocio.findOne({ where: { complex_id: complexId, dni: v.replace(/\D/g, '') } });
  if (metodo === 'manual') return GymSocio.findOne({ where: { complex_id: complexId, id: Number(v) || 0 } });
  return null;
}

/**
 * Evalúa si el socio puede ingresar: estado activo, plan vigente, cuota al día,
 * apto médico vigente (si se exige) y franja horaria del plan.
 */
async function evaluarAcceso(complexId, socio, ahora = nowAR()) {
  const motivos = [];
  if (socio.estado !== 'activo') motivos.push(`Socio ${socio.estado}`);
  const hoy = ahora.date;
  const memb = await GymMembresia.findOne({
    where: { socio_id: socio.id, estado: 'vigente', fecha_inicio: { [Op.lte]: hoy }, fecha_fin: { [Op.gte]: hoy } },
    include: [{ model: GymPlan, as: 'plan' }], order: [['fecha_fin', 'DESC']],
  });
  if (!memb) motivos.push('Sin plan vigente');
  else {
    const p = memb.plan;
    if (p?.hora_desde && p?.hora_hasta && (ahora.time < p.hora_desde || ahora.time > p.hora_hasta)) motivos.push(`Plan habilitado de ${p.hora_desde} a ${p.hora_hasta}`);
  }
  const cuenta = await cuentaCorriente(socio.id);
  if (cuenta.saldo > 0.009) motivos.push(`Cuota adeudada ($${cuenta.saldo.toLocaleString('es-AR')})`);
  const cfg = await config(complexId);
  if (cfg.exigir_apto_medico) {
    const apto = await GymAptoMedico.findOne({ where: { socio_id: socio.id, fecha_vencimiento: { [Op.gte]: hoy } } });
    if (!apto) motivos.push('Apto médico vencido o faltante');
  }
  return { permitido: motivos.length === 0, motivos, membresia: memb, cuenta };
}

/** Notifica al dueño del complejo un ingreso bloqueado (in-app, best-effort). */
async function notificarBloqueo(complexId, texto) {
  try {
    const c = await Complex.findByPk(complexId, { attributes: ['owner_id'] });
    if (c?.owner_id) await Notification.create({ user_id: c.owner_id, tipo: 'gym_alerta', titulo: 'Gym: ingreso bloqueado ⛔', mensaje: texto.slice(0, 250) });
  } catch (err) { console.error('[gym][acceso] notificación:', err.message); }
}

/**
 * Registra un intento de ingreso. Si cumple todo → permitido + asistencia del día.
 * Si no → denegado, se registra el intento y se notifica al administrador.
 */
async function registrarAcceso(complexId, { metodo, dato, sucursal_id }, usuarioId) {
  if (!['qr', 'codigo', 'dni', 'manual'].includes(metodo)) throw httpError(400, 'Método de ingreso inválido (qr, codigo, dni, manual).');
  const socio = await buscarParaAcceso(complexId, metodo, dato);
  const ahora = nowAR();
  const base = { complex_id: complexId, sucursal_id: sucursal_id || socio?.sucursal_id || null, metodo, usuario_id: usuarioId };
  if (!socio) {
    await GymAcceso.create({ ...base, dato: String(dato || '').slice(0, 64), resultado: 'denegado', motivo: 'Socio no encontrado' });
    console.warn(`[gym][acceso] complejo ${complexId}: ${metodo} "${String(dato).slice(0, 12)}" → socio no encontrado`);
    return { permitido: false, motivos: ['Socio no encontrado'], socio: null };
  }
  const ev = await evaluarAcceso(complexId, socio, ahora);
  await GymAcceso.create({ ...base, socio_id: socio.id, resultado: ev.permitido ? 'permitido' : 'denegado', motivo: ev.motivos.join(' · ') || null });
  if (ev.permitido) {
    // Una asistencia de "ingreso" por día y socio
    const ya = await GymAsistencia.count({ where: { socio_id: socio.id, fecha: ahora.date, origen: 'acceso' } });
    if (!ya) await GymAsistencia.create({ complex_id: complexId, sucursal_id: base.sucursal_id, socio_id: socio.id, fecha: ahora.date, hora: ahora.time, origen: 'acceso' });
  } else {
    console.warn(`[gym][acceso] complejo ${complexId}: ${nombreCompleto(socio)} DENEGADO → ${ev.motivos.join(' · ')}`);
    notificarBloqueo(complexId, `${nombreCompleto(socio)} (DNI ${socio.dni}) intentó ingresar: ${ev.motivos.join(' · ')}.`);
  }
  return {
    permitido: ev.permitido, motivos: ev.motivos,
    socio: { id: socio.id, nombre: socio.nombre, apellido: socio.apellido, dni: socio.dni, foto_url: socio.foto_url, estado: socio.estado },
    vence: ev.membresia?.fecha_fin || null, plan: ev.membresia?.plan?.nombre || null, saldo: ev.cuenta.saldo,
  };
}

async function listarAccesos(complexId, q = {}) {
  const where = { complex_id: complexId };
  const fecha = q.fecha || todayAR();
  where.created_at = { [Op.between]: [`${fecha} 00:00:00`, `${fecha} 23:59:59`] };
  if (q.resultado) where.resultado = q.resultado;
  return GymAcceso.findAll({ where, include: [{ model: GymSocio, as: 'socio', attributes: ['id', 'nombre', 'apellido', 'dni'] }], order: [['created_at', 'DESC']], limit: 300 });
}

module.exports = {
  config, historial, obtener, crear, actualizar, cambiarEstado, listar, cuentaCorriente, ficha, registrarApto, qr,
  evaluarAcceso, registrarAcceso, listarAccesos, buscarParaAcceso,
};
