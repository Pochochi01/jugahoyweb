'use strict';
/**
 * services/brackets/generateBracket.js — Llave de fase final a partir de las zonas.
 *
 * generateBracketFromZones(numZonas, clasificanPorZona, asignar?)
 *   1. Detecta la regla oficial por cantidad de zonas (configurations.BRACKET_RULES).
 *   2. Resuelve cada plaza ("1° Zona A") con `asignar(plaza)` → pareja_id real; sin `asignar`
 *      la plaza queda como referencia (cuadro previsto antes de jugar las zonas).
 *   3. Arma todas las rondas (octavos/repechaje, cuartos, semifinal, final) con su partido
 *      siguiente y slot; los BYE se resuelven en el momento (el clasificado ya ocupa su lugar
 *      en la ronda siguiente) y el partido BYE queda registrado como walkover.
 *
 * Devuelve el MISMO formato que fixtureService.armarLlave (lo consume generarLlave, la
 * simulación de horarios y la llave de referencia), o null si no hay regla oficial.
 */
const { BRACKET_RULES, reglaPara, ORDEN_RONDAS, LETRAS, parsePlaza } = require('./configurations');

const nombreZona = (i) => `Zona ${LETRAS[i]}`;

/** Plazas de la regla, en orden de siembra (1° A, 1° B… después 2° A, 2° B…). */
function plazasDe(regla) {
  const out = [];
  for (let pos = 1; pos <= regla.clasifican; pos++) {
    for (let z = 0; z < regla.zonas; z++) out.push({ zona_idx: z, posicion: pos, key: `${pos}-${z}`, etiqueta: `${pos}° ${nombreZona(z)}` });
  }
  return out;
}

function generateBracketFromZones(numZonas, clasificanPorZona, asignar = null) {
  const regla = reglaPara(numZonas, clasificanPorZona);
  if (!regla) return null;
  const plazas = plazasDe(regla);
  const plazaDe = (ref) => {
    const p = parsePlaza(ref);
    return p && plazas.find(x => x.zona_idx === p.zona_idx && x.posicion === p.posicion);
  };
  // Valor de una plaza: id real (o null si falta) o la clave de referencia
  const valor = (ref) => {
    const pl = plazaDe(ref);
    if (!pl) return null;
    return asignar ? (asignar(pl) ?? null) : pl.key;
  };

  const rondas = ORDEN_RONDAS.filter(r => regla.rondas[r]);
  const partidos = new Map();
  const salida = rondas.map(ronda => ({
    ronda,
    partidos: regla.rondas[ronda].map((def, i) => {
      const p = {
        key: def.key, orden: i + 1, ronda,
        pareja1_id: null, pareja2_id: null, es_bye: false,
        siguiente_key: def.siguiente?.key ?? null, siguiente_slot: def.siguiente?.slot ?? null,
        despuesDe: [],
        origen: { local: def.local, visitante: def.visitante },
      };
      partidos.set(def.key, p);
      return p;
    }),
  }));

  // Resolución ronda por ronda: plazas directas, ganadores de BYE y dependencias
  for (const r of salida) {
    for (const p of r.partidos) {
      [['local', 1], ['visitante', 2]].forEach(([lado, slot]) => {
        const ref = p.origen[lado];
        if (ref && String(ref).startsWith('W:')) {
          const previo = partidos.get(ref.slice(2));
          if (previo.es_bye) p[`pareja${slot}_id`] = previo.pareja1_id ?? previo.pareja2_id;   // ganador automático
          else p.despuesDe.push(previo.key);
        } else if (ref) {
          p[`pareja${slot}_id`] = valor(ref);
        }
      });
      // Primera ronda: si falta un lado (BYE de la regla o clasificado inexistente) el otro pasa directo
      if (r === salida[0]) p.es_bye = !p.pareja1_id || !p.pareja2_id;
    }
  }
  for (const p of partidos.values()) delete p.ronda;
  const tam = salida[0].partidos.length * 2;
  return { tam, rondas: salida, plazas, regla: Object.keys(BRACKET_RULES).find(k => BRACKET_RULES[k] === regla) };
}

/**
 * Validaciones de una llave REAL ya armada (pareja_id resueltos):
 * sin faltantes, sin duplicados, sin cruces de la misma zona en primera ronda y árbol completo.
 * `zonaDe(pareja_id)` → índice de zona. Devuelve la lista de errores (vacía = OK).
 */
function validarLlave(cuadro, { zonaDe, esperados } = {}) {
  const errores = [];
  const primera = cuadro.rondas[0].partidos;
  const ids = primera.flatMap(p => [p.pareja1_id, p.pareja2_id]).filter(Boolean);
  // Los BYE de primera ronda ya ocupan su lugar en la segunda: se cuentan una sola vez
  if (new Set(ids).size !== ids.length) errores.push('hay parejas repetidas en la llave');
  if (esperados != null && ids.length !== esperados) errores.push(`faltan clasificados: ${ids.length} de ${esperados}`);
  if (zonaDe) {
    for (const p of primera) {
      if (p.pareja1_id && p.pareja2_id && zonaDe(p.pareja1_id) === zonaDe(p.pareja2_id)) errores.push(`${p.key}: cruce de la misma zona`);
    }
  }
  const todos = cuadro.rondas.flatMap(r => r.partidos);
  const keys = new Set(todos.map(p => p.key));
  for (const p of todos) if (p.siguiente_key && !keys.has(p.siguiente_key)) errores.push(`${p.key}: siguiente inexistente`);
  if (todos.filter(p => !p.siguiente_key).length !== 1) errores.push('la llave debe terminar en una única final');
  return errores;
}

module.exports = { generateBracketFromZones, validarLlave, plazasDe };
