'use strict';
/**
 * utils/waPhone.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Normalización y validación del número de WhatsApp de contacto de la cancha.
 *
 * Formato requerido (Argentina, móvil):
 *   +549 + código de área (SIN el 0) + número (SIN el 15)
 *   Ej.: área 381, número 800459  →  +549381800459
 *
 * La misma lógica se replica en el frontend (SettingsTab) para validar en vivo.
 */

/** Deja el número como "+<solo dígitos>" (quita espacios, guiones, paréntesis). */
function normalizeWaContacto(input) {
  if (input == null) return '';
  const digits = String(input).replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/**
 * Valida el número YA normalizado.
 *   - Debe empezar con +549.
 *   - Lo que sigue no puede empezar con 0 (área sin 0) ni con 15 (número sin 15).
 *   - Entre 8 y 11 dígitos después de +549 (cubre áreas de 2–4 y números de 6–8).
 */
function isValidWaContacto(normalized) {
  if (typeof normalized !== 'string') return false;
  if (!/^\+549\d{8,11}$/.test(normalized)) return false;
  const rest = normalized.slice(4);        // dígitos después de +549
  if (rest.startsWith('0'))  return false; // área sin 0
  if (rest.startsWith('15')) return false; // número sin 15
  return true;
}

module.exports = { normalizeWaContacto, isValidWaContacto };
