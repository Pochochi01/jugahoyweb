'use strict';
/**
 * utils/inasistencias.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bloqueo de jugadores reincidentes en inasistencias (por complejo):
 *   - 2 turnos "no asistido" en el MISMO mes, o
 *   - 3 turnos "no asistido" repartidos en 2 o más meses distintos.
 * En ambos casos se niega la posibilidad de agendar nuevos turnos.
 *
 * El match del jugador es por user_id y/o por los últimos 10 dígitos del teléfono
 * (formato-agnóstico), igual que en "Mis turnos".
 */
const { Op } = require('sequelize');
const { Booking, Field } = require('../models');

const MSG_BLOQUEO = 'No puede agendar turnos por reiteradas inasistencias. Comuníquese con la cancha.';

async function evaluarBloqueoInasistencias(complexId, { userId, telefono } = {}) {
  const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
  const fieldIds = fields.map(f => f.id);
  if (!fieldIds.length) return { blocked: false, mensaje: MSG_BLOQUEO };

  const or = [];
  if (userId) or.push({ user_id: userId });
  const sig = telefono ? String(telefono).replace(/\D/g, '').slice(-10) : null;
  if (sig && sig.length >= 8) or.push({ telefono_cliente: { [Op.like]: `%${sig}%` } });
  if (!or.length) return { blocked: false, mensaje: MSG_BLOQUEO };

  const noShows = await Booking.findAll({
    where: { field_id: { [Op.in]: fieldIds }, estado: 'no_asistido', [Op.or]: or },
    attributes: ['fecha'],
    raw: true,
  });

  const porMes = {};
  for (const b of noShows) {
    const mes = String(b.fecha).slice(0, 7);   // YYYY-MM
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  const total  = noShows.length;
  const valores = Object.values(porMes);
  const maxMes = valores.length ? Math.max(...valores) : 0;
  const meses  = valores.length;

  // Regla A: 2 en un mismo mes. Regla B: 3 repartidos en 2+ meses.
  const blocked = maxMes >= 2 || (total >= 3 && meses >= 2);

  return { blocked, total, maxMes, meses, mensaje: MSG_BLOQUEO };
}

module.exports = { evaluarBloqueoInasistencias, MSG_BLOQUEO };
