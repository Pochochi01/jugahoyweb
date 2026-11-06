'use strict';
/**
 * services/brackets/bracketRules.js — Reglas INTERNAS (formatos oficiales) de la fase final.
 *
 * Cada regla describe la llave partido por partido (ver bracketTypes.js). Se selecciona por
 * cantidad de zonas y clasificados por zona; min/max son las parejas del reglamento con zonas
 * de 3 (cantidadZonas = parejas / 3 hacia abajo). Plantillas cargadas desde administración
 * (tournament_bracket_templates) tienen prioridad: ver bracketTemplates.js.
 *
 * Ante diferencias entre el texto y los diagramas oficiales, prevalece el diagrama.
 */

const ORDEN_RONDAS = ['16avos', 'octavos', 'cuartos', 'semifinal', 'final'];
const NOMBRES_RONDA = { '16avos': '16avos', octavos: 'Octavos', cuartos: 'Cuartos', semifinal: 'Semifinal', final: 'Final' };

const FINAL = [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }];
const SEMIS = [
  { key: 'semifinal-1', local: 'W:cuartos-1', visitante: 'W:cuartos-2', siguiente: { key: 'final-1', slot: 1 } },
  { key: 'semifinal-2', local: 'W:cuartos-3', visitante: 'W:cuartos-4', siguiente: { key: 'final-1', slot: 2 } },
];
/** Cuartos "ganador de octavos i vs i+1" (llave completa desde octavos). */
const CUARTOS_DESDE_OCTAVOS = [1, 2, 3, 4].map(i => ({
  key: `cuartos-${i}`, local: `W:octavos-${i * 2 - 1}`, visitante: `W:octavos-${i * 2}`,
  siguiente: { key: `semifinal-${Math.ceil(i / 2)}`, slot: i % 2 ? 1 : 2 },
}));
const aCuarto = (n, slot) => ({ key: `cuartos-${n}`, slot });
const aOctavo = (n, slot) => ({ key: `octavos-${n}`, slot });
const aSemi = (n, slot) => ({ key: `semifinal-${n}`, slot });

