'use strict';
/**
 * Relámpago — horarios en el orden de generación de cada zona (fx.programar secuencial).
 *   npm run test:relampago:orden
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../src/services/torneos/fixtureService');

/** Slots de 30' consecutivos en `canchas` canchas desde las 09:00 de un día. */
function slots(cantidad, canchas = 1, dur = 30) {
  const out = [];
  for (let i = 0; i < cantidad; i++) for (let c = 1; c <= canchas; c++) {
    const abs = 9 * 60 + i * dur;
    out.push({ field_id: c, fecha: '2026-12-10', hora: fx.toHHMM(abs), abs, dur });
  }
  return out.sort((a, b) => a.abs - b.abs || a.field_id - b.field_id);
}
const parejas = (ids, horarios = [{ fecha: null, desde: '08:00', hasta: '23:59' }]) => new Map(ids.map(id => [id, { id, horarios_preferidos: horarios }]));
const cruce = (zona_id, orden, a, b) => ({ key: `${zona_id}-${orden}`, zona_id, orden, pareja1_id: a, pareja2_id: b, despuesDe: [] });
const enOrden = (asig, cruces) => {
  for (const z of new Set(cruces.map(c => c.zona_id))) {
    const abs = cruces.filter(c => c.zona_id === z).sort((a, b) => a.orden - b.orden).map(c => asig.get(c.key)?.abs);
    for (let i = 1; i < abs.length; i++) if (abs[i] < abs[i - 1]) return false;
  }
  return true;
};

test('caso 1: una zona, horarios consecutivos → P1 09:00, P2 09:30, P3 10:00', () => {
  // Pareja 1 (A) juega P1 y P3; sin descanso para que el ejemplo sea el del requerimiento
  const cruces = [cruce(1, 1, 1, 2), cruce(1, 2, 3, 4), cruce(1, 3, 1, 3)];
  const a = fx.programar(fx.ordenSecuencial(cruces), slots(3), parejas([1, 2, 3, 4]), { descanso: 0, secuencial: true });
  assert.deepEqual(cruces.map(c => a.get(c.key).hora), ['09:00', '09:30', '10:00']);
});

test('caso 1 bis: con preferencias que favorecen a P3, el orden se mantiene', () => {
  // La pareja 5 solo puede de 09:00 a 09:29: el modo normal programaría primero a P3 (más restringido)
  const cruces = [cruce(1, 1, 1, 2), cruce(1, 2, 3, 4), cruce(1, 3, 5, 6)];
  const pref = parejas([1, 2, 3, 4, 6]);
  pref.set(5, { id: 5, horarios_preferidos: [{ fecha: null, desde: '09:00', hasta: '09:29' }] });
  const normal = fx.programar(cruces, slots(3), pref, { descanso: 0 });
  assert.equal(normal.get('1-3').hora, '09:00', 'el modo normal (otras modalidades) sigue priorizando al más restringido');
  const sec = fx.programar(fx.ordenSecuencial(cruces), slots(3), pref, { descanso: 0, secuencial: true });
  assert.deepEqual(cruces.map(c => sec.get(c.key).hora), ['09:00', '09:30', '10:00']);
  assert.equal(sec.get('1-3').fuera_preferencia, true, 'P3 queda fuera de la preferencia antes que romper el orden');
});

test('caso 2: varias zonas en paralelo, cada una en su orden (intercaladas)', () => {
  // 3 zonas de 4 todos contra todos (6 partidos c/u), 2 canchas, descanso 30'
  const cruces = [];
  let id = 1;
  for (const z of [10, 20, 30]) {
    const ids = [id++, id++, id++, id++];
    fx.roundRobin(ids).forEach(([a, b], k) => cruces.push(cruce(z, k + 1, a, b)));
  }
  const todos = [...new Set(cruces.flatMap(c => [c.pareja1_id, c.pareja2_id]))];
  const a = fx.programar(fx.ordenSecuencial(cruces), slots(40, 2), parejas(todos), { descanso: 30, secuencial: true });
  assert.ok(cruces.every(c => a.get(c.key)), 'todos programados');
  assert.ok(enOrden(a, cruces), 'dentro de cada zona: P1 ≤ P2 ≤ … ≤ P6');
  // Intercaladas: el P1 de cada zona arranca en la primera tanda, no después de terminar la zona anterior
  assert.ok([10, 20, 30].every(z => a.get(`${z}-1`).abs <= 9 * 60 + 30));
  // Sin choques de pareja ni de cancha
  const usados = new Set();
  for (const c of cruces) { const k = `${a.get(c.key).field_id}|${a.get(c.key).abs}`; assert.ok(!usados.has(k)); usados.add(k); }
});

test('mismo horario en dos canchas: el de menor número toma la primera cancha', () => {
  const cruces = [cruce(1, 1, 1, 2), cruce(1, 2, 3, 4)];
  const a = fx.programar(fx.ordenSecuencial(cruces), slots(2, 2), parejas([1, 2, 3, 4]), { descanso: 0, secuencial: true });
  assert.equal(a.get('1-1').abs, a.get('1-2').abs);
  assert.ok(a.get('1-1').field_id < a.get('1-2').field_id);
});

test('zona de 4 con cruces APA (P3/P4 dependen de P1/P2): una pasada secuencial', () => {
  const ids = [1, 2, 3, 4];
  const cruces = fx.crucesZona4(ids).map(c => ({ ...c, key: `1-${c.n}`, zona_id: 1, orden: c.n, despuesDe: c.despuesDe.map(n => `1-${n}`) }));
  const a = fx.programar(fx.ordenSecuencial(cruces), slots(10, 2), parejas(ids), { descanso: 30, secuencial: true });
  assert.ok(enOrden(a, cruces));
  assert.ok(a.get('1-3').abs >= Math.max(a.get('1-1').abs, a.get('1-2').abs) + 30 + 30, 'G1vP2 después de P1 y P2 con descanso');
});

test('ordenSecuencial: por número de partido, intercalando zonas', () => {
  const lista = [cruce(2, 2, 0, 0), cruce(1, 1, 0, 0), cruce(2, 1, 0, 0), cruce(1, 2, 0, 0)];
  assert.deepEqual(fx.ordenSecuencial(lista).map(c => c.key), ['1-1', '2-1', '1-2', '2-2']);
});
