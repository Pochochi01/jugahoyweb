/**
 * tests/llaves-oficiales.test.js — Cruces oficiales de la fase final (unitarias, sin base de datos).
 *
 *   npm run test:llaves
 *
 * Para 6 a 17 parejas (zonas de 3 → 2, 3, 4 o 5 zonas con 2 clasificados):
 * cantidad de zonas, regla aplicada, cruces EXACTOS del reglamento, cantidad de partidos,
 * BYES, ausencia de duplicados / cruces de la misma zona y propagación de ganadores
 * hasta el campeón (simulando todos los resultados posibles de la primera ronda).
 */
const fx = require('../src/services/torneos/fixtureService');
const { BRACKET_RULES, validarRegla } = require('../src/services/brackets/configurations');
const { generateBracketFromZones, validarLlave } = require('../src/services/brackets/generateBracket');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

// Reglamento (archivos adjuntos): primera ronda real, en orden, y llaves completas
const OFICIAL = {
  2: { zonas: 2, partidos: 3, rondas: {
    semifinal: ['1° Zona A vs 2° Zona B', '1° Zona B vs 2° Zona A'],
    final: ['Ganador semifinal-1 vs Ganador semifinal-2'] } },
  3: { zonas: 3, partidos: 5, rondas: {
    cuartos: ['1° Zona A vs BYE', '2° Zona B vs 2° Zona C', '1° Zona C vs 2° Zona A', 'BYE vs 1° Zona B'],
    semifinal: ['1° Zona A vs Ganador cuartos-2', 'Ganador cuartos-3 vs 1° Zona B'],
    final: ['Ganador semifinal-1 vs Ganador semifinal-2'] } },
  4: { zonas: 4, partidos: 7, rondas: {
    cuartos: ['1° Zona A vs 2° Zona C', '2° Zona B vs 1° Zona D', '1° Zona C vs 2° Zona A', '2° Zona D vs 1° Zona B'],
    semifinal: ['Ganador cuartos-1 vs Ganador cuartos-2', 'Ganador cuartos-3 vs Ganador cuartos-4'],
    final: ['Ganador semifinal-1 vs Ganador semifinal-2'] } },
  5: { zonas: 5, partidos: 9, rondas: {
    octavos: ['1° Zona A vs BYE', '2° Zona B vs 2° Zona C', '1° Zona D vs BYE', '1° Zona E vs BYE', '1° Zona B vs BYE', '2° Zona A vs 2° Zona D', '1° Zona C vs BYE', '2° Zona E vs BYE'],
    cuartos: ['1° Zona A vs Ganador octavos-2', '1° Zona D vs 1° Zona E', '1° Zona B vs Ganador octavos-6', '1° Zona C vs 2° Zona E'],
    semifinal: ['Ganador cuartos-1 vs Ganador cuartos-2', 'Ganador cuartos-3 vs Ganador cuartos-4'],
    final: ['Ganador semifinal-1 vs Ganador semifinal-2'] } },
};
const ZONAS_POR_PAREJAS = { 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 4, 13: 4, 14: 4, 15: 5, 16: 5, 17: 5 };

/** Texto de cada partido: "1° Zona A vs 2° Zona B", "Ganador cuartos-2", "BYE". */
function textos(cuadro) {
  const et = (id) => cuadro.plazas.find(p => p.key === id)?.etiqueta;
  const out = {};
  for (const r of cuadro.rondas) {
    out[r.ronda] = r.partidos.map(p => {
      const lado = (slot) => {
        const id = p[`pareja${slot}_id`];
        if (id) return et(id);
        const origen = p.origen?.[slot === 1 ? 'local' : 'visitante'];
        return origen?.startsWith('W:') ? `Ganador ${origen.slice(2)}` : 'BYE';
      };
      return `${lado(1)} vs ${lado(2)}`;
    });
  }
  return out;
}

/**
 * Simula la llave completa con una estrategia de ganadores y verifica la propagación:
 * cada partido real recibe exactamente dos participantes, nadie juega dos veces la misma
 * ronda y queda un campeón.
 */
function simular(cuadro, elegir) {
  const porKey = new Map(cuadro.rondas.flatMap(r => r.partidos.map(p => [p.key, { ...p }])));
  const errores = [];
  let campeon = null;
  for (const r of cuadro.rondas) {
    const vistos = new Set();
    for (const def of r.partidos) {
      const p = porKey.get(def.key);
      if (p.es_bye) continue;   // el BYE ya dejó a su clasificado en la ronda siguiente
      if (!p.pareja1_id || !p.pareja2_id) { errores.push(`${p.key} sin dos participantes`); continue; }
      for (const id of [p.pareja1_id, p.pareja2_id]) { if (vistos.has(id)) errores.push(`${id} juega dos veces en ${r.ronda}`); vistos.add(id); }
      const ganador = elegir(p) === 1 ? p.pareja1_id : p.pareja2_id;
      if (!p.siguiente_key) { campeon = ganador; continue; }
      const sig = porKey.get(p.siguiente_key);
      if (sig[`pareja${p.siguiente_slot}_id`]) errores.push(`${sig.key} slot ${p.siguiente_slot} ya ocupado`);
      sig[`pareja${p.siguiente_slot}_id`] = ganador;
    }
  }
  if (!campeon) errores.push('sin campeón');
  return { errores, campeon };
}

