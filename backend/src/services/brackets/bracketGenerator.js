'use strict';
/**
 * services/brackets/bracketGenerator.js — Arma la llave a partir de una plantilla.
 *
 * generateBracketFromZones(numZonas, clasificanPorZona, asignar?, { clubId, parejas })
 *   1. Selecciona la plantilla (club → global de BD → regla interna) por zonas, clasificados y parejas.
 *   2. Resuelve cada plaza ("1° Zona A") con `asignar(plaza)` → pareja_id real; sin `asignar`
 *      queda la clave de referencia (cuadro previsto antes de terminar las zonas).
 *   3. Genera todas las rondas con su partido siguiente y slot (vínculos de propagación).
 *      BYE: el clasificado ocupa directo su lugar de la ronda siguiente y el BYE queda como walkover.
 *      Un clasificado también puede entrar directo en una ronda posterior ("Ganador → 1° Zona A").
 *
 * Devuelve el formato que consumen generarLlave (guardado), la simulación de horarios y la llave
 * de referencia; o null si no hay plantilla (se usa el armado genérico por siembra).
 */
const { ORDEN_RONDAS } = require('./bracketRules');
const { parsePlaza, esGanador, LETRAS } = require('./bracketValidator');

const nombreZona = (i) => `Zona ${LETRAS[i]}`;

/** Plazas de una regla en orden de siembra (1° A, 1° B… después 2° A, 2° B…). */
function plazasDe(regla) {
  const out = [];
  for (let pos = 1; pos <= regla.clasifican; pos++) {
    for (let z = 0; z < regla.zonas; z++) out.push({ zona_idx: z, posicion: pos, key: `${pos}-${z}`, etiqueta: `${pos}° ${nombreZona(z)}` });
  }
  return out;
}

/**
 * Arma el cuadro de una regla concreta.
 * @param {import('./bracketTypes').ReglaLlave} regla
 * @param {(plaza: import('./bracketTypes').PlazaLlave) => any} [asignar]
 * @returns {import('./bracketTypes').Cuadro}
 */
function generarCuadro(regla, asignar = null) {
  const plazas = plazasDe(regla);
  const valor = (ref) => {
    const p = parsePlaza(ref);
    const pl = p && plazas.find(x => x.zona_idx === p.zona_idx && x.posicion === p.posicion);
    if (!pl) return null;
    return asignar ? (asignar(pl) ?? null) : pl.key;
  };
  const rondas = ORDEN_RONDAS.filter(r => regla.rondas[r]?.length);
  const partidos = new Map();
  const salida = rondas.map((ronda, iRonda) => ({
    ronda,
    partidos: regla.rondas[ronda].map((def, i) => {
      const p = {
        key: def.key, orden: i + 1,
        pareja1_id: null, pareja2_id: null, es_bye: false,
        siguiente_key: def.siguiente?.key ?? null, siguiente_slot: def.siguiente ? Number(def.siguiente.slot) : null,
        despuesDe: [],
        origen: { local: def.local ?? null, visitante: def.visitante ?? null },
      };
      [['local', 1], ['visitante', 2]].forEach(([lado, slot]) => {
        const ref = def[lado];
        if (esGanador(ref)) {
          const previo = partidos.get(ref.slice(2));
          if (previo?.es_bye) p[`pareja${slot}_id`] = previo.pareja1_id ?? previo.pareja2_id;   // ganador automático
          else if (previo) p.despuesDe.push(previo.key);
        } else if (ref != null) {
          p[`pareja${slot}_id`] = valor(ref);
        }
      });
      // Primera ronda: si falta un lado (BYE de la plantilla o clasificado inexistente) el otro pasa directo
      if (iRonda === 0) p.es_bye = p.pareja1_id == null || p.pareja2_id == null;
      partidos.set(def.key, p);
      return p;
    }),
  }));
  return { tam: 2 ** salida.length, rondas: salida, plazas, regla: regla.nombre || regla.key || 'plantilla' };
}

/**
 * @param {number} numZonas
 * @param {number} clasificanPorZona
 * @param {Function} [asignar]
 * @param {{ clubId?: number, parejas?: number }} [opts]
 * @returns {import('./bracketTypes').Cuadro|null}
 */
function generateBracketFromZones(numZonas, clasificanPorZona, asignar = null, opts = {}) {
  const { reglaPara } = require('./bracketTemplates');
  const regla = reglaPara(numZonas, clasificanPorZona, opts);
  if (!regla) return null;
  return { ...generarCuadro(regla, asignar), origen_regla: regla.origen, template_id: regla.templateId ?? null };
}

module.exports = { generateBracketFromZones, generarCuadro, plazasDe };
