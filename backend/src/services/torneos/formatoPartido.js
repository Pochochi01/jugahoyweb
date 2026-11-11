'use strict';
/**
 * services/torneos/formatoPartido.js — Motor de formatos de partido (puro, sin DB).
 *
 * Un torneo tiene `formato`:
 *   'tradicional' → reglas históricas (6 games, tie-break a 7, 3er set o súper TB según `tercer_set`).
 *   'relampago'   → `formato_partidos` define una REGLA por fase:
 *        { zonas, cuartos, semifinal, final }   (16avos y octavos usan la de cuartos)
 *
 * Regla de partido (extensible: agregar un tipo = agregar una entrada en TIPOS):
 *   { tipo: 'un_set' | 'dos_sets_super_tb' | 'mejor_de_3',
 *     games: G,            games para ganar el set
 *     tiebreak: T,         puntos del tie-break del set
 *     super_tiebreak: S,   puntos del súper tie-break (solo dos_sets_super_tb)
 *     ventaja: true|false } true  → se gana G-x con 2 de diferencia, (G+1)-(G-1), (G+1)-G con TB en G-G
 *                           false → se gana G-x (x ≤ G-2) o G-(G-1) con TB en (G-1)-(G-1)
 *
 * Con { tipo: mejor_de_3, games: 6, tiebreak: 7, ventaja: true } las reglas son idénticas a las tradicionales.
 * ESTE ARCHIVO TIENE UNA COPIA EN frontend/src/utils/formatoPartido.js (mantenerlas iguales).
 */

const TIPOS = {
  un_set:            { label: 'Un set único',               sets: 1, superTb: false },
  dos_sets_super_tb: { label: 'Dos sets + súper tie-break', sets: 3, superTb: true },
  mejor_de_3:        { label: 'Dos sets (3º set completo)', sets: 3, superTb: false },
};
const FASES = ['zonas', 'cuartos', 'semifinal', 'final'];
const FASE_LABEL = { zonas: 'Zonas', cuartos: 'Cuartos (y rondas previas)', semifinal: 'Semifinales', final: 'Final' };
const LIMITES = { games: [2, 15], tiebreak: [3, 21], super_tiebreak: [5, 25] };
const MAX_PUNTOS = 99;

const DEFAULT_RELAMPAGO = {
  zonas:     { tipo: 'un_set', games: 4, tiebreak: 7, ventaja: true },
  cuartos:   { tipo: 'un_set', games: 6, tiebreak: 7, ventaja: true },
  semifinal: { tipo: 'un_set', games: 6, tiebreak: 7, ventaja: true },
  final:     { tipo: 'dos_sets_super_tb', games: 6, tiebreak: 7, super_tiebreak: 10, ventaja: true },
};

const err400 = (m) => Object.assign(new Error(m), { status: 400 });
const entero = (v, max) => {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,3}$/.test(v.trim())) n = Number(v.trim());
  return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
};
const ok = (n) => Number.isInteger(n) && n >= 0;

/** Valida y completa la regla de una fase. Lanza 400 si algo está fuera de rango. */
function normalizarRegla(r = {}, fase = 'fase') {
  const nombre = FASE_LABEL[fase] || fase;
  const tipo = r.tipo || 'un_set';
  if (!TIPOS[tipo]) throw err400(`${nombre}: formato de partido inválido.`);
  const out = { tipo, ventaja: r.ventaja !== false && r.ventaja !== 'false' && r.ventaja !== 0 };
  for (const k of ['games', 'tiebreak', ...(TIPOS[tipo].superTb ? ['super_tiebreak'] : [])]) {
    const [min, max] = LIMITES[k];
    const v = Number(r[k] ?? (k === 'super_tiebreak' ? 10 : NaN));
    if (!Number.isInteger(v) || v < min || v > max) {
      throw err400(`${nombre}: ${k === 'games' ? 'games por set' : k === 'tiebreak' ? 'tie-break' : 'súper tie-break'} de ${min} a ${max}.`);
    }
    out[k] = v;
  }
  return out;
}

