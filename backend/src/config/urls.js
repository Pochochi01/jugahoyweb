'use strict';
/**
 * config/urls.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilidades para construir URLs de redirección hacia el frontend.
 *
 * FRONTEND_URL puede contener VARIOS orígenes separados por coma (se usa así en
 * la config de CORS: "https://jugahoyweb.com,https://www.jugahoyweb.com").
 * Pero para armar una URL de redirección (OAuth, reset de contraseña, etc.)
 * necesitamos UN solo origen canónico, sino se genera una URL inválida del tipo
 *   https://a.com,https://b.com/auth/callback   ← rota, el browser no navega.
 *
 * Este helper toma SIEMPRE el primer origen y le quita la barra final.
 */
function frontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:5173';
  return raw.split(',')[0].trim().replace(/\/+$/, '');
}

/** Construye una URL absoluta del frontend a partir de un path relativo. */
function frontendUrl(path = '') {
  const base = frontendBaseUrl();
  if (!path) return base;
  return `${base}/${String(path).replace(/^\/+/, '')}`;
}

module.exports = { frontendBaseUrl, frontendUrl };
