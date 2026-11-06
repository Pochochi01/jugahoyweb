'use strict';
/** Validación de llaves reales (antes de guardar) y administración de plantillas sin BD. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../../torneos/fixtureService');
const { validarLlave } = require('../bracketValidator');
const svc = require('../bracketService');
const { asignarReal, zonaDe } = require('./helpers');

const zonasConRegla = [2, 3, 4, 5, 6, 7, 8, 9, 10];

test('llaves reales sin faltantes, duplicados ni cruces de la misma zona', () => {
  for (const z of zonasConRegla) {
    const c = fx.armarLlavePorZonas(z, 2, asignarReal);
    assert.deepEqual(validarLlave(c, { zonaDe, esperados: z * 2 }), [], `${z} zonas`);
    const ids = c.rondas.flatMap(r => r.partidos).flatMap(p => [['local', p.pareja1_id], ['visitante', p.pareja2_id]]
      .filter(([lado, id]) => id != null && !String(p.origen[lado]).startsWith('W:')).map(([, id]) => id));
    assert.equal(new Set(ids).size, z * 2, `${z} zonas: cada clasificado una sola vez`);
    assert.ok(c.rondas.flatMap(r => r.partidos).every(p => p.siguiente_key || p.key === 'final-1'), `${z} zonas: sin huérfanos`);
  }
});

test('detecta duplicados, faltantes, misma zona y huérfanos', () => {
  const c = fx.armarLlavePorZonas(4, 2, asignarReal);
  const dup = structuredClone(c);
  dup.rondas[0].partidos[1].pareja1_id = dup.rondas[0].partidos[0].pareja1_id;
  assert.ok(validarLlave(dup).some(e => /repetidas/.test(e)));
  assert.ok(validarLlave(c, { esperados: 10 }).some(e => /faltan clasificados: 8 de 10/.test(e)));
  const misma = structuredClone(c);
  misma.rondas[0].partidos[0].pareja2_id = 12;   // 2° de la zona A contra 1° de la zona A
  assert.ok(validarLlave(misma, { zonaDe }).some(e => /misma zona/.test(e)));
  const huerfano = structuredClone(c);
  huerfano.rondas[0].partidos[0].siguiente_key = null;
  assert.ok(validarLlave(huerfano).some(e => /huérfano/.test(e)));
  const roto = structuredClone(c);
  roto.rondas[0].partidos[0].siguiente_key = 'cuartos-9';
  assert.ok(validarLlave(roto).some(e => /siguiente inexistente/.test(e)));
});

test('armado genérico: se validan los lugares de la primera ronda', () => {
  const c = fx.armarLlavePorZonas(11, 2, asignarReal);
  assert.deepEqual(validarLlave(c, { esperados: 22 }), []);
});

test('probarPlantilla: válida → vista y partidos a jugar; inválida → errores', () => {
  const ok = svc.probarPlantilla({ name: 'Prueba 2 zonas', zones: 2, clasifican: 2, template_json: JSON.stringify({ rondas: require('../bracketRules').BRACKET_RULES.pairs_6_8.rondas }) });
  assert.equal(ok.valida, true);
  assert.equal(ok.partidos_a_jugar, 3);
  assert.equal(ok.rondas[0].partidos[0].cruce, '1° Zona A vs 2° Zona B');
  const mal = svc.probarPlantilla({ name: 'Mal', zones: 3, clasifican: 2, template_json: { rondas: require('../bracketRules').BRACKET_RULES.pairs_6_8.rondas } });
  assert.equal(mal.valida, false);
  assert.ok(mal.errores.some(e => /1C aparece 0/.test(e)));
  assert.throws(() => svc.probarPlantilla({ name: 'x', zones: 2, template_json: '{no json' }), /JSON válido/);
  assert.throws(() => svc.probarPlantilla({ zones: 2, template_json: {} }), /nombre/);
});

test('describir: vista legible de una regla', () => {
  const v = svc.describir(require('../bracketRules').BRACKET_RULES.pairs_9_11);
  assert.equal(v[0].partidos[0].cruce, '1° Zona A vs BYE');
  assert.equal(v[1].partidos[1].cruce, 'Ganador cuartos-3 vs Ganador cuartos-4');   // 1° B llega por BYE desde cuartos-4
  assert.equal(v[0].partidos[0].siguiente, 'semifinal-1 (lugar 1)');
});