/** Valida el formato relámpago completo (todas las fases). */
function normalizarFormato(cfg) {
  const c = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
  return Object.fromEntries(FASES.map(f => [f, normalizarRegla({ ...DEFAULT_RELAMPAGO[f], ...(c[f] || {}) }, f)]));
}

const reglaTradicional = (tercerSet = 'set') => ({
  tipo: tercerSet === 'super_tiebreak' ? 'dos_sets_super_tb' : 'mejor_de_3', games: 6, tiebreak: 7, super_tiebreak: 10, ventaja: true,
});
const esRelampago = (torneo) => torneo?.formato === 'relampago';
const faseDeRonda = (ronda) => (ronda === 'zona' ? 'zonas' : ronda === 'semifinal' ? 'semifinal' : ronda === 'final' ? 'final' : 'cuartos');

/** Regla que aplica a un partido de `ronda` en el torneo. */
function reglaPartido(torneo, ronda) {
  if (!esRelampago(torneo)) return reglaTradicional(torneo?.tercer_set);
  return normalizarFormato(torneo.formato_partidos)[faseDeRonda(ronda)];
}

const maxGames = (r) => (r.ventaja ? r.games + 1 : r.games);
const setsParaGanar = (r) => (TIPOS[r.tipo].sets === 1 ? 1 : 2);
const indiceSuperTb = (r) => (TIPOS[r.tipo].superTb ? 2 : -1);

/** Tie-break a `min` con 2 de diferencia (pasado `min`, diferencia exacta de 2). @returns {1|2} */
function validarTieBreak(tb, min, etiqueta = 'Tie-break') {
  if (!Array.isArray(tb) || tb.length !== 2) throw err400(`Cargá el resultado del ${etiqueta.toLowerCase()}.`);
  const [x, y] = tb.map(v => entero(v, MAX_PUNTOS));
  if (!ok(x) || !ok(y)) throw err400(`${etiqueta}: los puntos son números enteros de 0 a ${MAX_PUNTOS}.`);
  const [w, l] = x > y ? [x, y] : [y, x];
  if (w < min) throw err400(`${etiqueta} ${x}-${y}: el ganador debe llegar a ${min}.`);
  if (w - l < 2) throw err400(`${etiqueta} ${x}-${y}: se gana por 2 puntos de diferencia.`);
  if (w > min && w - l !== 2) throw err400(`${etiqueta} ${x}-${y}: pasados los ${min} puntos termina al sacar 2 de ventaja.`);
  return x > y ? 1 : 2;
}

/** ¿El marcador del set va a tie-break según la regla? */
function esSetConTb([x, y], r) {
  const [w, l] = x > y ? [x, y] : [y, x];
  return r.ventaja ? (w === r.games + 1 && l === r.games) : (w === r.games && l === r.games - 1);
}

/** Texto de los resultados válidos del set (para mensajes y ayudas). */
function ayudaSet(r) {
  const G = r.games;
  const normales = G >= 2 ? `${G}-0 a ${G}-${G - 2}` : `${G}-0`;
  return r.ventaja
    ? `${normales}, ${G + 1}-${G - 1} o ${G + 1}-${G} (tie-break a ${r.tiebreak})`
    : `${normales} o ${G}-${G - 1} (tie-break a ${r.tiebreak})`;
}

/** Valida un set con la regla. @returns {1|2} lado ganador */
function validarSet(set, tb, nro, r) {
  if (!Array.isArray(set) || set.length !== 2) throw err400(`Set ${nro}: cargá los games de las dos parejas.`);
  const max = maxGames(r);
  const [x, y] = set.map(v => entero(v, max));
  const pref = `Set ${nro} (${set.join('-')})`;
  if (!ok(x) || !ok(y)) throw err400(`${pref}: cada set va de 0 a ${max} games (números enteros).`);
  const [w, l] = x > y ? [x, y] : [y, x];
  const G = r.games;
  const conTb = esSetConTb([x, y], r);
  const valido = (w === G && l <= G - 2) || conTb || (r.ventaja && w === G + 1 && l === G - 1);
  if (!valido) throw err400(`${pref}: con sets a ${G} games se gana ${ayudaSet(r)}.`);
  const lado = x > y ? 1 : 2;
  if (conTb) {
    if (validarTieBreak(tb, r.tiebreak, `Tie-break del set ${nro}`) !== lado) throw err400(`${pref}: el tie-break lo tiene que ganar quien ganó el set.`);
  } else if (tb != null) {
    throw err400(`${pref}: solo un ${r.ventaja ? `${G + 1}-${G}` : `${G}-${G - 1}`} lleva tie-break.`);
  }
  return lado;
}

