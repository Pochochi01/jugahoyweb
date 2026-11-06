'use strict';
/**
 * services/brackets/bracketValidator.js — Validaciones de plantillas y de llaves armadas.
 *
 * validarRegla(regla): la plantilla es correcta ANTES de usarla (al cargar el módulo, al guardar
 *   una plantilla desde administración y en los tests).
 * validarLlave(cuadro): la llave REAL (con pareja_id) antes de guardarla en la base de datos.
 */
const { ORDEN_RONDAS } = require('./bracketRules');

const LETRAS = 'ABCDEFGHIJKLMNOP';
const RE_PLAZA = /^(\d+)([A-P])$/;
const RE_KEY = /^(16avos|octavos|cuartos|semifinal|final)-(\d+)$/;

/** '1A' → { posicion: 1, zona_idx: 0 } (o null) */
function parsePlaza(ref) {
  const m = RE_PLAZA.exec(String(ref ?? ''));
  return m ? { posicion: Number(m[1]), zona_idx: LETRAS.indexOf(m[2]) } : null;
}
const esGanador = (ref) => typeof ref === 'string' && ref.startsWith('W:');

/**
 * Valida una regla / plantilla. Devuelve la lista de errores (vacía = válida).
 * Reglas: claves "<ronda>-<orden>"; cada clasificado exactamente una vez; sin partidos vacíos;
 * BYE (null) solo en la primera ronda; sin cruces de la misma zona entre dos clasificados directos;
 * cada partido (salvo la final) con siguiente en la ronda inmediata y coherente con su "W:";
 * una única final; y la propagación llega a un campeón con cualquier combinación de resultados.
 * @param {import('./bracketTypes').ReglaLlave} regla
 */
function validarRegla(regla) {
  const errores = [];
  if (!regla || typeof regla !== 'object') return ['plantilla vacía'];
  const zonas = Number(regla.zonas), clasif = Number(regla.clasifican);
  if (!Number.isInteger(zonas) || zonas < 1 || zonas > LETRAS.length) errores.push('cantidad de zonas inválida');
  if (!Number.isInteger(clasif) || clasif < 1) errores.push('clasificados por zona inválidos');
  if (regla.min != null && regla.max != null && Number(regla.min) > Number(regla.max)) errores.push('mínimo de parejas mayor al máximo');
  const rondasObj = regla.rondas || {};
  for (const r of Object.keys(rondasObj)) if (!ORDEN_RONDAS.includes(r)) errores.push(`ronda desconocida "${r}"`);
  const rondas = ORDEN_RONDAS.filter(r => Array.isArray(rondasObj[r]) && rondasObj[r].length);
  if (!rondas.length) return [...errores, 'la plantilla no tiene partidos'];
  if (rondas.at(-1) !== 'final' || rondasObj.final.length !== 1) errores.push('debe terminar en una única final');
  for (let i = 1; i < rondas.length; i++) {
    if (ORDEN_RONDAS.indexOf(rondas[i]) !== ORDEN_RONDAS.indexOf(rondas[i - 1]) + 1) errores.push(`falta la ronda entre ${rondas[i - 1]} y ${rondas[i]}`);
  }

  const todos = rondas.flatMap(r => rondasObj[r].map(p => ({ ...p, ronda: r })));
  const porKey = new Map(todos.map(p => [p.key, p]));
  if (porKey.size !== todos.length) errores.push('claves de partido repetidas');
  rondas.forEach(r => rondasObj[r].forEach((p, i) => {
    if (p.key !== `${r}-${i + 1}`) errores.push(`${p.key}: la clave debe ser ${r}-${i + 1}`);
  }));

  // Clasificados: cada posición + zona exactamente una vez
  const esperadas = [];
  for (let pos = 1; pos <= clasif; pos++) for (let z = 0; z < zonas; z++) esperadas.push(`${pos}${LETRAS[z]}`);
  const usadas = todos.flatMap(p => [p.local, p.visitante]).filter(x => x != null && !esGanador(x));
  for (const e of esperadas) {
    const n = usadas.filter(u => u === e).length;
    if (n !== 1) errores.push(`${e} aparece ${n} veces`);
  }
  for (const u of usadas) if (!esperadas.includes(u)) errores.push(`plaza desconocida "${u}"`);

  for (const p of todos) {
    const primera = p.ronda === rondas[0];
    if (p.local == null && p.visitante == null) errores.push(`${p.key}: partido sin participantes`);
    else if (!primera && (p.local == null || p.visitante == null)) errores.push(`${p.key}: BYE fuera de la primera ronda`);
    const a = parsePlaza(p.local), b = parsePlaza(p.visitante);
    if (a && b && a.zona_idx === b.zona_idx) errores.push(`${p.key}: cruce de la misma zona (${p.local} vs ${p.visitante})`);
    // Siguiente: en la ronda inmediata y apuntando a este partido
    if (p.siguiente) {
      const sig = porKey.get(p.siguiente.key);
      if (!sig) errores.push(`${p.key}: siguiente inexistente ${p.siguiente.key}`);
      else {
        if (rondas.indexOf(sig.ronda) !== rondas.indexOf(p.ronda) + 1) errores.push(`${p.key}: debe avanzar a la ronda siguiente`);
        const lugar = Number(p.siguiente.slot) === 1 ? sig.local : Number(p.siguiente.slot) === 2 ? sig.visitante : undefined;
        if (lugar !== `W:${p.key}`) errores.push(`${p.key}: ${sig.key} slot ${p.siguiente.slot} debería ser W:${p.key}`);
      }
    } else if (p.ronda !== 'final') errores.push(`${p.key}: sin siguiente partido (huérfano)`);
    for (const ref of [p.local, p.visitante]) {
      if (esGanador(ref)) {
        const origen = porKey.get(ref.slice(2));
        if (!origen || origen.siguiente?.key !== p.key) errores.push(`${p.key}: ${ref} no alimenta este partido`);
      } else if (ref != null && !RE_PLAZA.test(ref)) errores.push(`${p.key}: lado inválido "${ref}"`);
    }
    if (!RE_KEY.test(p.key || '')) errores.push(`clave inválida "${p.key}"`);
  }
  // Ningún partido queda sin usar su ganador (salvo la final)
  const alimentados = new Set(todos.flatMap(p => [p.local, p.visitante]).filter(esGanador).map(r => r.slice(2)));
  for (const p of todos) if (p.ronda !== 'final' && !alimentados.has(p.key)) errores.push(`${p.key}: su ganador no juega en ningún partido`);

  // Campeón alcanzable con cualquier resultado
  if (!errores.length) {
    const { generarCuadro } = require('./bracketGenerator');
    const { simularPropagacion, ESTRATEGIAS } = require('./bracketPropagator');
    const cuadro = generarCuadro(regla, (pl) => `${pl.posicion}${LETRAS[pl.zona_idx]}`);
    for (const f of ESTRATEGIAS) {
      const r = simularPropagacion(cuadro, f);
      if (r.errores.length) { errores.push(...r.errores); break; }
    }
  }
  return [...new Set(errores)];
}

