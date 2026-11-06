'use strict';
/**
 * services/brackets/bracketPropagator.js — Propagación de ganadores sobre un cuadro.
 *
 * simularPropagacion(cuadro, elegir) recorre la llave ronda por ronda como lo hace la base de
 * datos al cargar resultados (ganador → siguiente_key / siguiente_slot) y verifica que:
 *   - cada partido a jugar recibe exactamente dos participantes,
 *   - nadie juega dos veces en la misma ronda ni ocupa un lugar ya tomado,
 *   - queda un único campeón.
 * `elegir(partido)` devuelve 1 o 2 (quién gana). Se usa en la validación de plantillas y en tests.
 *
 * @param {import('./bracketTypes').Cuadro} cuadro
 * @param {(p: object) => 1|2} [elegir]
 * @returns {{ errores: string[], campeon: any, jugados: number }}
 */
function simularPropagacion(cuadro, elegir = () => 1) {
  const porKey = new Map(cuadro.rondas.flatMap(r => r.partidos.map(p => [p.key, { ...p }])));
  const errores = [];
  let campeon = null;
  let jugados = 0;
  for (const r of cuadro.rondas) {
    const vistos = new Set();
    for (const def of r.partidos) {
      const p = porKey.get(def.key);
      if (p.es_bye) continue;   // el BYE ya dejó a su clasificado en la ronda siguiente
      if (p.pareja1_id == null || p.pareja2_id == null) { errores.push(`${p.key}: sin dos participantes`); continue; }
      for (const id of [p.pareja1_id, p.pareja2_id]) {
        if (vistos.has(id)) errores.push(`${id} juega dos veces en ${r.ronda}`);
        vistos.add(id);
      }
      jugados++;
      const ganador = elegir(p) === 2 ? p.pareja2_id : p.pareja1_id;
      if (!p.siguiente_key) { if (campeon != null) errores.push('más de una final'); campeon = ganador; continue; }
      const sig = porKey.get(p.siguiente_key);
      if (!sig) { errores.push(`${p.key}: siguiente inexistente ${p.siguiente_key}`); continue; }
      if (sig[`pareja${p.siguiente_slot}_id`] != null) errores.push(`${sig.key} slot ${p.siguiente_slot} ya ocupado`);
      sig[`pareja${p.siguiente_slot}_id`] = ganador;
    }
  }
  if (campeon == null) errores.push('no se puede determinar el campeón');
  return { errores, campeon, jugados };
}

/** Estrategias de prueba: siempre local, siempre visitante y alternado. */
const ESTRATEGIAS = [() => 1, () => 2, (p) => (p.orden % 2 ? 1 : 2)];

module.exports = { simularPropagacion, ESTRATEGIAS };
