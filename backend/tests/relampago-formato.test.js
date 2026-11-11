'use strict';
/** Torneo Relámpago — motor de formatos (services/torneos/formatoPartido.js). `npm run test:relampago` */
const test = require('node:test');
const assert = require('node:assert/strict');
const fmt = require('../src/services/torneos/formatoPartido');
const rv = require('../src/services/torneos/resultValidation');
const fx = require('../src/services/torneos/fixtureService');

const R4 = fmt.normalizarRegla({ tipo: 'un_set', games: 4, tiebreak: 7 }, 'zonas');
const ok = (sets, tbs, r) => fmt.validarResultado(sets, tbs || [], r);
const mal = (sets, tbs, r, re) => assert.throws(() => ok(sets, tbs, r), re || /./);

test('set único a 4 (con ventaja): válidos e inválidos', () => {
  for (const s of [[4, 0], [4, 1], [4, 2], [0, 4], [5, 3]]) assert.equal(ok([s], [], R4).sets.length, 1);
  assert.equal(ok([[5, 4]], [[7, 5]], R4).lado, 1);
  mal([[6, 2]], [], R4); mal([[6, 4]], [], R4); mal([[4, 3]], [], R4); mal([[5, 4]], [], R4, /tie-break/i);
  mal([[5, 4]], [[5, 7]], R4, /quien ganó/); mal([[4, 0], [4, 0]], [], R4, /un solo set|sets de más/);
  mal([[4, 2]], [[7, 5]], R4, /lleva tie-break/);
});

test('set único a 4 sin ventaja: 4-3 con tie-break', () => {
  const r = fmt.normalizarRegla({ tipo: 'un_set', games: 4, tiebreak: 5, ventaja: false });
  assert.equal(ok([[4, 3]], [[5, 3]], r).lado, 1);
  mal([[5, 3]], [], r); mal([[4, 3]], [], r); mal([[4, 3]], [[4, 2]], r, /llegar a 5/);
});

test('tie-break configurable (10 puntos) y diferencia exacta', () => {
  const r = fmt.normalizarRegla({ tipo: 'un_set', games: 6, tiebreak: 10 });
  assert.equal(ok([[7, 6]], [[10, 8]], r).lado, 1);
  assert.equal(ok([[6, 7]], [[12, 14]], r).lado, 2);
  mal([[7, 6]], [[7, 5]], r); mal([[7, 6]], [[13, 9]], r, /2 de ventaja/);
});

test('final: dos sets + súper TB a 10', () => {
  const r = fmt.normalizarRegla({ tipo: 'dos_sets_super_tb', games: 6, tiebreak: 7, super_tiebreak: 10 });
  assert.equal(ok([[6, 4], [4, 6], [10, 7]], [], r).lado, 1);
  assert.equal(ok([[6, 4], [6, 2]], [], r).lado, 1);
  mal([[6, 4], [4, 6]], [], r, /ganador/); mal([[6, 4], [4, 6], [6, 4]], [], r, /llegar a 10/);
  mal([[6, 4], [6, 4], [10, 2]], [], r, /de más/);
});

test('final: dos sets con 3º completo, games configurables', () => {
  const r = fmt.normalizarRegla({ tipo: 'mejor_de_3', games: 5, tiebreak: 7 });
  assert.equal(ok([[5, 3], [3, 5], [6, 4]], [], r).lado, 1);
  assert.equal(ok([[6, 4], [5, 0]], [], r).lado, 1);
  mal([[7, 5], [5, 0]], [], r); mal([[6, 5], [5, 0]], [], r, /tie-break/);
});

test('regla tradicional equivale a la histórica (mismos aceptados/rechazados)', () => {
  const r = fmt.reglaTradicional('set');
  const casos = [[[6, 4], [6, 3]], [[7, 5], [6, 7], [6, 0]], [[6, 5], [6, 0]], [[8, 6], [6, 0]], [[5, 3], [6, 0]]];
  for (const c of casos) {
    let a, b;
    try { fx.validarResultado(c, [null, [5, 7], null], 'set'); a = true; } catch { a = false; }
    try { fmt.validarResultado(c, [null, [5, 7], null], r); b = true; } catch { b = false; }
    assert.equal(a, b, JSON.stringify(c));
  }
});

