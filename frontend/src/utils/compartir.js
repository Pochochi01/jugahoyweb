/**
 * utils/compartir.js — MODO MANUAL de WhatsApp.
 *
 * El sistema no envía mensajes: genera el texto y lo comparte desde el dispositivo
 * del usuario. Tres caminos:
 *   - whatsapp://send  abre la app de WhatsApp del dispositivo (con o sin número)
 *   - navigator.share  hoja de compartir nativa (móvil): grupos, listas, otras apps
 *   - portapapeles     copiar y pegar en cualquier chat, grupo o lista de difusión
 */
import { copiarTexto } from './pedidoWhatsapp';

export { copiarTexto };

/**
 * URL que abre WhatsApp en ESTE dispositivo.
 * Sin número: WhatsApp pide elegir el chat (grupo, lista de difusión o contacto).
 * @param {string} texto
 * @param {string} [numero]  con código de país; se usan solo los dígitos
 */
export function whatsappSendUrl(texto, numero) {
  const params = new URLSearchParams();
  const tel = String(numero || '').replace(/\D/g, '');
  if (tel) params.set('phone', tel);
  params.set('text', texto || '');
  return `whatsapp://send?${params.toString().replace(/\+/g, '%20')}`;
}

/** Abre WhatsApp en el dispositivo con el texto cargado. */
export function abrirWhatsApp(texto, numero) {
  window.location.href = whatsappSendUrl(texto, numero);
}

/** ¿El navegador tiene hoja de compartir nativa? */
export const puedeCompartir = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * Hoja de compartir nativa; si no existe, copia al portapapeles.
 * @returns {Promise<'compartido'|'cancelado'|'copiado'|'error'>}
 */
export async function compartirTexto(texto, titulo) {
  if (puedeCompartir()) {
    try { await navigator.share({ text: texto, ...(titulo ? { title: titulo } : {}) }); return 'compartido'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelado'; }
  }
  return (await copiarTexto(texto)) ? 'copiado' : 'error';
}
