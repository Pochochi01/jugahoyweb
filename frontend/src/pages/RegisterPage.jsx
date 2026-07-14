import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { resolvePostAuthRoute, storePendingInvite } from '../utils/authRedirect';
import { ArrowRight } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.4 30.3 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.9 6.1C12.5 13.2 17.8 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/>
      <path fill="#FBBC05" d="M10.6 28.5a14.6 14.6 0 0 1 0-9l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.2z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.5-5.8c-2.1 1.4-4.8 2.2-8 2.2-6.2 0-11.5-3.7-13.4-9.2l-7.9 6.2C6.7 42.6 14.7 48 24 48z"/>
    </svg>
  );
}

export default function RegisterPage() {
  const { register }   = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const [form,    setForm]    = useState({ nombre: '', apellido: '', email: '', telefono: '', password: '', confirm: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Si se llega con ?invite=token, guardar la invitación pendiente
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite) storePendingInvite(invite);
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden');
    setError('');
    setLoading(true);
    try {
      const { nombre, apellido, email, telefono, password } = form;
      const user = await register({ nombre, apellido, email, telefono, password });
      navigate(await resolvePostAuthRoute(user));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => { window.location.href = authService.googleLoginUrl(); };

  const field = (key, label, type = 'text', placeholder = '', required = true) => (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" placeholder={placeholder} required={required}
        value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-6" aria-label="JugaHoy — inicio">
            <BrandLogo emblem="h-16" text="text-4xl" tagline tagClass="text-[0.6rem] mt-1 tracking-[0.22em]" />
          </Link>
          <h1 className="text-2xl font-black text-white mb-1">Crear cuenta</h1>
          <p className="text-muted-foreground text-sm">Empezá a reservar gratis</p>
        </div>

        <div className="card">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400 border"
              style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {/* Botón Google arriba del formulario para mayor visibilidad */}
          <button onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-150 mb-4"
            style={{ background: '#fff', color: '#1e293b', border: '1px solid #d1d5db' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            <GoogleIcon />
            Registrarse con Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: '#1e2a3d' }} />
            <span className="text-xs text-muted-foreground">o con email</span>
            <div className="flex-1 h-px" style={{ background: '#1e2a3d' }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {field('nombre',   'Nombre',   'text', 'Juan')}
              {field('apellido', 'Apellido', 'text', 'García')}
            </div>
            {field('email',    'Email',      'email',    'tu@email.com')}
            {field('telefono', 'Teléfono',   'tel',      '+54 11 ...', false)}
            {field('password', 'Contraseña', 'password', '••••••••')}
            {field('confirm',  'Confirmar',  'password', '••••••••')}

            <button type="submit" disabled={loading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-2 glow-green">
              {loading ? 'Creando cuenta...' : <><span>Crear cuenta</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
