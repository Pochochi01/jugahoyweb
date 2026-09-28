'use strict';
/**
 * services/torneos/fixtureService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor PURO del torneo (sin acceso a BD → fácil de testear):
 *
 *   armarZonas()        zonas por sorteo (único) o por ranking en serpentina (anual)
 *   crucesZona4()       zonas de 4: 1v3, 2v4, G1 v P2, G2 v P1
 *   roundRobin()        todos contra todos (zonas de 2, 3, 5+)
 *   validarResultado()  sets 6-x / 7-5 / 7-6 + tie-break, súper tie-break opcional
 *   generarSlots()      turnos libres de las canchas cedidas (menos reservas existentes)
 *   programar()         asigna cancha + horario a cada partido respetando:
 *                         · disponibilidad de la cancha
 *                         · horarios preferidos de AMBAS parejas
 *                         · que ninguna pareja juegue dos partidos superpuestos
 *                           (con descanso mínimo entre partidos)
 *                         · en la llave: que cada partido sea posterior a los que lo alimentan
 *   tablaZona()         posiciones de una zona (puntos, dif. sets, dif. games)
 *   armarLlave()        cuadro eliminatorio (octavos → final) con BYES a los mejores
 *
 * Convenciones:
 *   - Horas 'HH:MM'. '00:00' como hora de FIN = medianoche (24:00).
 *   - Franjas: [{ fecha: 'YYYY-MM-DD' | null, desde: 'HH:MM', hasta: 'HH:MM' }]
 *     fecha null = todos los días del torneo.
 *   - Tiempo absoluto de un slot: minutos desde el inicio del torneo (día*1440 + min).
 */

const crypto = require('crypto');

const PUNTOS_VICTORIA = 2;
const PUNTOS_DERROTA  = 1;   // en pádel se suele premiar el partido jugado
const PUNTOS_WO       = 0;   // perder por walkover no suma

const RONDAS_POR_TAMANIO = { 16: 'octavos', 8: 'cuartos', 4: 'semifinal', 2: 'final' };
const ORDEN_RONDAS = ['octavos', 'cuartos', 'semifinal', 'final'];

