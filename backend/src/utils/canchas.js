'use strict';
/**
 * utils/canchas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Superficies válidas por deporte y abreviaturas para el chatbot.
 * La misma tabla de superficies se replica en el frontend (SettingsTab).
 *
 * Basket y Squash NO tienen superficie (dropdown deshabilitado).
 */

const SUPERFICIES_POR_DEPORTE = {
  futbol:  ['cemento', 'sintetico', 'natural'],
  tenis:   ['dura', 'arcilla', 'cesped'],
  padel:   ['dura', 'cesped'],
  basquet: [],
  squash:  [],
};

/** Superficies válidas para un deporte (array; vacío = no aplica). */
function superficiesValidas(deporte) {
  return SUPERFICIES_POR_DEPORTE[deporte] || [];
}

// ── Abreviaturas para agrupar en el chatbot (Ver horarios) ──
const ABBR_DEPORTE = {
  futbol: 'Futb', padel: 'Pade', tenis: 'Tenis',
  basquet: 'Bask', squash: 'Squa', voley: 'Vole', otro: 'Otro',
};
const ABBR_SUPERFICIE = {
  sintetico: 'Sint', natural: 'Natu', cemento: 'Ceme',
  dura: 'Dura', arcilla: 'Arci', cesped: 'Cespe',
};

function abbrDeporte(d) {
  return ABBR_DEPORTE[d] || (d ? d[0].toUpperCase() + d.slice(1, 4) : 'Otro');
}
function abbrSuperficie(s) {
  if (!s) return '';
  return ABBR_SUPERFICIE[s] || (s[0].toUpperCase() + s.slice(1, 4));
}

// ── Etiquetas COMPLETAS (sin abreviar) para mostrar al usuario ──
const LABEL_DEPORTE = {
  futbol: 'Fútbol', padel: 'Pádel', tenis: 'Tenis',
  basquet: 'Basket', squash: 'Squash', voley: 'Vóley', otro: 'Otro',
};
const LABEL_SUPERFICIE = {
  sintetico: 'Sintético', natural: 'Natural', cemento: 'Cemento',
  dura: 'Dura', arcilla: 'Arcilla', cesped: 'Césped',
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function labelDeporte(d)    { return LABEL_DEPORTE[d]    || cap(d); }
function labelSuperficie(s) { return s ? (LABEL_SUPERFICIE[s] || cap(s)) : ''; }

/** "C1" → "Cancha 1". Si no matchea, usa el fallback (nombre) o el identificador. */
function nombreCancha(identificador, fallback) {
  const m = /^C(\d+)$/.exec(identificador || '');
  return m ? `Cancha ${m[1]}` : (fallback || identificador || 'Cancha');
}

/** "Fútbol Sintético" (deporte + superficie completos). */
function tipoCanchaCompleto(deporte, superficie) {
  const sup = labelSuperficie(superficie);
  return `${labelDeporte(deporte)}${sup ? ' ' + sup : ''}`;
}

module.exports = {
  SUPERFICIES_POR_DEPORTE, superficiesValidas,
  abbrDeporte, abbrSuperficie,
  labelDeporte, labelSuperficie, nombreCancha, tipoCanchaCompleto,
};
