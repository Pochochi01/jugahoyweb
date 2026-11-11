'use strict';
/**
 * services/torneos/resultValidation.js — Validación de resultados (única fuente de verdad del backend).
 *
 * Toda carga de resultado (API del club, organizador, importaciones) pasa por aquí antes de guardar:
 *   validateSetScore(set, tieBreak, nro)   set de pádel: 6-0…6-4, 7-5 o 7-6 (con tie-break). Games 0–7 enteros.
 *   validateTiebreak(tb, min = 7)          tie-break a `min` (7, o 10 en súper tie-break) con 2 de diferencia; 0–99.
 *   validateWalkover(data)                 W.O.: ganador 1 o 2, sin sets cargados a mano → 6-0 6-0 / 0-6 0-6.
 *   validateResult(data, tercerSet, regla) resultado completo (mejor de 3) o W.O.
 *     `regla` (torneo relámpago, ver formatoPartido.js): games / tie-break / sets de la fase del partido.
 *     Sin `regla` → reglas tradicionales, idénticas a las históricas.
 * Las reglas están en fixtureService (validarSet / validarTieBreak / validarResultado); este módulo
 * es la interfaz pública y agrega el W.O.
 */
const fx = require('./fixtureService');
const fmt = require('./formatoPartido');

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

/** @returns {1|2} lado ganador del set */
const validateSetScore = (set, tieBreak, nro = 1) => fx.validarSet(set, tieBreak ?? null, nro);

/** @returns {1|2} lado ganador del tie-break */
const validateTiebreak = (tb, min = 7, etiqueta = 'Tie-break') => fx.validarTieBreak(tb, min, etiqueta);

/**
 * W.O.: devuelve el resultado normalizado que se guarda (dos sets 6-0 para el ganador).
 * @param {{ walkover_ganador: 1|2|'1'|'2', sets?: any }} data
 * @returns {{ lado: 1|2, sets: number[][], tie_breaks: null[], is_walkover: true }}
 */
function validateWalkover(data = {}, regla = null) {
  const lado = Number(data.walkover_ganador);
  if (![1, 2].includes(lado) || !/^[12]$/.test(String(data.walkover_ganador).trim())) throw badRequest('W.O.: indicá el ganador (1 o 2).');
  if (Array.isArray(data.sets) && data.sets.length) throw badRequest('W.O.: no se cargan sets (se registra el resultado mínimo para el ganador).');
  if (regla) {
    const sets = fmt.setsWalkover(lado, regla);
    return { lado, sets, tie_breaks: sets.map(() => null), is_walkover: true };
  }
  const set = lado === 1 ? [6, 0] : [0, 6];
  return { lado, sets: [[...set], [...set]], tie_breaks: [null, null], is_walkover: true };
}

/**
 * Resultado completo. Rechaza cualquier dato inválido (también si llega por API o manipulado).
 * @param {{ sets?: any[], tie_breaks?: any[], walkover_ganador?: 1|2 }} data
 * @param {'set'|'super_tiebreak'} tercerSet
 */
function validateResult(data = {}, tercerSet = 'set', regla = null) {
  if (data.walkover_ganador != null) return validateWalkover(data, regla);
  if (data.tie_breaks != null && !Array.isArray(data.tie_breaks)) throw badRequest('tie_breaks inválido.');
  if (regla) return { ...fmt.validarResultado(data.sets, data.tie_breaks || [], regla), is_walkover: false };
  return { ...fx.validarResultado(data.sets, data.tie_breaks || [], tercerSet), is_walkover: false };
}

module.exports = { validateSetScore, validateTiebreak, validateWalkover, validateResult };
