import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { Dumbbell, Eye, EyeOff, ArrowRight, Phone, RotateCcw } from 'lucide-react';

// ── Ícono de Google ───────────────────────────────────────────
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

export default function LoginPage() {
  const { login }         = useAuth();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();

  const [form,      setForm]      = useState({ email: '', password: '' });
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState(searchParams.get('error') ? 'Error al autenticar con Google. Intentá de nuevo.' : '');
  const [loading,   setLoading]   = useState(false);

  // Modo "Continuar con teléfono"
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone,     setPhone]     = useState('');
  const [otp,       setOtp]       = useState('');
  const [otpSent,   setOtpSent]   = useState(false);
  const [phoneLoad, setPhoneLoad] = useState(false);

  // Modo "Olvidé mi contraseña"
  const [resetMode,    setResetMode]    = useState(false);
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetSent,    setResetSent]    = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // ── Login con email/password ──────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.rol === 'player' ? '/canchas' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  // ── Continuar con Google ──────────────────────────────────
  const handleGoogle = () => {
    window.location.href = authService.googleLoginUrl();
  };

  // ── OTP: enviar código ────────────────────────────────────
  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError(''); setPhoneLoad(true);
    try {
      await authService.sendOTP(phone);
      setOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al enviar el código');
    } finally {
      setPhoneLoad(false);
    }
  };

  // ── OTP: verificar código ─────────────────────────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError(''); setPhoneLoad(true);
    try {
      const { data } = await authService.verifyOTP(phone, otp);
      localStorage.setItem('token', data.token);
      navigate(data.user.rol === 'player' ? '/canchas' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Código inválido o expirado');
    } finally {
      setPhoneLoad(false);
    }
  };

  // ── Reset password ────────────────────────────────────────
  const handleResetRequest = async (e) => {
    e.preventDefault();
    setError(''); setResetLoading(true);
    try {
      await authService.requestPasswordReset(resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al enviar el correo');
    } finally {
      setResetLoading(false);
    }
  };

  const divider = (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: '#1e2a3d' }} />
      <span className="text-xs text-muted-foreground">o continuá con</span>
      <div className="flex-1 h-px" style={{ background: '#1e2a3d' }} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 font-black text-xl text-white mb-6">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            JugaHoy
          </Link>
          <h1 className="text-2xl font-black text-white mb-1">
            {resetMode ? 'Recuperar contraseña' : phoneMode ? 'Continuar con teléfono' : 'Bienvenido de vuelta'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {resetMode ? 'Te enviamos un enlace por email' : phoneMode ? 'Ingresá tu número para recibir el código' : 'Ingresá a tu cuenta'}
          </p>
        </div>

        <div className="card">
          {/* Mensajes de error */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400 border"
              style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {/* ── Modo recuperar contraseña ───────────────────── */}
          {resetMode && (
            resetSent ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">📧</div>
                <p className="text-primary font-semibold text-sm">Correo enviado</p>
                <p className="text-muted-foreground text-xs mt-1">Revisá tu bandeja de entrada.</p>
                <button onClick={() => { setResetMode(false); setResetSent(false); setError(''); }}
                  className="mt-4 text-xs text-primary hover:underline">
                  Volver al inicio de sesión
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <div>
                  <label className="label">Email de tu cuenta</label>
                  <input type="email" className="input" placeholder="tu@email.com" required
                    value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                </div>
                <button type="submit" disabled={resetLoading}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  {resetLoading ? 'Enviando…' : <><span>Enviar enlace</span><ArrowRight className="w-4 h-4" /></>}
                </button>
                <button type="button" onClick={() => { setResetMode(false); setError(''); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
                  ← Volver
                </button>
              </form>
            )
          )}

          {/* ── Modo teléfono (OTP) ─────────────────────────── */}
          {!resetMode && phoneMode && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="label">Número de teléfono</label>
                    <input type="tel" className="input" placeholder="+54 11 0000-0000" required
                      value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <button type="submit" disabled={phoneLoad}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {phoneLoad ? 'Enviando…' : <><Phone className="w-4 h-4" /><span>Enviar código</span></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <p className="text-xs text-muted-foreground text-center">
                    Código enviado a <span className="text-foreground font-medium">{phone}</span>
                  </p>
                  <div>
                    <label className="label">Código de 6 dígitos</label>
                    <input type="text" className="input text-center tracking-[0.3em] text-lg font-bold"
                      placeholder="000000" maxLength={6} required
                      value={otp} onChange={e => setOtp(e.target.value)} />
                  </div>
                  <button type="submit" disabled={phoneLoad}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {phoneLoad ? 'Verificando…' : <><span>Verificar código</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                  <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }}
                    className="w-full text-xs text-primary hover:underline text-center">
                    Reenviar código
                  </button>
                </form>
              )}
              <button type="button" onClick={() => { setPhoneMode(false); setError(''); setOtpSent(false); setOtp(''); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
                ← Volver
              </button>
            </div>
          )}

          {/* ── Login normal ────────────────────────────────── */}
          {!resetMode && !phoneMode && (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" placeholder="tu@email.com" required
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Contraseña</label>
                    <button type="button" onClick={() => { setResetMode(true); setError(''); }}
                      className="text-xs text-primary hover:underline">
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className="input pr-10" placeholder="••••••••" required
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2 glow-green">
                  {loading ? 'Ingresando...' : <><span>Ingresar</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              {divider}

              {/* Botón Google */}
              <button onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-150 mb-2"
                style={{ background: '#fff', color: '#1e293b', border: '1px solid #d1d5db' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <GoogleIcon />
                Continuar con Google
              </button>

              {/* Botón teléfono */}
              <button onClick={() => { setPhoneMode(true); setError(''); }}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-150"
                style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.25)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(14,165,233,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(14,165,233,0.12)'}>
                <Phone className="w-4 h-4" />
                Continuar con teléfono
              </button>
            </>
          )}

          {!resetMode && !phoneMode && (
            <p className="text-center text-sm text-muted-foreground mt-5">
              ¿No tenés cuenta?{' '}
              <Link to="/registro" className="text-primary font-semibold hover:underline">Registrarse</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
