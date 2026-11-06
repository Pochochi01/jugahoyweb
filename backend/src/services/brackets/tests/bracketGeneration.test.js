'use strict';
/**
 * Generación de llaves de 6 a 32 parejas: zonas, plantilla aplicada, cruces EXACTOS del
 * reglamento, partidos a jugar y armado genérico donde todavía no hay plantilla oficial.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../../torneos/fixtureService');
const { generateBracketFromZones } = require('../bracketGenerator');
const { textos } = require('./helpers');

const G = (k) => `Ganador ${k}`;
// Reglamento: cruces por ronda
const OFICIAL = {
  2: { semifinal: ['1° Zona A vs 2° Zona B', '1° Zona B vs 2° Zona A'], final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`] },
  3: {
    cuartos: ['1° Zona A vs BYE', '2° Zona B vs 2° Zona C', '1° Zona C vs 2° Zona A', 'BYE vs 1° Zona B'],
    semifinal: [`1° Zona A vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs 1° Zona B`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  4: {
    cuartos: ['1° Zona A vs 2° Zona C', '2° Zona B vs 1° Zona D', '1° Zona C vs 2° Zona A', '2° Zona D vs 1° Zona B'],
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  5: {
    octavos: ['1° Zona A vs BYE', '2° Zona B vs 2° Zona C', '1° Zona D vs BYE', '1° Zona E vs BYE', '1° Zona B vs BYE', '2° Zona A vs 2° Zona D', '1° Zona C vs BYE', '2° Zona E vs BYE'],
    cuartos: [`1° Zona A vs ${G('octavos-2')}`, '1° Zona D vs 1° Zona E', `1° Zona B vs ${G('octavos-6')}`, '1° Zona C vs 2° Zona E'],
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  6: {
    octavos: ['2° Zona F vs 2° Zona C', '1° Zona E vs 2° Zona B', '2° Zona A vs 1° Zona F', '2° Zona E vs 2° Zona D'],
    cuartos: [`1° Zona A vs ${G('octavos-1')}`, `1° Zona D vs ${G('octavos-2')}`, `1° Zona C vs ${G('octavos-3')}`, `${G('octavos-4')} vs 1° Zona B`],
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  7: {
    octavos: ['2° Zona F vs 2° Zona G', '1° Zona E vs 2° Zona C', '2° Zona B vs 1° Zona D', '1° Zona C vs 2° Zona A', '2° Zona D vs 1° Zona F', '1° Zona G vs 2° Zona E'],
    cuartos: [`1° Zona A vs ${G('octavos-1')}`, `${G('octavos-2')} vs ${G('octavos-3')}`, `${G('octavos-4')} vs ${G('octavos-5')}`, `${G('octavos-6')} vs 1° Zona B`],
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  8: {
    octavos: ['1° Zona A vs 2° Zona B', '2° Zona G vs 1° Zona H', '1° Zona E vs 2° Zona F', '2° Zona C vs 1° Zona D', '1° Zona C vs 2° Zona D', '2° Zona E vs 1° Zona F', '1° Zona G vs 2° Zona H', '2° Zona A vs 1° Zona B'],
    cuartos: [1, 2, 3, 4].map(i => `${G(`octavos-${2 * i - 1}`)} vs ${G(`octavos-${2 * i}`)}`),
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  9: {
    '16avos': ['2° Zona B vs 2° Zona C', '2° Zona D vs 2° Zona A'],
    octavos: [`1° Zona A vs ${G('16avos-1')}`, '1° Zona I vs 1° Zona H', '1° Zona E vs 2° Zona G', '2° Zona F vs 1° Zona D', '1° Zona C vs 2° Zona E', '2° Zona H vs 1° Zona F', '1° Zona G vs 2° Zona I', `${G('16avos-2')} vs 1° Zona B`],
    cuartos: [1, 2, 3, 4].map(i => `${G(`octavos-${2 * i - 1}`)} vs ${G(`octavos-${2 * i}`)}`),
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
  10: {
    '16avos': ['2° Zona C vs 2° Zona F', '2° Zona G vs 2° Zona B', '2° Zona A vs 2° Zona H', '2° Zona E vs 2° Zona D'],
    octavos: [`1° Zona A vs ${G('16avos-1')}`, '1° Zona I vs 1° Zona H', '1° Zona E vs 2° Zona J', `${G('16avos-2')} vs 1° Zona D`, `1° Zona C vs ${G('16avos-3')}`, '2° Zona I vs 1° Zona F', '1° Zona G vs 1° Zona J', `${G('16avos-4')} vs 1° Zona B`],
    cuartos: [1, 2, 3, 4].map(i => `${G(`octavos-${2 * i - 1}`)} vs ${G(`octavos-${2 * i}`)}`),
    semifinal: [`${G('cuartos-1')} vs ${G('cuartos-2')}`, `${G('cuartos-3')} vs ${G('cuartos-4')}`],
    final: [`${G('semifinal-1')} vs ${G('semifinal-2')}`],
  },
};


for (let n = 6; n <= 32; n++) {
  test(`${n} parejas`, () => {
    const zonas = fx.cantidadZonas(n, 3);
    assert.equal(zonas, Math.floor(n / 3), 'zonas de 3 (el resto se reparte)');
    const tam = fx.armarZonas(Array.from({ length: n }, (_, i) => ({ id: i + 1 })), { parejasPorZona: 3 }).map(z => z.length);
    assert.equal(tam.length, zonas);
    assert.ok(Math.max(...tam) - Math.min(...tam) <= 1 && Math.min(...tam) >= 3, `zonas equilibradas ${tam}`);

    const cuadro = fx.armarLlavePorZonas(zonas, 2, null, { parejas: n });
    const aJugar = cuadro.rondas.flatMap(r => r.partidos).filter(p => !p.es_bye).length;
    assert.equal(aJugar, zonas * 2 - 1, 'clasificados − 1 partidos a jugar');
    assert.deepEqual(textos(cuadro), OFICIAL[zonas]);
  });
}

test('el generador devuelve null sin plantilla y respeta clasificados por zona', () => {
  assert.equal(generateBracketFromZones(11, 2), null);
  assert.equal(generateBracketFromZones(4, 3), null);
  assert.equal(fx.armarLlavePorZonas(4, 3).regla, undefined);
});

test('faltan clasificados → armado genérico (no inventa cruces)', () => {
  const c = fx.armarLlavePorZonas(4, 2, (pl) => (pl.zona_idx === 3 && pl.posicion === 2 ? null : (pl.zona_idx + 1) * 10 + pl.posicion));
  assert.equal(c.regla, undefined);
});

test('llave de 32 en el armado genérico (11 zonas, sin plantilla): empieza en 16avos con BYES', () => {
  assert.deepEqual(fx.rondaInicial(11, 2), { tam: 32, ronda: '16avos', clasificados: 22, byes: 10 });
  const c = fx.armarLlavePorZonas(11, 2);
  assert.equal(c.regla, undefined);
  assert.equal(c.rondas[0].ronda, '16avos');
  assert.equal(c.rondas[0].partidos.filter(p => p.es_bye).length, 10);
});