test('reglas por fase y fases de llave', () => {
  const t = { formato: 'relampago', formato_partidos: { zonas: { tipo: 'un_set', games: 4, tiebreak: 7 }, semifinal: { tipo: 'un_set', games: 6, tiebreak: 10 }, final: { tipo: 'un_set', games: 9, tiebreak: 10 } } };
  assert.equal(fmt.reglaPartido(t, 'zona').games, 4);
  assert.equal(fmt.reglaPartido(t, 'octavos').games, fmt.DEFAULT_RELAMPAGO.cuartos.games);
  assert.equal(fmt.reglaPartido(t, 'semifinal').tiebreak, 10);
  assert.equal(fmt.reglaPartido(t, 'final').games, 9);
  assert.equal(fmt.reglaPartido({ formato: 'tradicional', tercer_set: 'super_tiebreak' }, 'zona').tipo, 'dos_sets_super_tb');
  assert.equal(fmt.resumenFormato({ formato: 'tradicional' }), null);
  assert.match(fmt.resumenFormato(t)[3].texto, /1 set a 9 games · tie-break a 10/);
  assert.equal(fmt.describirRegla(fmt.DEFAULT_RELAMPAGO.final), '2 sets a 6 games + súper tie-break a 10');
});

test('normalización: límites y tipos', () => {
  assert.throws(() => fmt.normalizarFormato({ zonas: { games: 1 } }), /games por set de 2 a 15/);
  assert.throws(() => fmt.normalizarFormato({ final: { tipo: 'x' } }), /formato de partido inválido/);
  assert.throws(() => fmt.normalizarFormato({ final: { tipo: 'dos_sets_super_tb', super_tiebreak: 40 } }), /súper tie-break/);
  assert.throws(() => fmt.normalizarFormato({ zonas: { tiebreak: 2 } }), /tie-break de 3/);
  const f = fmt.normalizarFormato('{"zonas":{"games":"5"}}');
  assert.equal(f.zonas.games, 5);
  assert.equal(f.zonas.super_tiebreak, undefined);
});

test('resultValidation: W.O. según la fase y compatibilidad tradicional', () => {
  assert.deepEqual(rv.validateResult({ walkover_ganador: 2 }, 'set', R4).sets, [[0, 4]]);
  const fin = fmt.normalizarRegla(fmt.DEFAULT_RELAMPAGO.final);
  assert.deepEqual(rv.validateResult({ walkover_ganador: 1 }, 'set', fin).sets, [[6, 0], [6, 0]]);
  assert.deepEqual(rv.validateResult({ walkover_ganador: 1 }).sets, [[6, 0], [6, 0]]);
  assert.equal(rv.validateResult({ sets: [[4, 1]] }, 'set', R4).lado, 1);
  assert.throws(() => rv.validateResult({ sets: [[4, 1]] }), /2 o 3 sets/);
});

test('posiciones: games y sets sin asumir formato tradicional', () => {
  const parejas = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const partidos = [
    { pareja1_id: 1, pareja2_id: 2, estado: 'jugado', resultado: { ganador_id: 1, sets: [[6, 4], [4, 6], [10, 8]] } },
    { pareja1_id: 2, pareja2_id: 3, estado: 'jugado', resultado: { ganador_id: 2, sets: [[4, 1]] } },
  ];
  const t = fx.tablaZona(parejas, partidos, { superTb: 2 });
  const p1 = t.find(r => r.pareja_id === 1), p2 = t.find(r => r.pareja_id === 2);
  assert.deepEqual([p1.pj, p1.pg, p1.sf, p1.sc, p1.gf, p1.gc], [1, 1, 2, 1, 10, 10]);
  assert.deepEqual([p2.pj, p2.pg, p2.pp, p2.sf, p2.sc, p2.gf, p2.gc, p2.dif_games], [2, 1, 1, 2, 2, 14, 11, 3]);
  // tradicional: sin cambios (el 3º suma games como siempre)
  assert.equal(fx.tablaZona(parejas, partidos).find(r => r.pareja_id === 1).gf, 20);
});
