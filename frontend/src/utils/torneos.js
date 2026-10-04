// Etiquetas y helpers compartidos del módulo Torneos.

/** Deportes de un torneo (mismos valores que las canchas). */
export const DEPORTES_TORNEO = { padel: 'Pádel', tenis: 'Tenis', futbol: 'Fútbol', basquet: 'Básquet', voley: 'Vóley', squash: 'Squash', otro: 'Otro' };

export const CATEGORIAS = [1, 2, 3, 4, 5, 6, 7, 8];
export const catLabel = (c) => `${c}ª`;

export const GENEROS = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' };

export const ESTADO_TORNEO = {
  borrador:    { label: 'Borrador',          cls: 'badge-yellow' },
  inscripcion: { label: 'Inscripción abierta', cls: 'badge-green' },
  zonas:       { label: 'Fase de zonas',     cls: 'badge-blue' },
  llaves:      { label: 'Llaves',            cls: 'badge-blue' },
  finalizado:  { label: 'Finalizado',        cls: 'badge-green' },
  cancelado:   { label: 'Cancelado',         cls: 'badge-red' },
};

export const ESTADO_PAGO = {
  pendiente:   { label: 'Pendiente',   cls: 'badge-yellow' },
  pagado:      { label: 'Pagado',      cls: 'badge-green' },
  cancelado:   { label: 'Cancelado',   cls: 'badge-red' },
  reembolsado: { label: 'Reembolsado', cls: 'badge-blue' },
};

export const RONDA_LABEL = {
  zona: 'Zona', octavos: 'Octavos', cuartos: 'Cuartos', semifinal: 'Semifinal', final: 'Final',
};

export const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');

export const fechaCorta = (f) => !f ? '' : new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

/** "6-3  7-6(5)": en un 7-6 se muestra entre paréntesis los puntos del perdedor del tie-break. */
export const setsTxt = (sets, tbs = []) =>
  (sets || []).map(([a, b], i) => `${a}-${b}${tbs?.[i] ? `(${Math.min(...tbs[i])})` : ''}`).join('  ');

export const TIPO_TORNEO = {
  unico: { label: 'Único', hint: 'Zonas por sorteo' },
  anual: { label: 'Anual (suma puntos)', hint: 'Zonas por ranking: cabezas de serie + serpentina' },
};

// ── Validación de resultados (misma regla que el backend) ─────
// Set: 6-0…6-4, 7-5 o 7-6 con tie-break (a 7, dif. 2; pasado el 7, dif. exacta de 2).
export function errorTieBreak([x, y], min = 7, etiqueta = 'Tie-break') {
  if (![x, y].every(v => Number.isInteger(v) && v >= 0)) return `${etiqueta}: cargá los puntos.`;
  const w = Math.max(x, y), l = Math.min(x, y);
  if (w < min) return `${etiqueta} ${x}-${y}: el ganador llega a ${min}.`;
  if (w - l < 2) return `${etiqueta} ${x}-${y}: se gana por 2.`;
  if (w > min && w - l !== 2) return `${etiqueta} ${x}-${y}: pasados los ${min} termina al sacar 2 de ventaja.`;
  return null;
}
export function errorSet([x, y], tb, nro) {
  if (![x, y].every(v => Number.isInteger(v) && v >= 0 && v <= 7)) return `Set ${nro}: games de 0 a 7.`;
  const w = Math.max(x, y), l = Math.min(x, y);
  if (!((w === 6 && l <= 4) || (w === 7 && (l === 5 || l === 6)))) {
    return w === 7 ? `Set ${nro} ${x}-${y}: el 7 va solo con 5 o 6.` : `Set ${nro} ${x}-${y}: se gana 6-0 a 6-4, 7-5 o 7-6.`;
  }
  if (w === 7 && l === 6) {
    const e = errorTieBreak(tb || [], 7, `Tie-break set ${nro}`);
    if (e) return e;
    if ((tb[0] > tb[1]) !== (x > y)) return `Set ${nro}: el tie-break lo gana quien ganó el set.`;
  }
  return null;
}
/** Primer error del resultado completo, o null si es válido. */
export function errorResultado(sets, tbs, tercerSet = 'set') {
  let a = 0, b = 0;
  for (let i = 0; i < sets.length; i++) {
    if (a === 2 || b === 2) return 'Hay sets de más: el partido ya se definió en 2 sets.';
    const [x, y] = sets[i];
    const e = i === 2 && tercerSet === 'super_tiebreak' ? errorTieBreak([x, y], 10, 'Súper tie-break') : errorSet([x, y], tbs[i], i + 1);
    if (e) return e;
    x > y ? a++ : b++;
  }
  return a === 2 || b === 2 ? null : 'Falta definir el ganador (mejor de 3 sets).';
}

export const nombrePareja = (p) => (p?.jugadores || []).slice().sort((a, b) => a.id - b.id).map(j => j.nombre).join(' / ');

/** Días del torneo (YYYY-MM-DD) para los selectores de franjas. */
export function diasTorneo(desde, hasta) {
  if (!desde || !hasta) return [];
  const out = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

export const errMsg = (e, fallback = 'Ocurrió un error') => e?.message || fallback;
