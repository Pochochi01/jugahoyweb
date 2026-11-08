'use strict';
/**
 * services/pay/liquidacion.js — Motor de liquidación (funciones PURAS, sin base de datos).
 *
 * Todos los importes se calculan en CENTAVOS enteros: la suma de las partes es exactamente el
 * total (el resto de una división se reparte de a 1 centavo entre los primeros).
 *
 * Modos de cobro de la cancha:
 *   'uno'        un jugador paga todo (cancha + todos los consumos)            — Modo 1
 *   'iguales'    partes iguales entre los jugadores                             — Modo 2
 *   'porcentaje' porcentaje por jugador (suma 100)                              — Modo 3
 *   'pareja'     cada pareja paga su mitad (un cobro por pareja)                — Modo 4
 * Consumos (Modos 5 y 6): cada consumo se asigna a un jugador, a una pareja o al grupo.
 * Pago parcial / posterior / saldo pendiente (Modos 7–9) se resuelven en la orden (payEngine).
 */

const MODOS = ['uno', 'iguales', 'porcentaje', 'pareja'];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const aCent = (v) => Math.round(Number(v) * 100);
const aPesos = (c) => Math.round(c) / 100;

/** Reparte `cent` en partes proporcionales a `pesos` (enteros, suma exacta). */
function repartir(cent, pesos) {
  const total = pesos.reduce((a, b) => a + b, 0);
  if (!total) return pesos.map(() => 0);
  const base = pesos.map(p => Math.floor((cent * p) / total));
  let resto = cent - base.reduce((a, b) => a + b, 0);
  // El resto va a los de mayor fracción (y ante empate, a los primeros)
  const orden = pesos.map((p, i) => ({ i, frac: (cent * p) / total - base[i] })).sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let k = 0; resto > 0; k = (k + 1) % orden.length) { base[orden[k].i]++; resto--; }
  return base;
}

function validarJugadores(jugadores) {
  if (!Array.isArray(jugadores) || !jugadores.length) throw httpError(400, 'Indicá al menos un jugador.');
  if (jugadores.length > 12) throw httpError(400, 'Máximo 12 jugadores por turno.');
  jugadores.forEach((j, i) => { if (!String(j?.nombre || '').trim()) throw httpError(400, `Falta el nombre del jugador ${i + 1}.`); });
}

/** Parejas por defecto: (1,2), (3,4)… */
const parejasPorDefecto = (n) => Array.from({ length: Math.ceil(n / 2) }, (_, i) => [i * 2, i * 2 + 1].filter(x => x < n));

/**
 * División del valor de la cancha entre jugadores (centavos por jugador).
 * @param {number} total  importe de la cancha
 * @param {Array<{nombre:string}>} jugadores
 * @param {{ modo: string, pagador?: number, porcentajes?: number[], parejas?: number[][] }} opts
 * @returns {number[]} centavos por jugador
 */
function splitReservationPayment(total, jugadores, { modo = 'iguales', pagador = 0, porcentajes, parejas } = {}) {
  validarJugadores(jugadores);
  if (!MODOS.includes(modo)) throw httpError(400, `Modo de cobro inválido: ${modo}.`);
  const cent = aCent(total);
  if (!Number.isFinite(cent) || cent < 0) throw httpError(400, 'Importe inválido.');
  const n = jugadores.length;
  if (modo === 'uno') {
    if (!Number.isInteger(Number(pagador)) || pagador < 0 || pagador >= n) throw httpError(400, 'Elegí quién paga.');
    return jugadores.map((_, i) => (i === Number(pagador) ? cent : 0));
  }
  if (modo === 'iguales') return repartir(cent, jugadores.map(() => 1));
  if (modo === 'porcentaje') {
    const p = (porcentajes || []).map(Number);
    if (p.length !== n || p.some(x => !Number.isFinite(x) || x < 0)) throw httpError(400, 'Indicá un porcentaje (≥ 0) por jugador.');
    if (Math.abs(p.reduce((a, b) => a + b, 0) - 100) > 0.01) throw httpError(400, 'Los porcentajes tienen que sumar 100.');
    return repartir(cent, p.map(x => Math.round(x * 100)));
  }
  // pareja: cada pareja paga partes iguales del total; dentro de la pareja, mitad y mitad
  const ps = normalizarParejas(parejas, n);
  const porPareja = repartir(cent, ps.map(() => 1));
  const out = jugadores.map(() => 0);
  ps.forEach((par, k) => repartir(porPareja[k], par.map(() => 1)).forEach((c, j) => { out[par[j]] += c; }));
  return out;
}

function normalizarParejas(parejas, n) {
  const ps = parejas?.length ? parejas.map(p => p.map(Number)) : parejasPorDefecto(n);
  const vistos = ps.flat();
  if (vistos.some(i => !Number.isInteger(i) || i < 0 || i >= n) || new Set(vistos).size !== vistos.length || vistos.length !== n) {
    throw httpError(400, 'Las parejas deben incluir a cada jugador una sola vez.');
  }
  return ps;
}

