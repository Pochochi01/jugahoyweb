/**
 * pages/AuthCallbackPage.jsx
 * Maneja el redirect de Google OAuth.
 *
 * El backend redirige a /auth/callback#token=<jwt>
 * Esta página lee el token del hash, lo guarda y redirige al usuario.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { resolvePostAuthRoute } from '../utils/authRedirect';
import BrandLogo from '../components/BrandLogo';

export default function AuthCallbackPage() {
  const navigate       = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const hash   = window.location.hash;
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : '');
    const token  = params.get('token');

    if (!token) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    // Limpiar el hash de la URL
    window.history.replaceState(null, '', window.location.pathname);

    // Guardar token y obtener perfil
    localStorage.setItem('token', token);
    authService.me()
      .then(async data => {
        loginWithToken(token, data.user);
        // Respeta invitación pendiente (guardada antes de ir a Google) y el
        // complejo por defecto del jugador.
        navigate(await resolvePostAuthRoute(data.user), { replace: true });
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login?error=oauth_failed', { replace: true });
      });
  }, [navigate, loginWithToken]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4 animate-pulse">
          <BrandLogo emblem="h-16" text="text-3xl" />
        </div>
        <p className="text-muted-foreground text-sm">Autenticando con Google…</p>
      </div>
    </div>
  );
}
