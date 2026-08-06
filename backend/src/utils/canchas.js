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

module.exports = { SUPERFICIES_POR_DEPORTE, superficiesValidas, abbrDeporte, abbrSuperficie };