/**
 * Valida una llave REAL antes de guardarla: sin parejas duplicadas, sin faltantes (si se indica
 * `esperados`), sin cruces de la misma zona entre clasificados directos (si se indica `zonaDe`),
 * todos los partidos con siguiente y una única final.
 * @param {import('./bracketTypes').Cuadro} cuadro
 * @param {{ zonaDe?: (id:any)=>number, esperados?: number }} [opts]
 */
function validarLlave(cuadro, { zonaDe, esperados } = {}) {
  const errores = [];
  const primera = new Set(cuadro.rondas[0].partidos);
  const todos = cuadro.rondas.flatMap(r => r.partidos);
  // Lugar "directo" = un clasificado de zona (no "ganador de"). Con plantilla lo indica `origen`
  // (un clasificado puede entrar en cualquier ronda); en el armado genérico, solo la 1ª ronda.
  const directo = (p, lado) => (p.origen ? parsePlaza(p.origen[lado]) != null : primera.has(p));
  const directos = todos.flatMap(p => [['local', p.pareja1_id], ['visitante', p.pareja2_id]]
    .filter(([lado, id]) => id != null && directo(p, lado)).map(([, id]) => id));
  if (new Set(directos).size !== directos.length) errores.push('hay parejas repetidas en la llave');
  if (esperados != null && directos.length !== esperados) errores.push(`faltan clasificados: ${directos.length} de ${esperados}`);
  if (zonaDe) {
    for (const p of todos) {
      if (p.pareja1_id == null || p.pareja2_id == null || !directo(p, 'local') || !directo(p, 'visitante')) continue;
      if (zonaDe(p.pareja1_id) === zonaDe(p.pareja2_id)) errores.push(`${p.key}: cruce de la misma zona`);
    }
  }
  const keys = new Set(todos.map(p => p.key));
  for (const p of todos) {
    if (p.siguiente_key && !keys.has(p.siguiente_key)) errores.push(`${p.key}: siguiente inexistente`);
    if (!p.siguiente_key && p.key !== 'final-1') errores.push(`${p.key}: partido huérfano (sin siguiente)`);
  }
  if (todos.filter(p => !p.siguiente_key).length !== 1) errores.push('la llave debe terminar en una única final');
  return errores;
}

module.exports = { validarRegla, validarLlave, parsePlaza, esGanador, LETRAS };
