import { inviteService } from '../services/inviteService';
import { authService } from '../services/authService';

const PENDING_INVITE_KEY = 'pendingInvite';
const PENDING_TEL_KEY    = 'pendingTel';
const CHATBOT_CTX_KEY    = 'chatbotComplexCtx';

// Guarda el token de invitación para reclamarlo después de autenticarse.
// Se usa cuando un usuario abre un link /invite/:token sin estar logueado.
export function storePendingInvite(token) {
  if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
}

// Teléfono de WhatsApp que viaja en el link (?tel=..). Se guarda en la cuenta
// del jugador tras autenticarse (junto con la invitación o el contexto del chatbot).
export function storePendingTel(tel) {
  if (tel) sessionStorage.setItem(PENDING_TEL_KEY, tel);
}

// Contexto de llegada desde el chatbot de WhatsApp: complejo + teléfono.
// Se guarda al aterrizar en /login?complex=..&tel=.. y se aplica tras autenticarse
// (vincula al jugador con ese complejo y guarda su teléfono).
export function storeChatbotContext({ complexId, tel }) {
  if (!complexId) return;
  sessionStorage.setItem(CHATBOT_CTX_KEY, JSON.stringify({ complexId, tel: tel || null }));
}

export function getChatbotContext() {
  try { return JSON.parse(sessionStorage.getItem(CHATBOT_CTX_KEY) || 'null'); }
  catch { return null; }
}

/**
 * Resuelve la ruta a la que redirigir tras un login/registro exitoso.
 *
 * Prioridad:
 *   1. Invitación pendiente (sessionStorage): la reclama en el backend y lleva
 *      directo a la cancha invitada del complejo.
 *   2. Jugador con complejo por defecto (default_complex_id): entra directo a él.
 *   3. Jugador sin complejo → listado de canchas. Otros roles → dashboard.
 *
 * Requiere que el token JWT ya esté en localStorage (api lo adjunta solo).
 */
export async function resolvePostAuthRoute(user) {
  const pending = sessionStorage.getItem(PENDING_INVITE_KEY);
  if (pending) {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    try {
      const { complex_id } = await inviteService.claim(pending);
      // Si el link traía teléfono (?tel=..), guardarlo en la cuenta del jugador.
      const tel = sessionStorage.getItem(PENDING_TEL_KEY);
      if (tel) {
        sessionStorage.removeItem(PENDING_TEL_KEY);
        try { await authService.linkComplex(complex_id, tel); } catch { /* no bloquear */ }
      }
      return `/canchas/${complex_id}`;
    } catch {
      // Invitación inválida o revocada → continuar con el flujo normal
    }
  }

  // Llegada desde el chatbot de WhatsApp: vincular al complejo y guardar teléfono.
  const ctx = getChatbotContext();
  if (ctx?.complexId) {
    sessionStorage.removeItem(CHATBOT_CTX_KEY);
    try {
      await authService.linkComplex(ctx.complexId, ctx.tel);
      return `/canchas/${ctx.complexId}`;
    } catch {
      // Si falla la vinculación, continuar con el flujo normal
    }
  }

  if (user?.rol === 'player') {
    return user.default_complex_id ? `/canchas/${user.default_complex_id}` : '/canchas';
  }
  return '/dashboard';
}
