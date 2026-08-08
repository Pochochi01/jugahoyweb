/**
 * utils/whatsapp.js — helpers de WhatsApp para el frontend.
 * El número se guarda normalizado como "+549381800459"; wa.me usa solo dígitos.
 */

/** Link a un chat de WhatsApp (o null si no hay número). */
export function waLink(numero) {
  const digits = String(numero || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

/** Normaliza a "+<dígitos>" (quita espacios, guiones, paréntesis). */
export function normalizeWa(input) {
  if (input == null) return '';
  const digits = String(input).replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Valida el formato +549 + área (sin 0) + número (sin 15). */
export function isValidWa(norm) {
  if (!/^\+549\d{8,11}$/.test(norm)) return false;
  const rest = norm.slice(4);
  return !rest.startsWith('0') && !rest.startsWith('15');
}
