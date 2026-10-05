import { Medal } from 'lucide-react';

/**
 * Íconos de deporte dibujados en el mismo estilo que lucide-react
 * (24×24, trazo 2, extremos redondeados) para no mezclar emojis con íconos.
 */
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  futbol: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7.5l4.3 3.1-1.7 5H9.4l-1.7-5z" />
      <path d="M12 7.5V2.3M16.3 10.6l5-1.6M14.6 15.6l3.1 4.3M9.4 15.6l-3.1 4.3M7.7 10.6l-5-1.6" />
    </>
  ),
  padel: (
    <>
      <path d="M14.5 2.5a7 7 0 0 1 7 7c0 4.3-4.2 8-8.2 8a5 5 0 0 1-2.4-.6l-5.3 5.3a1.5 1.5 0 0 1-2.1-2.1l5.3-5.3a5 5 0 0 1-.6-2.4c0-4.6 3.4-9.9 6.3-9.9z" />
      <circle cx="13.5" cy="8" r=".6" fill="currentColor" />
      <circle cx="16.5" cy="9.5" r=".6" fill="currentColor" />
      <circle cx="13" cy="11.5" r=".6" fill="currentColor" />
    </>
  ),
  tenis: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M6.2 3.9c3.1 3.6 3.1 12.6 0 16.2M17.8 3.9c-3.1 3.6-3.1 12.6 0 16.2" />
    </>
  ),
  basquet: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20M2 12h20M5 4.9a10 10 0 0 1 0 14.2M19 4.9a10 10 0 0 0 0 14.2" />
    </>
  ),
  voley: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 12V2M12 12l8.7 5M12 12l-8.7 5M12 2a13 13 0 0 1 4.5 14M3.3 17a13 13 0 0 1 9-11.5M20.7 17A13 13 0 0 1 7 15.5" />
    </>
  ),
};

export const DEPORTE_LABEL = { futbol: 'Fútbol', padel: 'Pádel', tenis: 'Tenis', basquet: 'Básquet', voley: 'Vóley', squash: 'Squash', otro: 'Otro' };
export const labelDeporte = (d) => DEPORTE_LABEL[d] || (d ? d[0].toUpperCase() + d.slice(1) : 'Deporte');

export default function SportIcon({ deporte, className = 'w-5 h-5', ...rest }) {
  const contenido = PATHS[deporte];
  if (!contenido) return <Medal className={className} aria-hidden="true" {...rest} />;
  return <svg {...base} className={className} aria-hidden="true" {...rest}>{contenido}</svg>;
}

/** Ícono en una baldosa tintada, para encabezados de cancha y listas. */
export function SportTile({ deporte, size = 'md' }) {
  const s = size === 'sm' ? 'w-9 h-9 rounded-lg' : 'w-11 h-11 rounded-xl';
  return (
    <span className={`grid place-items-center ${s} bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 shrink-0`}>
      <SportIcon deporte={deporte} className={size === 'sm' ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]'} />
    </span>
  );
}

/** Chip "ícono + nombre del deporte". */
export function SportChip({ deporte }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/85">
      <SportIcon deporte={deporte} className="w-3.5 h-3.5 text-primary" />
      {labelDeporte(deporte)}
    </span>
  );
}
