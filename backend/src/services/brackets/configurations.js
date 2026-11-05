'use strict';
/**
 * services/brackets/configurations.js — Cruces OFICIALES de la fase final por cantidad de zonas.
 *
 * Cada regla describe la llave completa, partido por partido:
 *   key        "<ronda>-<orden>" (la misma clave que usa la programación de horarios)
 *   local / visitante:
 *       '1A'           → 1° de la Zona A (posición + letra de zona)
 *       'W:cuartos-1'  → ganador de ese partido
 *       null           → BYE (el otro participante pasa directo)
 *   siguiente  { key, slot }  partido al que avanza el ganador (null = final)
 *
 * Reglas (2 clasificados por zona):
 *   2 zonas (6–8 parejas)   semifinales directas
 *   3 zonas (9–11 parejas)  cuartos con BYE para 1° A y 1° B
 *   4 zonas (12–14 parejas) cuartos completos
 *   5 zonas (15–17 parejas) repechajes (octavos) + cuartos
 *
 * Para agregar un formato nuevo: sumar una entrada a BRACKET_RULES (validarRegla() la verifica
 * al cargar el módulo y en los tests). Sin regla para la combinación zonas × clasificados,
 * se usa el armado genérico por siembra (fixtureService.armarLlave).
 */

const BRACKET_RULES = {
  // ── CASO 1 · 6, 7 u 8 parejas · 2 zonas ──
  zones2: {
    zonas: 2, clasifican: 2, parejas: [6, 8],
    rondas: {
      semifinal: [
        { key: 'semifinal-1', local: '1A', visitante: '2B', siguiente: { key: 'final-1', slot: 1 } },
        { key: 'semifinal-2', local: '1B', visitante: '2A', siguiente: { key: 'final-1', slot: 2 } },
      ],
      final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }],
    },
  },

  // ── CASO 2 · 9, 10 u 11 parejas · 3 zonas ──
  // Cuarto 1: 2°B vs 2°C (el ganador enfrenta a 1°A) · Cuarto 2: 1°C vs 2°A (el ganador enfrenta a 1°B)
  zones3: {
    zonas: 3, clasifican: 2, parejas: [9, 11],
    rondas: {
      cuartos: [
        { key: 'cuartos-1', local: '1A', visitante: null, siguiente: { key: 'semifinal-1', slot: 1 } },   // BYE
        { key: 'cuartos-2', local: '2B', visitante: '2C', siguiente: { key: 'semifinal-1', slot: 2 } },   // "Cuarto 1"
        { key: 'cuartos-3', local: '1C', visitante: '2A', siguiente: { key: 'semifinal-2', slot: 1 } },   // "Cuarto 2"
        { key: 'cuartos-4', local: null, visitante: '1B', siguiente: { key: 'semifinal-2', slot: 2 } },   // BYE
      ],
      semifinal: [
        { key: 'semifinal-1', local: 'W:cuartos-1', visitante: 'W:cuartos-2', siguiente: { key: 'final-1', slot: 1 } },   // 1°A vs Ganador Cuarto 1
        { key: 'semifinal-2', local: 'W:cuartos-3', visitante: 'W:cuartos-4', siguiente: { key: 'final-1', slot: 2 } },   // Ganador Cuarto 2 vs 1°B
      ],
      final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }],
    },
  },

  // ── CASO 3 · 12, 13 o 14 parejas · 4 zonas ──
  zones4: {
    zonas: 4, clasifican: 2, parejas: [12, 14],
    rondas: {
      cuartos: [
        { key: 'cuartos-1', local: '1A', visitante: '2C', siguiente: { key: 'semifinal-1', slot: 1 } },
        { key: 'cuartos-2', local: '2B', visitante: '1D', siguiente: { key: 'semifinal-1', slot: 2 } },
        { key: 'cuartos-3', local: '1C', visitante: '2A', siguiente: { key: 'semifinal-2', slot: 1 } },
        { key: 'cuartos-4', local: '2D', visitante: '1B', siguiente: { key: 'semifinal-2', slot: 2 } },
      ],
      semifinal: [
        { key: 'semifinal-1', local: 'W:cuartos-1', visitante: 'W:cuartos-2', siguiente: { key: 'final-1', slot: 1 } },
        { key: 'semifinal-2', local: 'W:cuartos-3', visitante: 'W:cuartos-4', siguiente: { key: 'final-1', slot: 2 } },
      ],
      final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }],
    },
  },

  // ── CASO 4 · 15, 16 o 17 parejas · 5 zonas ──
  // Repechaje 1: 2°B vs 2°C (→ 1°A) · Repechaje 2°A vs 2°D (→ 1°B)
  // Cuartos directos: 1°D vs 1°E y 1°C vs 2°E
  // SF1: (1°A) vs (1°D vs 1°E) · SF2: (1°B) vs (1°C vs 2°E)
  zones5: {
    zonas: 5, clasifican: 2, parejas: [15, 17],
    etiquetas: { octavos: 'Repechaje' },   // nombre de la ronda en pantalla
    rondas: {
      octavos: [
        { key: 'octavos-1', local: '1A', visitante: null, siguiente: { key: 'cuartos-1', slot: 1 } },
        { key: 'octavos-2', local: '2B', visitante: '2C', siguiente: { key: 'cuartos-1', slot: 2 } },   // Repechaje 1
        { key: 'octavos-3', local: '1D', visitante: null, siguiente: { key: 'cuartos-2', slot: 1 } },
        { key: 'octavos-4', local: '1E', visitante: null, siguiente: { key: 'cuartos-2', slot: 2 } },
        { key: 'octavos-5', local: '1B', visitante: null, siguiente: { key: 'cuartos-3', slot: 1 } },
        { key: 'octavos-6', local: '2A', visitante: '2D', siguiente: { key: 'cuartos-3', slot: 2 } },   // Repechaje 2
        { key: 'octavos-7', local: '1C', visitante: null, siguiente: { key: 'cuartos-4', slot: 1 } },
        { key: 'octavos-8', local: '2E', visitante: null, siguiente: { key: 'cuartos-4', slot: 2 } },
      ],
      cuartos: [
        { key: 'cuartos-1', local: 'W:octavos-1', visitante: 'W:octavos-2', siguiente: { key: 'semifinal-1', slot: 1 } },   // 1°A vs Ganador Repechaje 1
        { key: 'cuartos-2', local: 'W:octavos-3', visitante: 'W:octavos-4', siguiente: { key: 'semifinal-1', slot: 2 } },   // 1°D vs 1°E
        { key: 'cuartos-3', local: 'W:octavos-5', visitante: 'W:octavos-6', siguiente: { key: 'semifinal-2', slot: 1 } },   // 1°B vs Ganador Repechaje 2
        { key: 'cuartos-4', local: 'W:octavos-7', visitante: 'W:octavos-8', siguiente: { key: 'semifinal-2', slot: 2 } },   // 1°C vs 2°E
      ],
      semifinal: [
        { key: 'semifinal-1', local: 'W:cuartos-1', visitante: 'W:cuartos-2', siguiente: { key: 'final-1', slot: 1 } },
        { key: 'semifinal-2', local: 'W:cuartos-3', visitante: 'W:cuartos-4', siguiente: { key: 'final-1', slot: 2 } },
      ],
      final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }],
    },
  },
};

