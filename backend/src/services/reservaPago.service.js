'use strict';
/**
 * services/reservaPago.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modalidades de pago de una reserva — ÚNICA fuente para web, panel y chatbot.
 *
 *   'complejo'  pagar en el complejo (offline): la reserva queda tomada y el turno
 *               figura como "paga en el complejo" hasta que se cobra en la agenda.
 *   'seña'      MercadoPago: monto de seña de la cancha (fields.sena_monto) o, si
 *               no tiene, el % del complejo (complexes.sena_porcentaje).
 *   'total'     MercadoPago: el precio completo del turno.
 *
 * Las opciones de MercadoPago se habilitan AUTOMÁTICAMENTE en todas las canchas
 * cuando el complejo tiene su cuenta conectada por OAuth (mercadopago_tokens,
 * estado 'conectado'). La preseleccionada es complexes.default_payment_option.
 *
 * El backend SIEMPRE calcula el monto (nunca se toma el que manda el cliente).
 */
const { Booking, Field, Complex } = require('../models');
const paymentService = require('./payment.service');
const mpOAuth = require('./mercadopagoOAuth.service');

const PUBLIC_URL     = () => process.env.PUBLIC_URL     || 'http://localhost:5173';
const PUBLIC_API_URL = () => process.env.PUBLIC_API_URL || 'http://localhost:3001';
const TIPOS = ['complejo', 'seña', 'total'];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const redondear = (n) => Math.round(n * 100) / 100;
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

/** Precio del turno según la cancha y la duración (precios_por_duracion o precio_base proporcional). */
function montoTurno(field, duracion) {
  const precios = field?.precios_por_duracion || {};
  if (precios[String(duracion)] != null && precios[String(duracion)] !== '') return num(precios[String(duracion)]);
  return redondear(num(field?.precio_base) * (Number(duracion) / 60));
}

/**
 * Seña de un turno: monto propio de la cancha o % del complejo. null = no hay seña configurada.
 * Nunca supera el total del turno.
 */
function montoSena(field, complex, total) {
  const propia = num(field?.sena_monto);
  if (propia > 0) return redondear(Math.min(propia, total));
  const pct = num(complex?.sena_porcentaje);
  if (pct > 0 && total > 0) return redondear(Math.min(total, total * pct / 100));
  return null;
}

/**
 * Opciones de pago para un turno.
 * @param {number} complexId
 * @param {object} field     instancia Field (con sena_monto, precios)
 * @param {number} total     precio del turno
 * @returns {Promise<{ mp_conectado, predeterminada, opciones: Array<{tipo, label, monto, disponible, motivo?}> }>}
 */
async function opcionesPago(complexId, field, total) {
  const [complex, mp] = await Promise.all([
    Complex.findByPk(complexId, { attributes: ['id', 'default_payment_option', 'sena_porcentaje'] }),
    mpOAuth.puedeCobrar(complexId),
  ]);
  const sena = montoSena(field, complex, total);
  const opciones = [
    { tipo: 'complejo', label: 'Pagar en el complejo', monto: redondear(total), disponible: true },
    {
      tipo: 'seña', label: 'Pagar seña con MercadoPago', monto: sena, disponible: mp && sena > 0,
      ...(!mp ? { motivo: 'MercadoPago no conectado' } : !(sena > 0) ? { motivo: 'Seña no configurada' } : {}),
    },
    {
      tipo: 'total', label: 'Pagar total con MercadoPago', monto: redondear(total), disponible: mp && total > 0,
      ...(!mp ? { motivo: 'MercadoPago no conectado' } : !(total > 0) ? { motivo: 'El turno no tiene precio' } : {}),
    },
  ];
  // Si la predeterminada no está disponible para ESTE turno, se cae a "en el complejo"
  const pref = complex?.default_payment_option || 'complejo';
  const predeterminada = opciones.find(o => o.tipo === pref && o.disponible) ? pref : 'complejo';
  return { mp_conectado: mp, predeterminada, opciones };
}

/**
 * Genera la preference de MercadoPago de una reserva (seña o total) y la deja
 * en 'pendiente_pago' (retiene el turno mientras paga).
 * Solo si el complejo tiene tokens OAuth válidos (accessTokenValido lanza si no).
 *
 * @param {number} reservaId
 * @param {'seña'|'total'} tipoPago
 * @param {{ playerId?: number }} [opts]
 * @returns {Promise<{ preference_id, init_point, sandbox_init_point, amount, tipo_pago }>}
 */
async function iniciarPagoReserva(reservaId, tipoPago, { playerId } = {}) {
  if (!['seña', 'total'].includes(tipoPago)) throw httpError(400, 'tipoPago debe ser "seña" o "total".');
  const booking = await Booking.findByPk(reservaId, {
    include: [{ model: Field, as: 'field', include: [{ model: Complex, as: 'complex', attributes: ['id', 'nombre', 'sena_porcentaje'] }] }],
  });
  if (!booking) throw httpError(404, 'Reserva no encontrada');
  // Ya pagada online, o liberada → no se vuelve a cobrar
  if (booking.mp_payment_id && booking.estado === 'confirmado') throw httpError(409, 'La reserva ya fue pagada con MercadoPago.');
  if (['cancelado', 'rechazado', 'no_asistido'].includes(booking.estado)) throw httpError(409, `La reserva está ${booking.estado}.`);
  if (booking.cobrado) throw httpError(409, 'El turno ya se cobró en el complejo.');

  const field = booking.field;
  const complex = field.complex;
  const accessToken = await mpOAuth.accessTokenValido(complex.id);   // 400 sin conexión · 401 revocado

  const total = num(booking.monto);
  const amount = tipoPago === 'seña' ? montoSena(field, complex, total) : redondear(total);
  if (!(amount > 0)) throw httpError(400, tipoPago === 'seña' ? 'La cancha no tiene seña configurada.' : 'La reserva no tiene un monto válido.', 'MONTO_INVALIDO');
  const label = tipoPago === 'seña' ? 'Seña del turno' : 'Total del turno';

  const pref = await paymentService.createPreference({
    accessToken,
    items: [{ id: `reserva-${booking.id}`, title: `${label} — ${field.nombre} (${booking.fecha} ${booking.hora_inicio})`, quantity: 1, unit_price: amount }],
    payer: { name: booking.nombre_cliente, email: booking.email_cliente || undefined },
    // Metadata para conciliar el payment con la reserva
    metadata: { reserva_id: booking.id, cancha_id: booking.field_id, player_id: booking.user_id || playerId || null, tipo_pago: tipoPago },
    backUrls: {
      success: `${PUBLIC_URL()}/reserva/exito?reserva_id=${booking.id}`,
      failure: `${PUBLIC_URL()}/reserva/error?reserva_id=${booking.id}`,
      pending: `${PUBLIC_URL()}/reserva/pendiente?reserva_id=${booking.id}`,
    },
    notificationUrl: `${PUBLIC_API_URL()}/api/payments/webhook?complex_id=${complex.id}`,
  });
  await booking.update({ estado: 'pendiente_pago', tipo_pago: tipoPago, metodo_pago: 'mercadopago' });
  return { preference_id: pref.preference_id, init_point: pref.init_point, sandbox_init_point: pref.sandbox_init_point, amount, tipo_pago: tipoPago };
}

module.exports = { TIPOS, montoTurno, montoSena, opcionesPago, iniciarPagoReserva };
