'use strict';
/**
 * utils/deportesComplejo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Deportes que un complejo puede ofrecer en torneos y escuelas, derivados de
 * sus CANCHAS: un deporte está disponible si el complejo tiene al menos una
 * cancha habilitada (activa) de ese deporte. Fuente única para el backend
 * (validación) y el frontend (desplegables), así no se crean torneos ni
 * escuelas de deportes que el complejo no puede jugar.
 *
 *   Solo fútbol   → torneos/escuelas de fútbol (no de pádel)
 *   Solo pádel    → torneos/escuelas de pádel (no de fútbol)
 *   Fútbol + pádel→ ambos
 */
const { Field } = require('../models');

const DEPORTE_LABEL = { futbol: 'fútbol', padel: 'pádel', tenis: 'tenis', basquet: 'básquet', voley: 'vóley', squash: 'squash', otro: 'otros deportes' };
const labelDeporte = (d) => DEPORTE_LABEL[d] || d;
const ORDEN = ['futbol', 'padel', 'tenis', 'basquet', 'voley', 'squash', 'otro'];

/**
 * Deportes con al menos una cancha habilitada en el complejo.
 * @returns {Promise<Array<{value:string, label:string, canchas:number}>>}
 */
async function deportesDisponibles(complexId) {
  const filas = await Field.count({ where: { complex_id: Number(complexId), activa: true }, group: ['deporte'] });
  return filas
    .map(f => ({ value: f.deporte, label: labelDeporte(f.deporte), canchas: Number(f.count) }))
    .sort((a, b) => ORDEN.indexOf(a.value) - ORDEN.indexOf(b.value));
}

async function tieneDeporte(complexId, deporte) {
  return (await Field.count({ where: { complex_id: Number(complexId), activa: true, deporte } })) > 0;
}

/**
 * Mensaje uniforme cuando falta el deporte.
 * @param {string} deporte
 * @param {'torneos'|'escuelas'} actividad
 */
function mensajeSinDeporte(deporte, actividad = 'torneos') {
  const d = labelDeporte(deporte);
  return actividad === 'escuelas'
    ? `El complejo no tiene canchas de ${d}, no puede abrir una escuela de ${d}.`
    : `El complejo no tiene canchas de ${d}, no puede organizar torneos de ${d}.`;
}

module.exports = { deportesDisponibles, tieneDeporte, mensajeSinDeporte, labelDeporte, DEPORTE_LABEL };
