import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { resolvePostAuthRoute, storePendingInvite, storeChatbotContext } from '../utils/authRedirect';
import { Eye, EyeOff, ArrowRight, Phone, ArrowLeft, MailCheck, Loader2 } from 'lucide-react';
import AuthLayout, { GoogleIcon, Divider } from '../components/AuthLayout';

/** Botón de envío con estado de carga (sin cambiar de ancho). */
function SubmitButton({ loading, children, loadingText }) {
  return (
    <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
      {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{loadingText}</> : children}
    </button>
  );
}

export default function LoginPage() {
  const { login, user }   = useAuth();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();

  const [form,      setForm]      = useState({ email: '', password: '' });
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState(searchParams.get('error') ? 'No pudimos entrar con Google. Probá de nuevo.' : '');
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

  // Guardar contexto de llegada: invitación y/o complejo del chatbot de WhatsApp.
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite) storePendingInvite(invite);

    const complex = searchParams.get('complex');
    const tel     = searchParams.get('tel');
    if (complex) {
      storeChatbotContext({ complexId: parseInt(complex, 10), tel });
      if (tel) setPhone(tel);   // prefill para login por teléfono
    }
  }, [searchParams]);

  // Si el usuario YA tiene sesión y llega con ?complex=.., entrar directo al complejo.
  useEffect(() => {
    if (user && searchParams.get('complex')) {
      (async () => navigate(await resolvePostAuthRoute(user), { replace: true }))();
    }
  }, [user, searchParams, navigate]);

  // ── Login con email/password ──────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(await resolvePostAuthRoute(user));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'El email o la contraseña no coinciden.');
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
      setError(err.response?.data?.message || err.message || 'No pudimos enviar el código. Revisá el número.');
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
      navigate(await resolvePostAuthRoute(data.user));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'El código no es válido o venció. Pedí uno nuevo.');
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
      setError(err.response?.data?.message || err.message || 'No pudimos enviar el correo. Probá de nuevo.');
    } finally {
      setResetLoading(false);
    }
  };

  const volver = (fn) => () => { fn(); setError(''); };
  const VolverBtn = ({ onClick }) => (
    <button type="button" onClick={onClick} className="btn-ghost w-full mt-2">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver al inicio de sesión
    </button>
  );

  const titulo = resetMode ? 'Recuperar contraseña' : phoneMode ? 'Entrar con tu teléfono' : 'Hola de nuevo';
  const subtitulo = resetMode
    ? 'Te mandamos un enlace para crear una contraseña nueva.'
    : phoneMode
      ? (otpSent ? `Escribí el código que enviamos al ${phone}.` : 'Te enviamos un código por SMS para entrar sin contraseña.')
      : 'Entrá para reservar y ver tus turnos.';

  return (
    <AuthLayout
      title={titulo}
      subtitle={subtitulo}
      footer={!resetMode && !phoneMode && (
        <>¿No tenés cuenta?{' '}
          <Link to="/registro" className="font-semibold text-primary hover:underline">Creá una gratis</Link>
        </>
      )}
    >
      {error && (
        <div className="alert-error mb-5" role="alert">{error}</div>
      )}

      {/* ── Recuperar contraseña ─────────────────────────── */}
      {resetMode && (
        resetSent ? (
          <div className="alert-success flex-col items-center text-center py-6" role="status">
            <MailCheck className="w-7 h-7" aria-hidden="true" />
            <p className="font-semibold">Te enviamos el enlace</p>
            <p className="text-muted-foreground text-xs">Revisá tu bandeja de entrada (y la carpeta de spam) en {resetEmail}.</p>
            <button onClick={volver(() => { setResetMode(false); setResetSent(false); })} className="btn-outline mt-2">
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetRequest} className="space-y-5" noValidate={false}>
            <div>
              <label htmlFor="reset-email" className="label">Email de tu cuenta</label>
              <input id="reset-email" type="email" className="input" placeholder="nombre@email.com" required autoComplete="email" autoFocus
                value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
            </div>
            <SubmitButton loading={resetLoading} loadingText="Enviando…">
              Enviar enlace <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </SubmitButton>
            <VolverBtn onClick={volver(() => setResetMode(false))} />
          </form>
        )
      )}

      {/* ── Teléfono (OTP) ───────────────────────────────── */}
      {!resetMode && phoneMode && (
        <>
          {!otpSent ? (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <label htmlFor="tel" className="label">Número de celular</label>
                <input id="tel" type="tel" className="input" placeholder="+54 9 381 555-0142" required autoComplete="tel" inputMode="tel" autoFocus
                  value={phone} onChange={e => setPhone(e.target.value)} />
                <p className="hint">Con código de área. Te llega un SMS con 6 dígitos.</p>
              </div>
              <SubmitButton loading={phoneLoad} loadingText="Enviando…">
                <Phone className="w-4 h-4" aria-hidden="true" /> Enviar código
              </SubmitButton>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <label htmlFor="otp" className="label">Código de 6 dígitos</label>
                <input id="otp" type="text" className="input text-center text-xl font-bold tracking-[0.4em] tabular" placeholder="000000"
                  maxLength={6} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" autoFocus
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} />
              </div>
              <SubmitButton loading={phoneLoad} loadingText="Verificando…">
                Entrar <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </SubmitButton>
              <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }} className="btn-ghost w-full">
                ¿No llegó? Pedir otro código
              </button>
            </form>
          )}
          <VolverBtn onClick={volver(() => { setPhoneMode(false); setOtpSent(false); setOtp(''); })} />
        </>
      )}

      {/* ── Email y contraseña ───────────────────────────── */}
      {!resetMode && !phoneMode && (
        <>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" className="input" placeholder="nombre@email.com" required autoComplete="email" inputMode="email"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor="password" className="label mb-0">Contraseña</label>
                <button type="button" onClick={volver(() => { setResetMode(true); setResetEmail(form.email); })}
                  className="text-xs font-medium text-primary hover:underline">
                  ¿La olvidaste?
                </button>
              </div>
              <div className="relative">
                <input id="password" type={showPass ? 'text' : 'password'} className="input pr-11" required autoComplete="current-password"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPass}
                  className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-160">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <SubmitButton loading={loading} loadingText="Entrando…">
              Entrar <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </SubmitButton>
          </form>

          <Divider>o seguí con</Divider>

          <div className="grid gap-2.5">
            <button type="button" onClick={handleGoogle} className="btn-google">
              <GoogleIcon /> Google
            </button>
            <button type="button" onClick={volver(() => setPhoneMode(true))} className="btn-outline w-full">
              <Phone className="w-4 h-4" aria-hidden="true" /> Celular (código por SMS)
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
