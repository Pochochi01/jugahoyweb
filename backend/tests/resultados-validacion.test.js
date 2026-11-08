'use strict';
/**
 * tests/resultados-validacion.test.js — validateSetScore / validateTiebreak / validateWalkover / validateResult.
 *
 *   npm run test:resultados
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSetScore, validateTiebreak, validateWalkover, validateResult } = require('../src/services/torneos/resultValidation');

test('sets válidos: 6-0…6-4, 7-5 y 7-6 con tie-break (también "6" como texto)', () => {
  for (const s of [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [0, 6], [4, 6], [5, 7]]) assert.equal(validateSetScore(s, null), s[0] > s[1] ? 1 : 2, s.join('-'));
  assert.equal(validateSetScore([7, 6], [7, 4]), 1);
  assert.equal(validateSetScore([6, 7], [8, 10]), 2);
  assert.equal(validateSetScore(['6', '3'], null), 1);
});

test('sets inválidos', () => {
  const malos = [[6, 5], [5, 5], [7, 4], [7, 3], [4, 2], [8, 6], [10, 2], [12, 10], [-1, 6], [6.5, 3], ['abc', 6], ['', 6], [null, 6], ['6.5', 3], ['-1', 6], ['1e1', 2], [true, 6], [6], [6, 3, 1], 'x', null];
  for (const s of malos) assert.throws(() => validateSetScore(s, null), /Set 1/, JSON.stringify(s));
  assert.throws(() => validateSetScore([6, 6], null), /Set 1/, '6-6');
  assert.throws(() => validateSetScore([7, 6], null), /tie-break/i, '7-6 sin tie-break');
  assert.throws(() => validateSetScore([7, 6], [4, 7]), /lo tiene que ganar/, 'tie-break del otro lado');
  assert.throws(() => validateSetScore([6, 4], [7, 5]), /solo un 7-6/, 'tie-break de más');
});

test('tie-break: enteros 0–99, a 7 con 2 de diferencia', () => {
  for (const tb of [[7, 4], [10, 8], [12, 10], [7, 0], [99, 97]]) assert.equal(validateTiebreak(tb), 1, tb.join('-'));
  for (const tb of [[7, 6], [6, 4], [11, 8], [100, 98], [7.5, 5], ['a', 5], [-1, 7], ['', 7], [7]]) assert.throws(() => validateTiebreak(tb), /Tie-break/, JSON.stringify(tb));
  assert.equal(validateTiebreak([10, 8], 10, 'Súper tie-break'), 1);
  assert.throws(() => validateTiebreak([9, 7], 10, 'Súper tie-break'), /llegar a 10/);
});

test('resultado completo (mejor de 3)', () => {
  assert.deepEqual(validateResult({ sets: [[6, 4], [3, 6], [6, 3]] }), { lado: 1, sets: [[6, 4], [3, 6], [6, 3]], tie_breaks: [null, null, null], is_walkover: false });
  assert.equal(validateResult({ sets: [[7, 6], [6, 7], [4, 6]], tie_breaks: [[7, 5], [8, 10], null] }).lado, 2);
  assert.equal(validateResult({ sets: [['6', '0'], ['6', '0']] }).sets[0][0], 6, 'normaliza texto a número');
  assert.throws(() => validateResult({ sets: [[6, 4]] }), /2 o 3 sets/);
  assert.throws(() => validateResult({ sets: [[6, 4], [6, 4], [6, 4]] }), /sets de más/);
  assert.throws(() => validateResult({ sets: [[6, 4], [4, 6]] }), /no define un ganador/);
  assert.throws(() => validateResult({ sets: [[6, 4], [4, 6], [6, 5]] }), /Set 3/);
  assert.throws(() => validateResult({ sets: [[6, 4], [6, 3]], tie_breaks: 'x' }), /tie_breaks/);
  assert.equal(validateResult({ sets: [[6, 4], [4, 6], [10, 8]] }, 'super_tiebreak').lado, 1, 'súper tie-break como 3º');
  assert.throws(() => validateResult({ sets: [[6, 4], [4, 6], [6, 3]] }, 'super_tiebreak'), /Súper tie-break/);
});

test('W.O.: se guarda 6-0 6-0 (o 0-6 0-6) con la marca', () => {
  assert.deepEqual(validateWalkover({ walkover_ganador: 1 }), { lado: 1, sets: [[6, 0], [6, 0]], tie_breaks: [null, null], is_walkover: true });
  assert.deepEqual(validateResult({ walkover_ganador: '2' }).sets, [[0, 6], [0, 6]]);
  for (const g of [0, 3, 'x', '1.0', null, true]) assert.throws(() => validateWalkover({ walkover_ganador: g }), /W\.O\./, String(g));
  assert.throws(() => validateWalkover({ walkover_ganador: 1, sets: [[6, 0], [6, 0]] }), /no se cargan sets/);
});
