/**
 * utils/pkce.js — PKCE (RFC 7636, método S256) para el OAuth de MercadoPago.
 *
 *   code_verifier  = 32 bytes aleatorios en base64url (43 caracteres)
 *   code_challenge = BASE64URL(SHA256(code_verifier))
 *
 * El verifier queda en localStorage SOLO mientras dura la conexión (máx. 15 min)
 * y se borra al usarlo. Requiere contexto seguro (https o localhost) para
 * crypto.subtle.
 */
const CLAVE = 'mp_pkce';
const TTL_MS = 15 * 60 * 1000;

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function generarPkce() {
  if (!window.crypto?.subtle) throw new Error('El navegador no permite la conexión segura (se necesita https).');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

/** Guarda el verifier de la conexión en curso (uno por vez). */
export function guardarVerifier(verifier, complexId) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ verifier, complexId, creado: Date.now() })); } catch { /* sin storage */ }
}

/** Lee y BORRA el verifier (un solo uso). null si no hay o venció. */
export function tomarVerifier() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    localStorage.removeItem(CLAVE);
    if (!d || Date.now() - d.creado > TTL_MS) return null;
    return d;
  } catch { return null; }
}