// ── Tiempo ────────────────────────────────────────────────────
function toMin(hhmm, esFin = false) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const v = h * 60 + (m || 0);
  return esFin && v === 0 ? 1440 : v;
}
function toHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function diasEntre(desde, hasta) {
  const out = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function franjasDelDia(franjas, fecha) {
  return (franjas || []).filter(f => !f.fecha || f.fecha === fecha);
}

// ── Validación de franjas (se usa en controllers) ─────────────
/**
 * Normaliza y valida una lista de franjas horarias.
 * @throws {Error} status 400 si alguna es inválida
 */
function validarFranjas(franjas, { fechaInicio, fechaFin, requerida = false } = {}) {
  if (!Array.isArray(franjas)) franjas = [];
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const out = franjas.map((f) => {
    const fecha = f.fecha || null;
    if (!hhmm.test(f.desde || '') || !hhmm.test(f.hasta || '')) throw badRequest('Horario inválido (formato HH:MM).');
    if (toMin(f.desde) >= toMin(f.hasta, true)) throw badRequest(`La franja ${f.desde}–${f.hasta} es inválida.`);
    if (fecha && fechaInicio && (fecha < fechaInicio || fecha > fechaFin)) {
      throw badRequest(`La fecha ${fecha} está fuera del torneo.`);
    }
    return { fecha, desde: f.desde, hasta: f.hasta };
  });
  if (requerida && out.length === 0) throw badRequest('Cargá al menos una franja horaria.');
  return out;
}
function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

// ── Zonas ─────────────────────────────────────────────────────
/** Cantidad de zonas: n / parejas por zona, redondeado (18 parejas de a 3 → 6 zonas). */
function cantidadZonas(n, parejasPorZona) {
  if (n < 2) throw badRequest('Se necesitan al menos 2 parejas para armar zonas.');
  return Math.max(1, Math.round(n / Math.max(2, parejasPorZona)));
}

/** Mezcla Fisher–Yates con azar criptográfico (sorteo auditable, sin sesgo de Math.random). */
function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Distribución en SERPENTINA sobre k zonas:
 *   ronda 1 (ascendente):  1→A, 2→B, … k→último
 *   ronda 2 (descendente): k+1→último, … 2k→A
 *   ronda 3 (ascendente) … y así hasta ubicar a todas.
 * Con 18 parejas y 6 zonas: A={1,12,13}, B={2,11,14}, … F={6,7,18}.
 * Cada pareja recibe `numero_zona` = orden de llegada a su zona (1 = cabeza de serie).
 *
 * @param {Array} ordenadas  parejas ya ordenadas (ranking o sorteo)
 * @returns {Array<Array<{...pareja, numero_zona}>>}
 */
function serpentina(ordenadas, k) {
  const zonas = Array.from({ length: k }, () => []);
  ordenadas.forEach((p, i) => {
    const ronda = Math.floor(i / k);
    const pos = i % k;
    const z = ronda % 2 === 0 ? pos : k - 1 - pos;
    zonas[z].push({ ...p, numero_zona: zonas[z].length + 1 });
  });
  return zonas;
}

/**
 * Arma las zonas según el tipo de torneo.
 *  - 'unico': sorteo aleatorio (el número dentro de la zona también sale del sorteo).
 *  - 'anual': ranking por `puntos_totales` (suma de ambos jugadores) descendente;
 *    los primeros k son cabezas de serie (1→A, 2→B…) y el resto sigue en serpentina.
 *    Empates de puntos se desempatan por sorteo.
 * @param {Array<{id, puntos_totales?}>} parejas
 * @param {{tipo:'unico'|'anual', parejasPorZona:number}} opts
 */
function armarZonas(parejas, { tipo = 'unico', parejasPorZona = 3 } = {}) {
  const k = cantidadZonas(parejas.length, parejasPorZona);
  const orden = tipo === 'anual'
    // mezclar primero y ordenar después (sort estable) → empates sorteados
    ? mezclar(parejas).sort((a, b) => (b.puntos_totales || 0) - (a.puntos_totales || 0))
    : mezclar(parejas);
  return serpentina(orden, k);
}

/**
 * Cruces de una zona de 4 (según número de pareja en la zona):
 *   P1: 1 vs 3 · P2: 2 vs 4 · P3: ganador P1 vs perdedor P2 · P4: ganador P2 vs perdedor P1
 * @param {number[]} ids  ids de pareja ordenados por numero_zona (1..4)
 * @returns {Array<{n, pareja1_id, pareja2_id, ganador?:{n,slot}, perdedor?:{n,slot}, despuesDe:number[]}>}
 */
function crucesZona4([p1, p2, p3, p4]) {
  return [
    { n: 1, pareja1_id: p1, pareja2_id: p3, ganador: { n: 3, slot: 1 }, perdedor: { n: 4, slot: 2 }, despuesDe: [] },
    { n: 2, pareja1_id: p2, pareja2_id: p4, ganador: { n: 4, slot: 1 }, perdedor: { n: 3, slot: 2 }, despuesDe: [] },
    { n: 3, pareja1_id: null, pareja2_id: null, despuesDe: [1, 2] },
    { n: 4, pareja1_id: null, pareja2_id: null, despuesDe: [1, 2] },
  ];
}

// ── Validación de resultados ──────────────────────────────────
const esEntero = (v) => Number.isInteger(v) && v >= 0;

/**
 * Tie-break: termina cuando alguien llega a `min` puntos con 2 de diferencia.
 * Si se pasa de `min` (ej. 8-6, 12-10), la diferencia debe ser EXACTAMENTE 2.
 * @returns {1|2} lado ganador
 */
function validarTieBreak(tb, min = 7, etiqueta = 'tie-break') {
  if (!Array.isArray(tb) || tb.length !== 2) throw badRequest(`Cargá el resultado del ${etiqueta}.`);
  const [x, y] = tb.map(Number);
  if (!esEntero(x) || !esEntero(y)) throw badRequest(`${etiqueta}: puntos inválidos.`);
  const [w, l] = x > y ? [x, y] : [y, x];
  if (w < min) throw badRequest(`${etiqueta} ${x}-${y}: el ganador debe llegar a ${min}.`);
  if (w - l < 2) throw badRequest(`${etiqueta} ${x}-${y}: se gana por 2 puntos de diferencia.`);
  if (w > min && w - l !== 2) throw badRequest(`${etiqueta} ${x}-${y}: pasados los ${min} puntos termina al sacar 2 de ventaja.`);
  return x > y ? 1 : 2;
}

/**
 * Valida un set de pádel. Valores 0 a 7; resultados válidos:
 *   6-0 … 6-4 · 7-5 · 7-6 (con tie-break a 7, dif. 2)
 * Se rechaza todo lo demás (6-5, 6-6, 7-4, 5-3, 8-6…).
 * @returns {1|2} lado ganador
 */
function validarSet(set, tb, nro) {
  const [x, y] = (set || []).map(Number);
  const pref = `Set ${nro} (${x}-${y})`;
  if (!esEntero(x) || !esEntero(y) || x > 7 || y > 7) throw badRequest(`${pref}: cada set va de 0 a 7 games.`);
  const [w, l] = x > y ? [x, y] : [y, x];
  const valido = (w === 6 && l <= 4) || (w === 7 && (l === 5 || l === 6));
  if (!valido) {
    throw badRequest(w === 7
      ? `${pref}: el 7 solo va con 5 (7-5) o con 6 (7-6 con tie-break).`
      : `${pref}: un set se gana 6-0 a 6-4, 7-5 o 7-6.`);
  }
  const lado = x > y ? 1 : 2;
  if (w === 7 && l === 6) {
    if (validarTieBreak(tb, 7, `Tie-break del set ${nro}`) !== lado) {
      throw badRequest(`${pref}: el tie-break lo tiene que ganar quien ganó el set.`);
    }
  } else if (tb != null) {
    throw badRequest(`${pref}: solo un 7-6 lleva tie-break.`);
  }
  return lado;
}

/**
 * Valida el resultado completo (mejor de 3 sets).
 * @param {number[][]} sets
 * @param {Array<number[]|null>} tieBreaks  alineado con sets
 * @param {'set'|'super_tiebreak'} tercerSet  el 3º puede ser súper tie-break a 10
 * @returns {{ lado: 1|2, sets: number[][], tie_breaks: Array<number[]|null> }}
 */
function validarResultado(sets, tieBreaks = [], tercerSet = 'set') {
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) throw badRequest('Cargá 2 o 3 sets.');
  let a = 0, b = 0;
  const tbs = [];
  sets.forEach((s, i) => {
    if (a === 2 || b === 2) throw badRequest('Hay sets de más: el partido ya estaba definido en 2 sets.');
    const tb = tieBreaks?.[i] ?? null;
    let lado;
    if (i === 2 && tercerSet === 'super_tiebreak') {
      if (tb != null) throw badRequest('El súper tie-break se carga como 3er set (ej. 10-8).');
      lado = validarTieBreak(s, 10, 'Súper tie-break');
    } else {
      lado = validarSet(s, tb, i + 1);
    }
    tbs.push(tb ? tb.map(Number) : null);
    lado === 1 ? a++ : b++;
  });
  if (a !== 2 && b !== 2) throw badRequest('El resultado no define un ganador (mejor de 3 sets).');
  return { lado: a === 2 ? 1 : 2, sets: sets.map(s => s.map(Number)), tie_breaks: tbs };
}