const BRACKET_RULES = {
  // ── 6, 7 u 8 parejas · 2 zonas ──
  pairs_6_8: {
    nombre: '6 a 8 parejas · 2 zonas', min: 6, max: 8, zonas: 2, clasifican: 2,
    rondas: {
      semifinal: [
        { key: 'semifinal-1', local: '1A', visitante: '2B', siguiente: { key: 'final-1', slot: 1 } },
        { key: 'semifinal-2', local: '1B', visitante: '2A', siguiente: { key: 'final-1', slot: 2 } },
      ],
      final: FINAL,
    },
  },

  // ── 9, 10 u 11 parejas · 3 zonas ── (2°B vs 2°C → 1°A · 1°C vs 2°A → 1°B)
  pairs_9_11: {
    nombre: '9 a 11 parejas · 3 zonas', min: 9, max: 11, zonas: 3, clasifican: 2,
    rondas: {
      cuartos: [
        { key: 'cuartos-1', local: '1A', visitante: null, siguiente: aSemi(1, 1) },   // BYE
        { key: 'cuartos-2', local: '2B', visitante: '2C', siguiente: aSemi(1, 2) },
        { key: 'cuartos-3', local: '1C', visitante: '2A', siguiente: aSemi(2, 1) },
        { key: 'cuartos-4', local: null, visitante: '1B', siguiente: aSemi(2, 2) },   // BYE
      ],
      semifinal: SEMIS, final: FINAL,
    },
  },

  // ── 12, 13 o 14 parejas · 4 zonas ──
  pairs_12_14: {
    nombre: '12 a 14 parejas · 4 zonas', min: 12, max: 14, zonas: 4, clasifican: 2,
    rondas: {
      cuartos: [
        { key: 'cuartos-1', local: '1A', visitante: '2C', siguiente: aSemi(1, 1) },
        { key: 'cuartos-2', local: '2B', visitante: '1D', siguiente: aSemi(1, 2) },
        { key: 'cuartos-3', local: '1C', visitante: '2A', siguiente: aSemi(2, 1) },
        { key: 'cuartos-4', local: '2D', visitante: '1B', siguiente: aSemi(2, 2) },
      ],
      semifinal: SEMIS, final: FINAL,
    },
  },

  // ── 15, 16 o 17 parejas · 5 zonas ── (repechajes 2°B-2°C → 1°A y 2°A-2°D → 1°B)
  pairs_15_17: {
    nombre: '15 a 17 parejas · 5 zonas', min: 15, max: 17, zonas: 5, clasifican: 2,
    etiquetas: { octavos: 'Repechaje' },
    rondas: {
      octavos: [
        { key: 'octavos-1', local: '1A', visitante: null, siguiente: aCuarto(1, 1) },
        { key: 'octavos-2', local: '2B', visitante: '2C', siguiente: aCuarto(1, 2) },
        { key: 'octavos-3', local: '1D', visitante: null, siguiente: aCuarto(2, 1) },
        { key: 'octavos-4', local: '1E', visitante: null, siguiente: aCuarto(2, 2) },
        { key: 'octavos-5', local: '1B', visitante: null, siguiente: aCuarto(3, 1) },
        { key: 'octavos-6', local: '2A', visitante: '2D', siguiente: aCuarto(3, 2) },
        { key: 'octavos-7', local: '1C', visitante: null, siguiente: aCuarto(4, 1) },
        { key: 'octavos-8', local: '2E', visitante: null, siguiente: aCuarto(4, 2) },
      ],
      cuartos: CUARTOS_DESDE_OCTAVOS, semifinal: SEMIS, final: FINAL,
    },
  },

  // ── 18, 19 o 20 parejas · 6 zonas ──
  // Repechajes: 2°F-2°C → 1°A · 1°E-2°B → 1°D · 2°A-1°F → 1°C · 2°E-2°D → 1°B
  // Semifinal superior: sectores A y D · inferior: sectores C y B
  pairs_18_20: {
    nombre: '18 a 20 parejas · 6 zonas', min: 18, max: 20, zonas: 6, clasifican: 2,
    etiquetas: { octavos: 'Repechaje' },
    rondas: {
      octavos: [
        { key: 'octavos-1', local: '2F', visitante: '2C', siguiente: aCuarto(1, 2) },
        { key: 'octavos-2', local: '1E', visitante: '2B', siguiente: aCuarto(2, 2) },
        { key: 'octavos-3', local: '2A', visitante: '1F', siguiente: aCuarto(3, 2) },
        { key: 'octavos-4', local: '2E', visitante: '2D', siguiente: aCuarto(4, 1) },
      ],
      cuartos: [
        { key: 'cuartos-1', local: '1A', visitante: 'W:octavos-1', siguiente: aSemi(1, 1) },
        { key: 'cuartos-2', local: '1D', visitante: 'W:octavos-2', siguiente: aSemi(1, 2) },
        { key: 'cuartos-3', local: '1C', visitante: 'W:octavos-3', siguiente: aSemi(2, 1) },
        { key: 'cuartos-4', local: 'W:octavos-4', visitante: '1B', siguiente: aSemi(2, 2) },
      ],
      semifinal: SEMIS, final: FINAL,
    },
  },

  // ── 21, 22 o 23 parejas · 7 zonas ── (diagrama oficial; el texto decía "8 zonas": son A–G)
  // Bloque A: 1°A vs Ganador(2°F-2°G) · Bloque B: (1°E-2°C) vs (2°B-1°D)
  // Bloque C: (1°C-2°A) vs (2°D-1°F) · Bloque D: Ganador(1°G-2°E) vs 1°B
  pairs_21_23: {
    nombre: '21 a 23 parejas · 7 zonas', min: 21, max: 23, zonas: 7, clasifican: 2,
    rondas: {
      octavos: [
        { key: 'octavos-1', local: '2F', visitante: '2G', siguiente: aCuarto(1, 2) },
        { key: 'octavos-2', local: '1E', visitante: '2C', siguiente: aCuarto(2, 1) },
        { key: 'octavos-3', local: '2B', visitante: '1D', siguiente: aCuarto(2, 2) },
        { key: 'octavos-4', local: '1C', visitante: '2A', siguiente: aCuarto(3, 1) },
        { key: 'octavos-5', local: '2D', visitante: '1F', siguiente: aCuarto(3, 2) },
        { key: 'octavos-6', local: '1G', visitante: '2E', siguiente: aCuarto(4, 1) },
      ],
      cuartos: [
        { key: 'cuartos-1', local: '1A', visitante: 'W:octavos-1', siguiente: aSemi(1, 1) },
        { key: 'cuartos-2', local: 'W:octavos-2', visitante: 'W:octavos-3', siguiente: aSemi(1, 2) },
        { key: 'cuartos-3', local: 'W:octavos-4', visitante: 'W:octavos-5', siguiente: aSemi(2, 1) },
        { key: 'cuartos-4', local: 'W:octavos-6', visitante: '1B', siguiente: aSemi(2, 2) },
      ],
      semifinal: SEMIS, final: FINAL,
    },
  },

  // ── 24, 25 o 26 parejas · 8 zonas ── (octavos completos)
  pairs_24_26: {
    nombre: '24 a 26 parejas · 8 zonas', min: 24, max: 26, zonas: 8, clasifican: 2,
    rondas: {
      octavos: [
        ['1A', '2B'], ['2G', '1H'], ['1E', '2F'], ['2C', '1D'],
        ['1C', '2D'], ['2E', '1F'], ['1G', '2H'], ['2A', '1B'],
      ].map(([l, v], i) => ({ key: `octavos-${i + 1}`, local: l, visitante: v, siguiente: aCuarto(Math.ceil((i + 1) / 2), i % 2 ? 2 : 1) })),
      cuartos: CUARTOS_DESDE_OCTAVOS, semifinal: SEMIS, final: FINAL,
    },
  },

  // ── 27, 28 o 29 parejas · 9 zonas ── (repechajes 2°B-2°C → 1°A y 2°D-2°A → 1°B)
  pairs_27_29: {
    nombre: '27 a 29 parejas · 9 zonas', min: 27, max: 29, zonas: 9, clasifican: 2,
    etiquetas: { '16avos': 'Repechaje' },
    rondas: {
      '16avos': [
        { key: '16avos-1', local: '2B', visitante: '2C', siguiente: aOctavo(1, 2) },
        { key: '16avos-2', local: '2D', visitante: '2A', siguiente: aOctavo(8, 1) },
      ],
      octavos: [
        ['1A', 'W:16avos-1'], ['1I', '1H'], ['1E', '2G'], ['2F', '1D'],
        ['1C', '2E'], ['2H', '1F'], ['1G', '2I'], ['W:16avos-2', '1B'],
      ].map(([l, v], i) => ({ key: `octavos-${i + 1}`, local: l, visitante: v, siguiente: aCuarto(Math.ceil((i + 1) / 2), i % 2 ? 2 : 1) })),
      cuartos: CUARTOS_DESDE_OCTAVOS, semifinal: SEMIS, final: FINAL,
    },
  },
};