const ORDEN_RONDAS = ['octavos', 'cuartos', 'semifinal', 'final'];
const LETRAS = 'ABCDEFGHIJKLMNOP';

/** '1A' → { posicion: 1, zona_idx: 0 } */
function parsePlaza(ref) {
  const m = /^(\d+)([A-Z])$/.exec(String(ref || ''));
  return m ? { posicion: Number(m[1]), zona_idx: LETRAS.indexOf(m[2]) } : null;
}

const NOMBRES_RONDA = { octavos: 'Octavos', cuartos: 'Cuartos', semifinal: 'Semifinal', final: 'Final' };
/** Nombre visible de una ronda (la regla puede renombrarla: "Repechaje"). */
const nombreRonda = (regla, ronda) => regla?.etiquetas?.[ronda] || NOMBRES_RONDA[ronda] || ronda;

/** Regla para una cantidad de zonas y clasificados por zona (o null). */
function reglaPara(numZonas, clasificanPorZona) {
  return Object.values(BRACKET_RULES).find(r => r.zonas === numZonas && r.clasifican === clasificanPorZona) || null;
}

/**
 * Valida una regla: todos los clasificados exactamente una vez, sin cruces de la misma zona
 * en la primera ronda, cada partido (salvo la final) con siguiente definido, los "W:" apuntan
 * a partidos que alimentan ese lugar, y la final es única. Devuelve la lista de errores.
 */
