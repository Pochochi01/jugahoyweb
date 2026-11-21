'use strict';
/**
 * Relámpago Todos contra Todos por Zonas — algoritmo puro (fixtureService).   npm run test:relampago:rr
 * Zonas de 4 / 5, sorteo reproducible, partido compensatorio, equilibrio de partidos puntuables y tabla.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../src/services/torneos/fixtureService');
const fmt = require('../src/services/torneos/formatoPartido');

const ESPERADO = { 4: '4', 5: '5', 8: '4+4', 9: '5+4', 12: '4+4+4', 13: '5+4+4', 17: '5+4+4+4', 21: '5+4+4+4+4' };

test('cantidad de zonas: preferentemente de 4, de 5 con el sobrante', () => {
  for (const [n, tam] of Object.entries(ESPERADO)) {
    const k = fx.cantidadZonasTodosContraTodos(Number(n));
    assert.equal(fx.tamaniosZonas(Number(n), k).join('+'), tam, `${n} parejas`);
  }
  for (let n = 4; n <= 40; n++) {
    const t = fx.tamaniosZonas(n, fx.cantidadZonasTodosContraTodos(n));
    assert.ok(Math.max(...t) - Math.min(...t) <= 1, `${n}: distribución equilibrada`);
    if (![6, 7, 11].includes(n)) assert.ok(t.every(x => x === 4 || x === 5), `${n}: solo zonas de 4 y 5 (${t})`);
    else assert.ok(t.every(x => x === 3 || x === 4), `${n}: caso límite con zonas de 3 (${t})`);
  }
  assert.throws(() => fx.cantidadZonasTodosContraTodos(1), /al menos 2/);
  assert.equal(fx.cantidadZonasTodosContraTodos(3), 1);
});

test('la serpiente produce los tamaños esperados', () => {
  for (const n of [8, 9, 13, 17, 21]) {
    const parejas = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
    const z = fx.generateSnakeSeedingZones(parejas, { zonas: fx.cantidadZonasTodosContraTodos(n) });
    assert.equal(z.map(x => x.parejas.length).sort((a, b) => b - a).join('+'), ESPERADO[n]);
  }
});

test('zona de 4: todos contra todos, 6 partidos, 3 puntuables cada una, sin sorteo', () => {
  const { cruces, sorteo } = fx.fixtureZonaEquilibrada([1, 2, 3, 4], fx.rngDesdeSemilla(1));
  assert.equal(cruces.length, 6);
  assert.equal(sorteo, null);
  assert.ok(cruces.every(c => !c.compensatorio && c.puntua_pareja1 && c.puntua_pareja2));
  assert.deepEqual([...fx.puntuablesPorPareja(cruces).values()], [3, 3, 3, 3]);
});

test('zona de 5: 8 partidos, 1 compensatorio, exactamente 3 puntuables por pareja (1000 sorteos)', () => {
  const vistas = new Set();
  for (let semilla = 1; semilla <= 1000; semilla++) {
    const ids = [11, 12, 13, 14, 15];
    const { cruces, sorteo } = fx.fixtureZonaEquilibrada(ids, fx.rngDesdeSemilla(semilla));
    vistas.add(sorteo.pareja_sorteada_id);
    assert.equal(cruces.length, 8);
    const comp = cruces.filter(c => c.compensatorio);
    assert.equal(comp.length, 1);
    // El compensatorio enfrenta a la sorteada con su rival y puntúa SOLO para el rival
    const c = comp[0];
    assert.equal(c.pareja1_id, sorteo.rival_id); assert.equal(c.pareja2_id, sorteo.pareja_sorteada_id);
    assert.equal(c.puntua_pareja1, true); assert.equal(c.puntua_pareja2, false);
    assert.equal(cruces[cruces.length - 1], c, 'el compensatorio va último');
    // Equilibrio: nadie tiene más partidos puntuables que otro
    const p = fx.puntuablesPorPareja(cruces);
    assert.deepEqual(ids.map(id => p.get(id)), [3, 3, 3, 3, 3]);
    // Sin cruces repetidos; la sorteada juega 4, el resto 3
    const claves = cruces.map(x => [x.pareja1_id, x.pareja2_id].sort().join('|'));
    assert.equal(new Set(claves).size, 8);
    const jugados = (id) => cruces.filter(x => x.pareja1_id === id || x.pareja2_id === id).length;
    assert.equal(jugados(sorteo.pareja_sorteada_id), 4);
    assert.ok(ids.filter(id => id !== sorteo.pareja_sorteada_id).every(id => jugados(id) === 3));
  }
  assert.equal(vistas.size, 5, 'el sorteo puede elegir a cualquiera de las 5');
});

test('sorteo reproducible con la semilla (transparencia)', () => {
  const a = fx.fixtureZonaEquilibrada([1, 2, 3, 4, 5], fx.rngDesdeSemilla(987654));
  const b = fx.fixtureZonaEquilibrada([1, 2, 3, 4, 5], fx.rngDesdeSemilla(987654));
  assert.deepEqual(a, b);
});

test('tabla: el compensatorio no cuenta NADA para la sorteada y cuenta completo para el rival', () => {
  // Zona de 5: S = 5 (sorteada), R = 1. Todos ganan/pierden igual salvo el compensatorio.
  const { cruces } = { cruces: [
    { pareja1_id: 1, pareja2_id: 2, ganador: 1 }, { pareja1_id: 1, pareja2_id: 3, ganador: 3 },
    { pareja1_id: 2, pareja2_id: 4, ganador: 2 }, { pareja1_id: 3, pareja2_id: 4, ganador: 4 },
    { pareja1_id: 5, pareja2_id: 2, ganador: 5 }, { pareja1_id: 5, pareja2_id: 3, ganador: 5 }, { pareja1_id: 5, pareja2_id: 4, ganador: 4 },
    { pareja1_id: 1, pareja2_id: 5, ganador: 5, compensatorio: true },
  ] };
  const partidos = cruces.map(c => ({
    pareja1_id: c.pareja1_id, pareja2_id: c.pareja2_id, estado: 'jugado',
    puntua_pareja1: true, puntua_pareja2: !c.compensatorio,
    resultado: { ganador_id: c.ganador, sets: [c.ganador === c.pareja1_id ? [4, 1] : [1, 4]] },
  }));
  const t = fx.tablaZona([1, 2, 3, 4, 5].map(id => ({ id })), partidos);
  const f = (id) => t.find(r => r.pareja_id === id);
  // Sorteada: ganó el compensatorio pero no suma: 3 PJ (2 PG, 1 PP), 2+2+1 = 5 puntos, games sin el 4-1 extra
  assert.deepEqual([f(5).pj, f(5).pg, f(5).pp, f(5).puntos, f(5).gf, f(5).gc, f(5).no_puntuables], [3, 2, 1, 5, 9, 6, 1]);
  // Rival: el compensatorio (lo perdió) le cuenta: 3 PJ, 1 PG, 2 PP, 2+1+1 = 4 puntos
  assert.deepEqual([f(1).pj, f(1).pg, f(1).pp, f(1).puntos, f(1).gf, f(1).gc], [3, 1, 2, 4, 6, 9]);
  // Todos con 3 partidos computados
  assert.ok(t.every(r => r.pj === 3));
  // Sin compensatorio la sorteada habría tenido 7 puntos: el sistema nunca la beneficia
  const sinRegla = fx.tablaZona([1, 2, 3, 4, 5].map(id => ({ id })), partidos.map(p => ({ ...p, puntua_pareja2: true })));
  assert.ok(sinRegla.find(r => r.pareja_id === 5).puntos > f(5).puntos);
});

test('el enfrentamiento directo del compensatorio no desempata', () => {
  // 1 y 2 empatados en todo; el único cruce entre ellos es el compensatorio (lo gana 2, la sorteada)
  const partidos = [
    { pareja1_id: 1, pareja2_id: 3, estado: 'jugado', resultado: { ganador_id: 1, sets: [[4, 2]] } },
    { pareja1_id: 2, pareja2_id: 3, estado: 'jugado', resultado: { ganador_id: 2, sets: [[4, 2]] } },
    { pareja1_id: 1, pareja2_id: 2, estado: 'jugado', puntua_pareja1: true, puntua_pareja2: false, resultado: { ganador_id: 2, sets: [[2, 4]] } },
  ];
  const t = fx.tablaZona([{ id: 1 }, { id: 2 }, { id: 3 }], partidos);
  const f = (id) => t.find(r => r.pareja_id === id);
  // 1: ganó a 3 (2) + perdió el compensatorio, que para el rival sí cuenta (1) = 3 · 2: solo su victoria (2)
  assert.deepEqual([f(1).puntos, f(1).pj, f(2).puntos, f(2).pj], [3, 2, 2, 1]);
  assert.ok(f(1).posicion < f(2).posicion, 'la victoria en el compensatorio no sube a la sorteada');
});

test('catálogo de modalidades: código histórico conservado, nombres nuevos', () => {
  assert.equal(fmt.nombreFormato('relampago'), 'Relámpago con Zonas y Llaves APA');
  assert.equal(fmt.nombreFormato('relampago_rr'), 'Relámpago Todos contra Todos por Zonas');
  assert.equal(fmt.nombreFormato(undefined), 'Tradicional');
  assert.ok(fmt.esRelampago({ formato: 'relampago' }) && fmt.esRelampago({ formato: 'relampago_rr' }));
  assert.ok(fmt.esTodosContraTodos({ formato: 'relampago_rr' }) && !fmt.esTodosContraTodos({ formato: 'relampago' }));
  assert.equal(fmt.reglaPartido({ formato: 'relampago_rr', formato_partidos: { zonas: { tipo: 'un_set', games: 5, tiebreak: 7 } } }, 'zona').games, 5);
});
