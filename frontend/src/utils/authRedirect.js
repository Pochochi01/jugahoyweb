import { inviteService } from '../services/inviteService';

const PENDING_INVITE_KEY = 'pendingInvite';

// Guarda el token de invitación para reclamarlo después de autenticarse.
// Se usa cuando un usuario abre un link /invite/:token sin estar logueado.
export function storePendingInvite(token) {
  if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
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
      return `/canchas/${complex_id}`;
    } catch {
      // Invitación inválida o revocada → continuar con el flujo normal
    }
  }

  if (user?.rol === 'player') {
    return user.default_complex_id ? `/canchas/${user.default_complex_id}` : '/canchas';
  }
  return '/dashboard';
}
