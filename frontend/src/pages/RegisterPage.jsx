import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { resolvePostAuthRoute, storePendingInvite, storeChatbotContext, getChatbotContext } from '../utils/authRedirect';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthLayout, { GoogleIcon, Divider } from '../components/AuthLayout';

export default function RegisterPage() {
  const { register }   = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const [form,    setForm]    = useState({ nombre: '', apellido: '', email: '', telefono: '', password: '', confirm: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [tocado, setTocado] = useState(false);   // confirmación: avisar recién al salir del campo

  // Guardar contexto de llegada (invite / complejo del chatbot) y prefill teléfono.
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite) storePendingInvite(invite);

    const complex = searchParams.get('complex');
    const tel     = searchParams.get('tel');
    if (complex) storeChatbotContext({ complexId: parseInt(complex, 10), tel });

    // El teléfono puede venir en la URL o en el contexto guardado desde /login.
    const ctx = getChatbotContext();
    const prefTel = tel || ctx?.tel;
    if (prefTel) setForm(f => (f.telefono ? f : { ...f, telefono: prefTel }));
  }, [searchParams]);

  const noCoinciden = tocado && form.confirm && form.password !== form.confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setTocado(true); return setError('Las contraseñas no coinciden.'); }
    setError('');
    setLoading(true);
    try {
      const { nombre, apellido, email, telefono, password } = form;
      const user = await register({ nombre, apellido, email, telefono, password });
      navigate(await resolvePostAuthRoute(user));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'No pudimos crear la cuenta. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => { window.location.href = authService.googleLoginUrl(); };
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <AuthLayout
      title="Creá tu cuenta"
      subtitle="Gratis. Reservás en segundos y ves todos tus turnos en un lugar."
      footer={<>¿Ya tenés cuenta?{' '}<Link to="/login" className="font-semibold text-primary hover:underline">Entrá</Link></>}
    >
      {error && <div className="alert-error mb-5" role="alert">{error}</div>}

      <button type="button" onClick={handleGoogle} className="btn-google">
        <GoogleIcon /> Registrarme con Google
      </button>

      <Divider>o con tu email</Divider>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className="label">Nombre</label>
            <input id="nombre" className="input" required autoComplete="given-name" value={form.nombre} onChange={set('nombre')} />
          </div>
          <div>
            <label htmlFor="apellido" className="label">Apellido</label>
            <input id="apellido" className="input" required autoComplete="family-name" value={form.apellido} onChange={set('apellido')} />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" placeholder="nombre@email.com" required autoComplete="email" inputMode="email"
            value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label htmlFor="telefono" className="label">Celular <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <input id="telefono" type="tel" className="input" placeholder="+54 9 381 555-0142" autoComplete="tel" inputMode="tel"
            value={form.telefono} onChange={set('telefono')} aria-describedby="telefono-hint" />
          <p id="telefono-hint" className="hint">Para confirmarte los turnos por WhatsApp.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="password" className="label">Contraseña</label>
            <div className="relative">
              <input id="password" type={showPass ? 'text' : 'password'} className="input pr-11" required autoComplete="new-password"
                value={form.password} onChange={set('password')} />
              <button type="button" onClick={() => setShowPass(s => !s)}
                aria-label={showPass ? 'Ocultar contraseñas' : 'Mostrar contraseñas'} aria-pressed={showPass}
                className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-160">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirm" className="label">Repetila</label>
            <input id="confirm" type={showPass ? 'text' : 'password'} className="input" required autoComplete="new-password"
              value={form.confirm} onChange={set('confirm')} onBlur={() => setTocado(true)}
              aria-invalid={noCoinciden || undefined} aria-describedby={noCoinciden ? 'confirm-error' : undefined} />
          </div>
        </div>
        {noCoinciden && <p id="confirm-error" className="field-error -mt-2">Las contraseñas no coinciden.</p>}

        <button type="submit" disabled={loading} className="btn-primary btn-lg w-full !mt-6">
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Creando tu cuenta…</>
            : <>Crear cuenta <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