/**
 * Resultado completo según la regla.
 * @returns {{ lado: 1|2, sets: number[][], tie_breaks: Array<number[]|null> }}
 */
function validarResultado(sets, tieBreaks, r) {
  const necesarios = setsParaGanar(r);
  const maxSets = TIPOS[r.tipo].sets;
  if (!Array.isArray(sets) || sets.length < necesarios || sets.length > maxSets) {
    throw err400(maxSets === 1 ? 'Este partido se juega a un set: cargá un solo set.' : 'Cargá 2 o 3 sets.');
  }
  if (tieBreaks != null && !Array.isArray(tieBreaks)) throw err400('tie_breaks inválido.');
  const iStb = indiceSuperTb(r);
  let a = 0, b = 0;
  const tbs = [];
  sets.forEach((s, i) => {
    if (a === necesarios || b === necesarios) throw err400(`Hay sets de más: el partido ya estaba definido en ${necesarios} set${necesarios > 1 ? 's' : ''}.`);
    const tb = tieBreaks?.[i] ?? null;
    let lado;
    if (i === iStb) {
      if (tb != null) throw err400(`El súper tie-break se carga como 3er set (ej. ${r.super_tiebreak}-${r.super_tiebreak - 2}).`);
      lado = validarTieBreak(s, r.super_tiebreak, 'Súper tie-break');
    } else {
      lado = validarSet(s, tb, i + 1, r);
    }
    tbs.push(tb ? tb.map(v => entero(v, MAX_PUNTOS)) : null);
    lado === 1 ? a++ : b++;
  });
  if (a !== necesarios && b !== necesarios) throw err400('El resultado no define un ganador.');
  return {
    lado: a === necesarios ? 1 : 2,
    sets: sets.map((s, i) => s.map(v => entero(v, i === iStb ? MAX_PUNTOS : maxGames(r)))),
    tie_breaks: tbs,
  };
}

/** Sets que se registran por W.O. (G-0 en cada set necesario para ganar). */
function setsWalkover(lado, r) {
  const s = lado === 1 ? [r.games, 0] : [0, r.games];
  return Array.from({ length: setsParaGanar(r) }, () => [...s]);
}

/** "1 set a 4 games · TB a 7", "2 sets a 6 + súper TB a 10"… */
function describirRegla(r) {
  const v = r.ventaja ? '' : ' (sin ventaja)';
  if (r.tipo === 'un_set') return `1 set a ${r.games} games${v} · tie-break a ${r.tiebreak}`;
  if (r.tipo === 'dos_sets_super_tb') return `2 sets a ${r.games} games${v} + súper tie-break a ${r.super_tiebreak}`;
  return `2 sets a ${r.games} games${v} (3º set completo) · tie-break a ${r.tiebreak}`;
}

/** Resumen por fase para pantallas: [{ fase, label, texto }] */
function resumenFormato(torneo) {
  if (!esRelampago(torneo)) return null;
  const f = normalizarFormato(torneo.formato_partidos);
  return FASES.map(k => ({ fase: k, label: FASE_LABEL[k], texto: describirRegla(f[k]) }));
}

module.exports = {
  TIPOS, FASES, FASE_LABEL, LIMITES, DEFAULT_RELAMPAGO, MAX_PUNTOS,
  normalizarRegla, normalizarFormato, reglaTradicional, esRelampago, faseDeRonda, reglaPartido,
  maxGames, setsParaGanar, indiceSuperTb, esSetConTb, ayudaSet,
  validarTieBreak, validarSet, validarResultado, setsWalkover, describirRegla, resumenFormato,
};
