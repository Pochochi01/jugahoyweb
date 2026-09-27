// Etiquetas y helpers compartidos del módulo Torneos.

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

export const setsTxt = (sets) => (sets || []).map(([a, b]) => `${a}-${b}`).join('  ');

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
