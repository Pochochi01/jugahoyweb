'use strict';
/** Reglas internas y validación de plantillas (node --test). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { BRACKET_RULES, nombreRonda, ORDEN_RONDAS } = require('../bracketRules');
const { validarRegla, parsePlaza } = require('../bracketValidator');
const { reglaBase } = require('./helpers');

test('todas las reglas internas son válidas', () => {
  for (const [key, r] of Object.entries(BRACKET_RULES)) assert.deepEqual(validarRegla(r), [], key);
});

test('cada regla declara mínimo, máximo, zonas, clasificados y rondas', () => {
  for (const [key, r] of Object.entries(BRACKET_RULES)) {
    assert.ok(r.min <= r.max && r.zonas >= 2 && r.clasifican === 2, key);
    assert.equal(key, `pairs_${r.min}_${r.max}`);
    assert.equal(Math.floor(r.min / 3), r.zonas, `${key}: zonas de 3`);
    assert.ok(r.rondas.final?.length === 1, key);
  }
});

test('reglas implementadas: 6 a 32 parejas', () => {
  assert.deepEqual(Object.keys(BRACKET_RULES).sort(), ['pairs_12_14', 'pairs_15_17', 'pairs_18_20', 'pairs_21_23', 'pairs_24_26', 'pairs_27_29', 'pairs_30_32', 'pairs_6_8', 'pairs_9_11']);
});

test('nombre de ronda: etiqueta de la regla o nombre estándar', () => {
  assert.equal(nombreRonda(BRACKET_RULES.pairs_15_17, 'octavos'), 'Repechaje');
  assert.equal(nombreRonda(BRACKET_RULES.pairs_27_29, '16avos'), 'Repechaje');
  assert.equal(nombreRonda(BRACKET_RULES.pairs_24_26, 'octavos'), 'Octavos');
  assert.equal(nombreRonda(BRACKET_RULES.pairs_30_32, '16avos'), 'Repechaje');
  assert.equal(nombreRonda(null, 'semifinal'), 'Semifinal');
  assert.equal(nombreRonda(null, 'x'), 'x');
  assert.deepEqual(ORDEN_RONDAS, ['16avos', 'octavos', 'cuartos', 'semifinal', 'final']);
});

test('parsePlaza', () => {
  assert.deepEqual(parsePlaza('2C'), { posicion: 2, zona_idx: 2 });
  assert.equal(parsePlaza('W:final-1'), null);
  assert.equal(parsePlaza(null), null);
});

test('detecta plantillas inválidas', () => {
  const casos = [
    [(r) => { r.rondas.semifinal[0].visitante = '2A'; r.rondas.semifinal[1].visitante = '2B'; }, /misma zona/],
    [(r) => { r.rondas.semifinal[1].visitante = '1A'; }, /1A aparece 2 veces/],
    [(r) => { r.rondas.semifinal[1].visitante = '3A'; }, /plaza desconocida|aparece 0/],
    [(r) => { r.rondas.semifinal[0].siguiente = null; }, /huérfano/],
    [(r) => { r.rondas.semifinal[0].siguiente = { key: 'final-9', slot: 1 }; }, /siguiente inexistente/],
    [(r) => { r.rondas.semifinal[0].siguiente.slot = 2; }, /debería ser W:semifinal-1/],
    [(r) => { r.rondas.final[0].visitante = null; }, /BYE fuera de la primera ronda/],
    [(r) => { r.rondas.final[0].local = 'W:semifinal-2'; }, /no alimenta|su ganador no juega/],
    [(r) => { r.rondas.semifinal[0].key = 'semifinal-3'; }, /la clave debe ser|siguiente|no alimenta/],
    [(r) => { r.rondas.final.push({ key: 'final-2', local: '1A', visitante: '1B', siguiente: null }); }, /única final/],
    [(r) => { r.rondas.repechaje = []; }, /ronda desconocida/],
    [(r) => { r.zonas = 0; }, /zonas inválida/],
    [(r) => { r.clasifican = 0; }, /clasificados por zona/],
    [(r) => { r.min = 9; r.max = 6; }, /mínimo/],
    [(r) => { r.rondas = {}; }, /no tiene partidos/],
    [(r) => { r.rondas.semifinal[0].local = 'XX'; }, /lado inválido|aparece 0/],
    [(r) => { r.rondas.octavos = [{ key: 'octavos-1', local: null, visitante: null, siguiente: null }]; }, /sin participantes|falta la ronda/],
  ];
  for (const [romper, esperado] of casos) {
    const r = reglaBase();
    romper(r);
    const e = validarRegla(r);
    assert.ok(e.some(x => esperado.test(x)), `${esperado}: ${e.join(' | ')}`);
  }
  assert.deepEqual(validarRegla(null), ['plantilla vacía']);
  assert.deepEqual(validarRegla(reglaBase()), []);
});