// ── Reglas ──
for (const [nombre, regla] of Object.entries(BRACKET_RULES)) {
  const e = validarRegla(regla);
  ok(!e.length, `regla ${nombre} válida${e.length ? `: ${e.join('; ')}` : ''}`);
}
const rota = JSON.parse(JSON.stringify(BRACKET_RULES.zones4));
rota.rondas.cuartos[0].visitante = '2A';
ok(validarRegla(rota).some(x => /misma zona/.test(x)) && validarRegla(rota).some(x => /2C aparece 0/.test(x)), 'validación detecta cruce de la misma zona y clasificado faltante');

// ── 6 a 17 parejas ──
for (let n = 6; n <= 17; n++) {
  const zonas = fx.cantidadZonas(n, 3);
  const of = OFICIAL[zonas];
  ok(zonas === ZONAS_POR_PAREJAS[n], `${n} parejas → ${zonas} zonas`);
  // zonas reales: tamaños equilibrados (diferencia máxima 1)
  const tam = fx.armarZonas(Array.from({ length: n }, (_, i) => ({ id: i + 1 })), { parejasPorZona: 3 }).map(z => z.length);
  ok(tam.length === zonas && Math.max(...tam) - Math.min(...tam) <= 1 && Math.min(...tam) >= 3, `${n} parejas: zonas equilibradas (${tam.join('-')})`);

  const ref = fx.armarLlavePorZonas(zonas, 2);
  const t = textos(ref);
  ok(JSON.stringify(t) === JSON.stringify(of.rondas), `${n} parejas: cruces oficiales ${Object.entries(t).map(([r, ps]) => `${r}: ${ps.join(' | ')}`).join(' / ')}`);
  const reales = ref.rondas.flatMap(r => r.partidos).filter(p => !p.es_bye).length;
  ok(reales === of.partidos, `${n} parejas: ${reales} partidos a jugar (${zonas * 2} clasificados → ${zonas * 2 - 1})`);

  // Llave real: cada plaza → pareja (zona z, posición p) = id z*10+p
  const real = fx.armarLlavePorZonas(zonas, 2, (pl) => (pl.zona_idx + 1) * 10 + pl.posicion);
  const e = validarLlave(real, { zonaDe: (id) => Math.floor(id / 10), esperados: zonas * 2 });
  ok(!e.length, `${n} parejas: sin faltantes, duplicados ni cruces de la misma zona${e.length ? ` (${e.join('; ')})` : ''}`);
  const ids = real.rondas[0].partidos.flatMap(p => [p.pareja1_id, p.pareja2_id]).filter(Boolean);
  ok(ids.length === zonas * 2 && new Set(ids).size === ids.length, `${n} parejas: cada clasificado aparece una sola vez`);
  ok(real.rondas.flatMap(r => r.partidos).every(p => p.siguiente_key || p.key === 'final-1'), `${n} parejas: todos los partidos tienen siguiente (salvo la final)`);
  // Propagación: gana siempre el local, siempre el visitante y alternado
  const estrategias = [() => 1, () => 2, (p) => (p.orden % 2 ? 1 : 2)];
  const sims = estrategias.map(f => simular(real, f));
  ok(sims.every(sm => !sm.errores.length && sm.campeon), `${n} parejas: los ganadores se propagan hasta el campeón (${sims.map(sm => sm.campeon).join(', ')})${sims.flatMap(sm => sm.errores).slice(0, 2).join('; ')}`);
}

// ── Faltan clasificados → armado genérico (no inventa cruces) ──
const sinUno = fx.armarLlavePorZonas(3, 2, (pl) => (pl.zona_idx === 2 && pl.posicion === 2 ? null : (pl.zona_idx + 1) * 10 + pl.posicion));
ok(!sinUno.regla && validarLlave(sinUno).length === 0, 'zona sin 2° clasificado → armado genérico por siembra (la regla oficial exige los 6)');
ok(generateBracketFromZones(6, 2) === null && fx.armarLlavePorZonas(6, 2).rondas[0].ronda === 'octavos', 'sin regla oficial (6 zonas) → armado genérico');

console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
process.exit(fallas ? 1 : 0);
