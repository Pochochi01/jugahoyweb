/**
 * utils/theme.js — tema claro / oscuro / del sistema.
 *
 * El valor elegido se guarda en localStorage('theme') = 'dark' | 'light' | 'system'
 * y se aplica como <html data-theme="dark|light">. index.html lo aplica ANTES de
 * pintar (sin destello); este módulo lo cambia en caliente y sigue al sistema
 * cuando la preferencia es 'system'. Por defecto: 'dark' (identidad histórica).
 */
const KEY = 'theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function preferenciaTema() {
  try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; }
}

/** 'dark' | 'light' efectivo para una preferencia. */
export function temaEfectivo(pref = preferenciaTema()) {
  if (pref === 'system') return media?.matches ? 'light' : 'dark';
  return pref === 'light' ? 'light' : 'dark';
}

export function aplicarTema(pref = preferenciaTema()) {
  const root = document.documentElement;
  // Evita que el cambio dispare las transiciones de todos los elementos
  root.classList.add('theme-switching');
  root.dataset.theme = temaEfectivo(pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', root.dataset.theme === 'light' ? '#f5f7fb' : '#070b14');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

export function guardarTema(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* sin storage: vale para esta sesión */ }
  aplicarTema(pref);
  window.dispatchEvent(new CustomEvent('themechange', { detail: pref }));
}

// Con preferencia 'system', seguir los cambios del sistema operativo
media?.addEventListener?.('change', () => { if (preferenciaTema() === 'system') aplicarTema('system'); });
