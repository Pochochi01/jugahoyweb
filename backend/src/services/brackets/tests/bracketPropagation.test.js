'use strict';
/** Propagación de ganadores hasta el campeón y prioridad de plantillas (club → global → interna). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../../torneos/fixtureService');
const { simularPropagacion, ESTRATEGIAS } = require('../bracketPropagator');
const { generarCuadro } = require('../bracketGenerator');
const templates = require('../bracketTemplates');
const { BRACKET_RULES } = require('../bracketRules');
const { asignarReal } = require('./helpers');

test('con cualquier resultado los ganadores se propagan hasta un único campeón', () => {
  for (const z of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const c = fx.armarLlavePorZonas(z, 2, asignarReal);
    for (const f of ESTRATEGIAS) {
      const r = simularPropagacion(c, f);
      assert.deepEqual(r.errores, [], `${z} zonas`);
      assert.equal(r.jugados, z * 2 - 1, `${z} zonas: partidos jugados`);
      assert.ok(r.campeon != null);
    }
  }
});

test('el campeón es el que gana la final según la estrategia', () => {
  const c = fx.armarLlavePorZonas(2, 2, asignarReal);
  assert.equal(simularPropagacion(c, () => 1).campeon, 11);   // 1° A gana todo como local
  assert.equal(simularPropagacion(c, () => 2).campeon, 12);   // siempre gana el visitante: SF2 = 2° A (id 12) gana la final
});

test('BYE: el clasificado avanza solo (ganador automático)', () => {
  const c = fx.armarLlavePorZonas(3, 2, asignarReal);
  const sf1 = c.rondas[1].partidos[0];
  assert.equal(sf1.pareja1_id, 11, '1° A ya está en la semifinal');
  assert.equal(sf1.pareja2_id, null, 'el otro lugar espera al ganador de cuartos-2');
  assert.deepEqual(sf1.despuesDe, ['cuartos-2']);
});

test('detecta propagación rota', () => {
  const c = fx.armarLlavePorZonas(4, 2, asignarReal);
  const roto = structuredClone(c);
  roto.rondas[0].partidos[1].siguiente_slot = 1;   // dos ganadores al mismo lugar
  assert.ok(simularPropagacion(roto).errores.some(e => /ya ocupado/.test(e)));
  const sinSig = structuredClone(c);
  sinSig.rondas[0].partidos[0].siguiente_key = 'nada-1';
  assert.ok(simularPropagacion(sinSig).errores.some(e => /siguiente inexistente/.test(e)));
  const vacio = structuredClone(c);
  vacio.rondas[0].partidos[0].pareja2_id = null;
  assert.ok(simularPropagacion(vacio).errores.some(e => /sin dos participantes/.test(e)));
});

test('prioridad de plantillas: club → global → interna, con rango de parejas', () => {
  const invertida = structuredClone(BRACKET_RULES.pairs_6_8);
  invertida.rondas.semifinal[0].visitante = '2B';
  const global = { ...invertida, nombre: 'Global 2 zonas', origen: 'global', templateId: 1, id_tenant: null, min: 6, max: 7 };
  const club = { ...invertida, nombre: 'Club 7 · 2 zonas', origen: 'club', templateId: 2, id_tenant: 7 };
  templates._setCache([global, club]);
  try {
    assert.equal(templates.reglaPara(2, 2, { clubId: 7, parejas: 8 }).nombre, 'Club 7 · 2 zonas');
    assert.equal(templates.reglaPara(2, 2, { clubId: 3, parejas: 6 }).nombre, 'Global 2 zonas');
    assert.equal(templates.reglaPara(2, 2, { clubId: 3, parejas: 8 }).origen, 'interna', 'fuera del rango de la global → interna');
    assert.equal(templates.reglaPara(4, 2).origen, 'interna');
    assert.equal(templates.reglaPara(11, 2), null);
    const c = fx.armarLlavePorZonas(2, 2, null, { clubId: 7 });
    assert.equal(c.regla, 'Club 7 · 2 zonas');
  } finally { templates._setCache([]); }
});

test('desdeFila: fila de BD → regla', () => {
  const r = templates.desdeFila({ id: 5, name: 'X', zones: 2, clasifican: 2, min_pairs: null, max_pairs: 8, id_tenant: null, template_json: JSON.stringify({ rondas: BRACKET_RULES.pairs_6_8.rondas }) });
  assert.equal(r.origen, 'global');
  assert.equal(r.max, 8);
  assert.equal(r.min, undefined);
  assert.equal(generarCuadro(r).rondas.length, 2);
});