// ── 30, 31 o 32 parejas · 10 zonas ── (diagrama oficial; donde la imagen repite 2°D se usa 1°J,
// confirmado: el cuarto es 1°G vs 1°J). Repechajes: 2°C-2°F → 1°A · 2°G-2°B → 1°D · 2°A-2°H → 1°C · 2°E-2°D → 1°B
BRACKET_RULES.pairs_30_32 = {
  nombre: '30 a 32 parejas · 10 zonas', min: 30, max: 32, zonas: 10, clasifican: 2,
  etiquetas: { '16avos': 'Repechaje' },
  rondas: {
    '16avos': [
      { key: '16avos-1', local: '2C', visitante: '2F', siguiente: aOctavo(1, 2) },
      { key: '16avos-2', local: '2G', visitante: '2B', siguiente: aOctavo(4, 1) },
      { key: '16avos-3', local: '2A', visitante: '2H', siguiente: aOctavo(5, 2) },
      { key: '16avos-4', local: '2E', visitante: '2D', siguiente: aOctavo(8, 1) },
    ],
    octavos: [
      ['1A', 'W:16avos-1'], ['1I', '1H'], ['1E', '2J'], ['W:16avos-2', '1D'],
      ['1C', 'W:16avos-3'], ['2I', '1F'], ['1G', '1J'], ['W:16avos-4', '1B'],
    ].map(([l, v], i) => ({ key: `octavos-${i + 1}`, local: l, visitante: v, siguiente: aCuarto(Math.ceil((i + 1) / 2), i % 2 ? 2 : 1) })),
    cuartos: CUARTOS_DESDE_OCTAVOS, semifinal: SEMIS, final: FINAL,
  },
};

/** Nombre visible de una ronda (la regla puede renombrarla: "Repechaje"). */
const nombreRonda = (regla, ronda) => regla?.etiquetas?.[ronda] || NOMBRES_RONDA[ronda] || ronda;

module.exports = { BRACKET_RULES, ORDEN_RONDAS, NOMBRES_RONDA, nombreRonda };
