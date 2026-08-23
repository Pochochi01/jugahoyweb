// Métodos de pago del sistema (caja + cantina) y helpers de presentación.
// Opciones ofrecidas en los formularios:
export const METODOS_PAGO = [
  { v: 'efectivo',    l: 'Efectivo' },
  { v: 'mercadopago', l: 'MercadoPago' },
  { v: 'tarjeta',     l: 'Tarjeta' },
  { v: 'otros',       l: 'Otros' },
];

// Etiquetas legibles (incluye métodos legados para datos históricos).
const LABELS = {
  efectivo: 'Efectivo', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta',
  otros: 'Otros', transferencia: 'Transferencia', billetera: 'Billetera',
};
export const metodoLabel = (v) => LABELS[v] || v || '—';

// Estilo del chip por método (translúcido, legible sobre fondos oscuros).
const CHIPS = {
  efectivo:      { background: 'rgba(34,197,94,0.15)',  color: '#4ade80', border: '1px solid rgba(34,197,94,0.30)' },
  mercadopago:   { background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.30)' },
  tarjeta:       { background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.30)' },
  transferencia: { background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.30)' },
  billetera:     { background: 'rgba(45,212,191,0.15)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.30)' },
  otros:         { background: 'rgba(148,163,184,0.15)', color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.30)' },
};
export const metodoChipStyle = (v) => CHIPS[v] || CHIPS.otros;