/**
 * Distribución de consumos.
 * @param {Array<{ id?, nombre, subtotal }>} consumos
 * @param {Object<string,{ tipo: 'jugador'|'pareja'|'grupo', indice?: number }>} asignaciones  por id (o índice) de consumo
 * @param {number} nJugadores
 * @param {number[][]} [parejas]
 * @returns {Array<Array<{ concepto, centavos }>>} líneas por jugador
 */
function calculateConsumptionDistribution(consumos = [], asignaciones = {}, nJugadores, parejas) {
  const lineas = Array.from({ length: nJugadores }, () => []);
  const ps = normalizarParejas(parejas, nJugadores);
  consumos.forEach((c, k) => {
    const cent = aCent(c.subtotal);
    if (!Number.isFinite(cent) || cent < 0) throw httpError(400, `Consumo inválido: ${c.nombre}.`);
    const a = asignaciones[c.id ?? k] || asignaciones[k] || { tipo: 'grupo' };
    let destino;
    if (a.tipo === 'jugador') {
      if (!Number.isInteger(Number(a.indice)) || a.indice < 0 || a.indice >= nJugadores) throw httpError(400, `"${c.nombre}": jugador inválido.`);
      destino = [Number(a.indice)];
    } else if (a.tipo === 'pareja') {
      destino = ps[Number(a.indice)];
      if (!destino) throw httpError(400, `"${c.nombre}": pareja inválida.`);
    } else if (a.tipo === 'grupo') {
      destino = Array.from({ length: nJugadores }, (_, i) => i);
    } else throw httpError(400, `"${c.nombre}": asignación inválida.`);
    const partes = repartir(cent, destino.map(() => 1));
    const sufijo = destino.length > 1 ? ` (1/${destino.length})` : '';
    destino.forEach((j, i) => { if (partes[i]) lineas[j].push({ concepto: `${c.nombre}${sufijo}`, centavos: partes[i], tipo: 'consumo' }); });
  });
  return lineas;
}

/**
 * Liquidación consolidada: cancha + consumos por jugador, agrupada en "pagadores".
 *   'uno' → un único pagador con todo · 'pareja' → un pagador por pareja · resto → uno por jugador.
 * @returns {{ pagadores: Array<{ nombre, jugadores: number[], items: Array<{concepto, importe, tipo}>, total }>, total, cancha, consumos }}
 */
function mergeReservationAndConsumptions({ total, jugadores, modo = 'iguales', pagador = 0, porcentajes, parejas, consumos = [], asignaciones = {}, conceptoCancha = 'Cancha' }) {
  const n = jugadores.length;
  const cancha = splitReservationPayment(total, jugadores, { modo, pagador, porcentajes, parejas });
  const consumo = calculateConsumptionDistribution(consumos, asignaciones, n, parejas);
  const porJugador = jugadores.map((j, i) => [
    ...(cancha[i] ? [{ concepto: conceptoCancha, centavos: cancha[i], tipo: 'cancha' }] : []),
    ...consumo[i],
  ]);
  let grupos;
  if (modo === 'uno') grupos = [[Number(pagador), ...jugadores.map((_, i) => i).filter(i => i !== Number(pagador))]];
  else if (modo === 'pareja') grupos = normalizarParejas(parejas, n);
  else grupos = jugadores.map((_, i) => [i]);

  const pagadores = grupos.map(g => {
    const lineas = g.flatMap(i => porJugador[i].map(l => ({ ...l, jugador: i })));
    // Agrupa líneas iguales (ej. "Cancha" de los dos de la pareja)
    const mapa = new Map();
    for (const l of lineas) {
      const k = `${l.tipo}|${l.concepto}`;
      mapa.set(k, (mapa.get(k) || 0) + l.centavos);
    }
    const items = [...mapa].map(([k, c]) => ({ tipo: k.split('|')[0], concepto: k.split('|').slice(1).join('|'), importe: aPesos(c) }));
    const totalC = lineas.reduce((a, l) => a + l.centavos, 0);
    return {
      nombre: g.map(i => jugadores[i].nombre).join(' / '),
      jugadores: g, titular: jugadores[g[0]], items, total: aPesos(totalC), centavos: totalC,
    };
  }).filter(p => p.centavos > 0);

  const totalConsumos = consumos.reduce((a, c) => a + aCent(c.subtotal), 0);
  const suma = pagadores.reduce((a, p) => a + p.centavos, 0);
  if (suma !== aCent(total) + totalConsumos) throw httpError(500, 'La liquidación no cierra (error interno de redondeo).');
  return { pagadores: pagadores.map(({ centavos, ...p }) => p), total: aPesos(suma), cancha: aPesos(aCent(total)), consumos: aPesos(totalConsumos) };
}

module.exports = { MODOS, splitReservationPayment, calculateConsumptionDistribution, mergeReservationAndConsumptions, repartir, aCent, aPesos };
