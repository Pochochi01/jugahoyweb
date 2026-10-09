/**
 * utils/fecha.js — fechas en hora de Argentina (America/Argentina/Buenos_Aires, GMT-3).
 *
 * NUNCA usar `new Date().toISOString().slice(0, 10)` para "hoy": toISOString es
 * UTC, y de 21:00 a 23:59 en Argentina ya es el día siguiente en UTC (el bug de
 * "la agenda salta al día siguiente a las 21 hs"). Usar estas funciones.
 */
export const AR_TZ = 'America/Argentina/Buenos_Aires';

const fmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' de un instante, en Argentina. */
export const isoAR = (d = new Date()) => fmtISO.format(d);

/** Hoy en Argentina ('YYYY-MM-DD'): no cambia hasta las 00:00 locales. */
export const hoyAR = () => isoAR(new Date());

/** 'HH:mm' de ahora en Argentina. */
export const horaAR = (d = new Date()) => new Intl.DateTimeFormat('es-AR', { timeZone: AR_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** Suma días a un 'YYYY-MM-DD' (aritmética de calendario pura, sin zona horaria). */
export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);   // UTC a medianoche UTC → misma fecha de calendario
}

/** Primer día del mes de un 'YYYY-MM-DD'. */
export const inicioMes = (iso = hoyAR()) => `${iso.slice(0, 7)}-01`;