function validarRegla(regla) {
  const errores = [];
  const rondas = ORDEN_RONDAS.filter(r => regla.rondas[r]);
  const todos = rondas.flatMap(r => regla.rondas[r].map(p => ({ ...p, ronda: r })));
  const porKey = new Map(todos.map(p => [p.key, p]));
  if (porKey.size !== todos.length) errores.push('claves de partido repetidas');
  rondas.forEach(r => regla.rondas[r].forEach((p, i) => { if (p.key !== `${r}-${i + 1}`) errores.push(`${p.key}: la clave debe ser ${r}-${i + 1}`); }));

  // Clasificados: cada "posición + zona" exactamente una vez
  const esperadas = [];
  for (let pos = 1; pos <= regla.clasifican; pos++) for (let z = 0; z < regla.zonas; z++) esperadas.push(`${pos}${LETRAS[z]}`);
  const usadas = todos.flatMap(p => [p.local, p.visitante]).filter(x => x && !String(x).startsWith('W:'));
  for (const e of esperadas) {
    const n = usadas.filter(u => u === e).length;
    if (n !== 1) errores.push(`${e} aparece ${n} veces`);
  }
  for (const u of usadas) if (!esperadas.includes(u)) errores.push(`plaza desconocida ${u}`);

  // Primera ronda: sin cruces de la misma zona y sin partidos vacíos
  for (const p of regla.rondas[rondas[0]]) {
    const a = parsePlaza(p.local), b = parsePlaza(p.visitante);
    if (a && b && a.zona_idx === b.zona_idx) errores.push(`${p.key}: cruce de la misma zona (${p.local} vs ${p.visitante})`);
    if (!p.local && !p.visitante) errores.push(`${p.key}: partido sin participantes`);
  }

  // Árbol: siguiente definido, coherente con los "W:" y una sola final
  const finales = todos.filter(p => !p.siguiente);
  if (finales.length !== 1 || finales[0].ronda !== 'final') errores.push('debe haber exactamente una final (único partido sin siguiente)');
  for (const p of todos) {
    if (p.siguiente) {
      const sig = porKey.get(p.siguiente.key);
      if (!sig) { errores.push(`${p.key}: siguiente inexistente ${p.siguiente.key}`); continue; }
      if (rondas.indexOf(sig.ronda) !== rondas.indexOf(p.ronda) + 1) errores.push(`${p.key}: debe avanzar a la ronda siguiente`);
      const lugar = p.siguiente.slot === 1 ? sig.local : sig.visitante;
      if (lugar !== `W:${p.key}`) errores.push(`${p.key}: ${sig.key} slot ${p.siguiente.slot} debería ser W:${p.key}`);
    }
    for (const ref of [p.local, p.visitante]) {
      if (String(ref || '').startsWith('W:')) {
        const origen = porKey.get(ref.slice(2));
        if (!origen || origen.siguiente?.key !== p.key) errores.push(`${p.key}: ${ref} no alimenta este partido`);
      }
    }
    if (rondas.indexOf(p.ronda) > 0 && (!String(p.local).startsWith('W:') || !String(p.visitante).startsWith('W:'))) {
      errores.push(`${p.key}: las rondas posteriores solo reciben ganadores`);
    }
  }
  return errores;
}

// Las reglas se validan al cargar: una regla mal escrita no llega a producción
for (const [nombre, regla] of Object.entries(BRACKET_RULES)) {
  const errores = validarRegla(regla);
  if (errores.length) throw new Error(`BRACKET_RULES.${nombre} inválida: ${errores.join('; ')}`);
}

module.exports = { BRACKET_RULES, ORDEN_RONDAS, LETRAS, parsePlaza, reglaPara, validarRegla, nombreRonda };
