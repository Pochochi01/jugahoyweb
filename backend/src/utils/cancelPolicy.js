'use strict';
/**
 * utils/cancelPolicy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reglas de cancelación de turnos (compartidas por chatbot, web y dashboard):
 *
 *  - Regla general: solo se puede cancelar si faltan >= 2 horas para el inicio.
 *  - Excepción "último momento": si el turno se reservó con MENOS de 2 h de
 *    anticipación, se habilita la cancelación durante los primeros 15 minutos
 *    posteriores a la reserva.
 *
 * El server corre con TZ de Argentina, así que `new Date('YYYY-MM-DDTHH:MM:00')`
 * se interpreta en hora local (AR), igual que hora_inicio.
 */

const WINDOW_H  = 2;    // horas de anticipación mínimas para cancelar
const GRACE_MIN = 15;   // minutos de gracia para reservas de último momento

const MSG_2H  = `Los turnos deben cancelarse con al menos ${WINDOW_H} horas de anticipación.`;
const MSG_15  = `Este turno puede cancelarse solo dentro de los primeros ${GRACE_MIN} minutos después de reservarlo.`;
const MSG_YA_COMENZO = 'No se puede cancelar un turno que ya comenzó o pasó.';

/**
 * Datetime de inicio del turno a partir de fecha (YYYY-MM-DD) + hora_inicio (HH:MM).
 * Madrugada (hora < 08:00) = día siguiente del calendario, igual que en la agenda.
 */
function inicioDe(booking) {
  const fecha = typeof booking.fecha === 'string'
    ? booking.fecha
    : new Date(booking.fecha).toISOString().slice(0, 10);
  const inicio = new Date(`${fecha}T${booking.hora_inicio}:00`);
  const h = parseInt(String(booking.hora_inicio).split(':')[0], 10);
  if (h < 8) inicio.setDate(inicio.getDate() + 1);
  return inicio;
}

/** true si el turno YA comenzó (su hora de inicio pasó). */
function yaComenzo(booking, now = new Date()) {
  return inicioDe(booking).getTime() <= now.getTime();
}

/**
 * Evalúa si un turno se puede cancelar AHORA.
 * @returns {{ allowed: boolean, code: 'ok'|'gracia'|'gracia_vencida'|'tarde', mensaje: string|null }}
 */
function evaluarCancelacion(booking, now = new Date()) {
  const inicio  = inicioDe(booking);
  const created = booking.createdAt ? new Date(booking.createdAt) : now;
  const hHastaInicio = (inicio - now) / 3_600_000;

  if (hHastaInicio >= WINDOW_H) {
    return { allowed: true, code: 'ok', mensaje: null };
  }

  // Faltan menos de 2 h para el inicio → solo se salva la reserva "de último momento"
  const reservaUltimoMomento = (inicio - created) / 3_600_000 < WINDOW_H;
  if (reservaUltimoMomento) {
    const minDesdeReserva = (now - created) / 60_000;
    if (minDesdeReserva <= GRACE_MIN) {
      return { allowed: true, code: 'gracia', mensaje: null };
    }
    return { allowed: false, code: 'gracia_vencida', mensaje: MSG_15 };
  }
  return { allowed: false, code: 'tarde', mensaje: MSG_2H };
}

/**
 * Texto de advertencia a mostrar al CONFIRMAR/crear la reserva, según cuánto
 * falte para el inicio (define qué política le aplica al turno).
 */
function avisoAlReservar(inicio, now = new Date()) {
  const hHastaInicio = (inicio - now) / 3_600_000;
  return hHastaInicio < WINDOW_H ? MSG_15 : MSG_2H;
}

module.exports = { evaluarCancelacion, avisoAlReservar, inicioDe, yaComenzo, WINDOW_H, GRACE_MIN, MSG_2H, MSG_15, MSG_YA_COMENZO };