function nombreZona(i) { return `Zona ${String.fromCharCode(65 + i)}`; }

/** Todos contra todos (método del círculo → alterna descansos). */
function roundRobin(ids) {
  const lista = [...ids];
  if (lista.length % 2) lista.push(null);
  const n = lista.length;
  const cruces = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = lista[i], b = lista[n - 1 - i];
      if (a != null && b != null) cruces.push([a, b]);
    }
    lista.splice(1, 0, lista.pop()); // rota dejando fijo el primero
  }
  return cruces;
}

// ── Slots ─────────────────────────────────────────────────────
/**
 * Turnos disponibles de las canchas cedidas.
 * @param {Array<{field_id, disponibilidad_horaria}>} canchas
 * @param {{fecha_inicio, fecha_fin, duracion_partido}} torneo
 * @param {Array<{field_id, fecha, hora_inicio, hora_fin}>} ocupados  reservas del complejo
 */
function generarSlots(canchas, torneo, ocupados = []) {
  const dias = diasEntre(torneo.fecha_inicio, torneo.fecha_fin);
  const dur = Number(torneo.duracion_partido) || 90;
  const slots = [];

  dias.forEach((fecha, di) => {
    for (const c of canchas) {
      const reservas = ocupados.filter(o => o.field_id === c.field_id && o.fecha === fecha)
        .map(o => [toMin(o.hora_inicio), toMin(o.hora_fin, true)]);
      for (const f of franjasDelDia(c.disponibilidad_horaria, fecha)) {
        const fin = toMin(f.hasta, true);
        for (let t = toMin(f.desde); t + dur <= fin; t += dur) {
          const choca = reservas.some(([a, b]) => t < b && a < t + dur);
          if (!choca) slots.push({ field_id: c.field_id, fecha, hora: toHHMM(t), abs: di * 1440 + t, dur });
        }
      }
    }
  });
  // Dedup (franjas superpuestas de una misma cancha) y orden cronológico
  const vistos = new Set();
  return slots
    .filter(s => { const k = `${s.field_id}|${s.abs}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .sort((a, b) => a.abs - b.abs || a.field_id - b.field_id);
}

/** ¿El slot cae completo dentro de alguna franja preferida de la pareja? Sin preferencias = sí. */
function encajaPreferencia(pareja, slot) {
  const prefs = pareja?.horarios_preferidos || [];
  if (!pareja || prefs.length === 0) return true;
  const ini = toMin(slot.hora), fin = ini + slot.dur;
  return franjasDelDia(prefs, slot.fecha).some(f => ini >= toMin(f.desde) && fin <= toMin(f.hasta, true));
}

/**
 * Asigna cancha y horario a cada partido.
 *
 * @param {Array<{key, pareja1_id, pareja2_id, despuesDe?: key[]}>} partidos
 *        despuesDe → claves de partidos que deben terminar antes (llave)
 * @param {Array} slots        salida de generarSlots()
 * @param {Map<number,object>} parejas  id → pareja (con horarios_preferidos)
 * @param {object} opts
 *   - descanso: minutos mínimos entre partidos de una misma pareja
 *   - agenda:   Map<parejaId, Array<[ini,fin]>> partidos ya programados (se respeta)
 *   - usados:   Set<'field|abs'> slots ya tomados
 *   - minAbs:   ningún partido antes de este minuto absoluto
 *   - previos:  Map<key, asignación> de una pasada anterior (para despuesDe)
 * @returns {Map<key, {field_id, fecha, hora, abs, fuera_preferencia} | null>}
 */
function programar(partidos, slots, parejas, opts = {}) {
  const descanso = Number(opts.descanso ?? 60);
  const agenda = opts.agenda || new Map();
  const usados = opts.usados || new Set();
  const minAbs = opts.minAbs || 0;
  const asignado = new Map(opts.previos || []);

  const libre = (s) => !usados.has(`${s.field_id}|${s.abs}`) && s.abs >= minAbs;
  const sinChoque = (pid, s) => (agenda.get(pid) || [])
    .every(([a, b]) => s.abs + s.dur + descanso <= a || b + descanso <= s.abs);
  const reservar = (p, s, fuera) => {
    usados.add(`${s.field_id}|${s.abs}`);
    for (const pid of [p.pareja1_id, p.pareja2_id]) {
      if (pid == null) continue;
      if (!agenda.has(pid)) agenda.set(pid, []);
      agenda.get(pid).push([s.abs, s.abs + s.dur]);
    }
    asignado.set(p.key, { field_id: s.field_id, fecha: s.fecha, hora: s.hora, abs: s.abs, fuera_preferencia: fuera });
  };

  // Los partidos más restringidos (menos slots preferidos) se programan primero;
  // los de llave respetan el orden de dependencia (se asume que vienen por ronda).
  const candidatos = (p) => slots.filter(s =>
    encajaPreferencia(parejas.get(p.pareja1_id), s) && encajaPreferencia(parejas.get(p.pareja2_id), s)).length;
  const conDeps = partidos.some(p => p.despuesDe?.length);
  const orden = conDeps ? partidos : [...partidos].sort((a, b) => candidatos(a) - candidatos(b));

  for (const p of orden) {
    // No antes de que terminen (con descanso) los partidos que lo alimentan
    let desde = 0;
    for (const dep of p.despuesDe || []) {
      const d = asignado.get(dep);
      if (d) desde = Math.max(desde, d.abs + (slots[0]?.dur || 90) + descanso);
    }
    const ok = (s) => s.abs >= desde && libre(s)
      && [p.pareja1_id, p.pareja2_id].every(pid => pid == null || sinChoque(pid, s));

    const preferido = slots.find(s => ok(s)
      && encajaPreferencia(parejas.get(p.pareja1_id), s)
      && encajaPreferencia(parejas.get(p.pareja2_id), s));
    if (preferido) { reservar(p, preferido, false); continue; }

    const cualquiera = slots.find(ok);
    if (cualquiera) { reservar(p, cualquiera, true); continue; }

    asignado.set(p.key, null); // sin lugar: el organizador lo programa a mano
  }
  return asignado;
}

// ── Posiciones ────────────────────────────────────────────────
/** Suma sets y games de un resultado desde el punto de vista de cada pareja. */
function resumenSets(sets) {
  let s1 = 0, s2 = 0, g1 = 0, g2 = 0;
  for (const [a, b] of sets || []) {
    g1 += a; g2 += b;
    if (a > b) s1++; else if (b > a) s2++;
  }
  return { s1, s2, g1, g2 };
}

/**
 * Tabla de posiciones de una zona.
 * @param {Array<{id}>} parejas
 * @param {Array<{pareja1_id, pareja2_id, estado, resultado:{sets, ganador_id}}>} partidos
 * @returns {Array<{pareja_id, pj, pg, pp, puntos, sf, sc, gf, gc, dif_sets, dif_games, posicion}>}
 */
function tablaZona(parejas, partidos) {
  const t = new Map(parejas.map(p => [p.id, {
    pareja_id: p.id, pj: 0, pg: 0, pp: 0, puntos: 0, sf: 0, sc: 0, gf: 0, gc: 0,
  }]));
  const h2h = new Map(); // 'a|b' → ganador

  for (const m of partidos) {
    if (!['jugado', 'walkover'].includes(m.estado) || !m.resultado?.ganador_id) continue;
    const a = t.get(m.pareja1_id), b = t.get(m.pareja2_id);
    if (!a || !b) continue;
    const { s1, s2, g1, g2 } = resumenSets(m.resultado.sets);
    const ganaA = m.resultado.ganador_id === m.pareja1_id;
    const wo = m.estado === 'walkover';
    a.pj++; b.pj++;
    a.sf += s1; a.sc += s2; a.gf += g1; a.gc += g2;
    b.sf += s2; b.sc += s1; b.gf += g2; b.gc += g1;
    const [gan, per] = ganaA ? [a, b] : [b, a];
    gan.pg++; gan.puntos += PUNTOS_VICTORIA;
    per.pp++; per.puntos += wo ? PUNTOS_WO : PUNTOS_DERROTA;
    h2h.set([m.pareja1_id, m.pareja2_id].sort().join('|'), m.resultado.ganador_id);
  }

  const filas = [...t.values()].map(r => ({ ...r, dif_sets: r.sf - r.sc, dif_games: r.gf - r.gc }));
  filas.sort((x, y) =>
    (y.puntos - x.puntos) || (y.dif_sets - x.dif_sets) || (y.dif_games - x.dif_games)
    // desempate por enfrentamiento directo
    || (h2h.get([x.pareja_id, y.pareja_id].sort().join('|')) === x.pareja_id ? -1
      : h2h.get([x.pareja_id, y.pareja_id].sort().join('|')) === y.pareja_id ? 1 : 0)
    || (x.pareja_id - y.pareja_id));
  filas.forEach((f, i) => { f.posicion = i + 1; });
  return filas;
}

// ── Llave eliminatoria ────────────────────────────────────────
/** Orden estándar de siembra: para 8 → [1,8,4,5,2,7,3,6] (1 y 2 sólo se cruzan en la final). */
function ordenSiembra(tam) {
  let orden = [1, 2];
  while (orden.length < tam) {
    const n = orden.length * 2 + 1;
    orden = orden.flatMap(s => [s, n - s]);
  }
  return orden;
}

/**
 * Ranking de clasificados: primero todos los 1° de zona, luego los 2°, etc.
 * Dentro de cada posición: puntos, dif. sets, dif. games.
 * @param {Array<{zona_id, tabla}>} zonas  tabla = salida de tablaZona()
 * @returns {Array<{pareja_id, zona_id, posicion, seed}>}
 */
function rankingClasificados(zonas, clasificanPorZona) {
  const out = [];
  for (let pos = 1; pos <= clasificanPorZona; pos++) {
    const fila = zonas
      .map(z => ({ ...z.tabla.find(r => r.posicion === pos), zona_id: z.zona_id }))
      .filter(r => r.pareja_id)
      .sort((a, b) => (b.puntos - a.puntos) || (b.dif_sets - a.dif_sets) || (b.dif_games - a.dif_games));
    out.push(...fila);
  }
  return out.map((r, i) => ({ pareja_id: r.pareja_id, zona_id: r.zona_id, posicion: r.posicion, seed: i + 1 }));
}

/**
 * Arma el cuadro eliminatorio.
 *
 * Casos especiales:
 *  - Si los clasificados no completan la llave (ej. 11 para una llave de 16),
 *    los lugares vacíos son BYES y los reciben los MEJORES sembrados
 *    (orden de siembra estándar → el seed 1 enfrenta al lugar 16, que queda vacío).
 *  - Se intenta que dos parejas de la misma zona no se crucen en la primera ronda.
 *  - Máximo 16 parejas (octavos). Si hay más, entran los 16 mejores.
 *
 * @param {Array<{pareja_id, zona_id, seed}>} clasificados ordenados por seed
 * @returns {{ tam, rondas: Array<{ronda, partidos: Array<{key, orden, pareja1_id, pareja2_id, es_bye, siguiente_key, siguiente_slot, despuesDe}>}> }}
 */
function armarLlave(clasificados) {
  const lista = clasificados.slice(0, 16);
  if (lista.length < 2) throw badRequest('Se necesitan al menos 2 clasificados para armar la llave.');
  let tam = 2;
  while (tam < lista.length) tam *= 2;

  // posiciones del cuadro → pareja (o null = bye)
  const porSeed = new Map(lista.map((c, i) => [i + 1, c]));
  const posiciones = ordenSiembra(tam).map(s => porSeed.get(s) || null);

  // Evitar cruces de misma zona en 1ª ronda: intercambia el "de abajo" con el de otro cruce
  for (let i = 0; i < posiciones.length; i += 2) {
    const a = posiciones[i], b = posiciones[i + 1];
    if (!a || !b || a.zona_id !== b.zona_id) continue;
    for (let j = 0; j < posiciones.length; j += 2) {
      if (j === i) continue;
      const c = posiciones[j], d = posiciones[j + 1];
      if (!d || !c) continue;
      if (d.zona_id !== a.zona_id && b.zona_id !== c.zona_id) {
        posiciones[i + 1] = d; posiciones[j + 1] = b; break;
      }
    }
  }

  const rondas = [];
  let actual = [];
  for (let i = 0; i < tam; i += 2) {
    const p1 = posiciones[i], p2 = posiciones[i + 1];
    actual.push({
      pareja1_id: p1?.pareja_id ?? null,
      pareja2_id: p2?.pareja_id ?? null,
      es_bye: !p1 || !p2,
    });
  }
  let t = tam;
  while (t >= 2) {
    const ronda = RONDAS_POR_TAMANIO[t];
    actual.forEach((p, i) => { p.key = `${ronda}-${i + 1}`; p.orden = i + 1; });
    rondas.push({ ronda, partidos: actual });
    if (t === 2) break;
    const sig = [];
    for (let i = 0; i < actual.length; i += 2) {
      const m = { pareja1_id: null, pareja2_id: null, es_bye: false, despuesDe: [] };
      [actual[i], actual[i + 1]].forEach((prev, slot) => {
        prev.siguiente_slot = slot + 1;
        prev.siguiente_ref = m;
        // Un bye avanza directo: su pareja ya ocupa el lugar en la ronda siguiente
        if (prev.es_bye) m[`pareja${slot + 1}_id`] = prev.pareja1_id ?? prev.pareja2_id;
        else m.despuesDe.push(prev);
      });
      sig.push(m);
    }
    actual = sig;
    t /= 2;
  }
  // Referencias → claves (tras asignar key a todas las rondas)
  for (const r of rondas) for (const p of r.partidos) {
    p.siguiente_key = p.siguiente_ref?.key ?? null;
    p.despuesDe = (p.despuesDe || []).map(d => d.key);
    delete p.siguiente_ref;
  }
  return { tam, rondas };
}

module.exports = {
  PUNTOS_VICTORIA, PUNTOS_DERROTA, ORDEN_RONDAS,
  toMin, toHHMM, diasEntre, validarFranjas,
  armarZonas, serpentina, cantidadZonas, crucesZona4, nombreZona, roundRobin,
  validarSet, validarTieBreak, validarResultado,
  generarSlots, encajaPreferencia, programar,
  resumenSets, tablaZona, rankingClasificados,
  ordenSiembra, armarLlave,
};
