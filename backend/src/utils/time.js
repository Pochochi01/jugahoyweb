'use strict';
/**
 * utils/time.js
 * Utilidades de fecha/hora ancladas a la zona horaria de Argentina (GMT-3).
 *
 * El servidor fuerza process.env.TZ = 'America/Argentina/Buenos_Aires' (ver server.js),
 * pero estas funciones usan Intl con timeZone explícito para ser correctas incluso
 * si el proceso quedara en UTC (defensa en profundidad).
 */
const AR_TZ = 'America/Argentina/Buenos_Aires';

// Fecha de hoy en Argentina, formato 'YYYY-MM-DD'
function todayAR() {
  // 'en-CA' produce YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date());
}

// { date:'YYYY-MM-DD', time:'HH:mm' } de "ahora" en Argentina
function nowAR() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  // hour '24' → '00' (algunos entornos)
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hh}:${parts.minute}` };
}

module.exports = { AR_TZ, todayAR, nowAR };
