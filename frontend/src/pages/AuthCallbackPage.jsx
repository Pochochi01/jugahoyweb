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
import { Dumbbell } from 'lucide-react';

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
      .then(data => {
        loginWithToken(token, data.user);
        navigate(data.user.rol === 'player' ? '/canchas' : '/dashboard', { replace: true });
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login?error=oauth_failed', { replace: true });
      });
  }, [navigate, loginWithToken]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Dumbbell className="w-6 h-6 text-white" />
        </div>
        <p className="text-muted-foreground text-sm">Autenticando con Google…</p>
      </div>
    </div>
  );
}
