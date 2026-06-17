import { useState } from 'react';
import { Info, Eye, EyeOff, KeyRound, Mail } from 'lucide-react';

export default function Step1Organization({ onNext, initial }) {
  const [form, setForm] = useState({
    titular_nombre: '', titular_apellido: '', titular_email: '',
    titular_telefono: '', titular_dni: '', password: '', confirm_password: '',
    ...initial,
  });
  const [showPass, setShowPass]    = useState(false);
  const [showConf, setShowConf]    = useState(false);
  const [error,    setError]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (form.password !== form.confirm_password) return setError('Las contraseñas no coinciden.');
    setError('');
    onNext(form);
  };

  return (
    <div className="card" data-aos="fade-up">
      <h2 className="text-xl font-bold mb-1">Paso 1: Datos del encargado</h2>
      <p className="text-muted-foreground text-sm mb-5">Información del titular responsable del complejo</p>

      {/* ── Aviso de credenciales ── */}
      <div className="bg-primary/5 border border-primary/25 rounded-xl p-4 flex gap-3 mb-6">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-primary">Tus credenciales de acceso al panel</p>
          <p className="text-sm text-muted-foreground mt-1">
            El <strong className="text-foreground">email</strong> y la{' '}
            <strong className="text-foreground">contraseña</strong> que ingresás a continuación
            serán los que usarás para <strong className="text-foreground">iniciar sesión</strong> y
            administrar tu complejo deportivo.
          </p>
          <div className="flex gap-4 mt-2.5">
            <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <Mail className="w-3.5 h-3.5" /> Email → usuario de acceso
            </span>
            <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <KeyRound className="w-3.5 h-3.5" /> Contraseña → clave de ingreso
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nombre y apellido */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre <span className="text-red-500">*</span></label>
            <input className="input" required placeholder="Juan"
              value={form.titular_nombre} onChange={e => set('titular_nombre', e.target.value)} />
          </div>
          <div>
            <label className="label">Apellido <span className="text-red-500">*</span></label>
            <input className="input" required placeholder="García"
              value={form.titular_apellido} onChange={e => set('titular_apellido', e.target.value)} />
          </div>
        </div>

        {/* Email — resaltado */}
        <div>
          <label className="label flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-primary" />
            Email (usuario de acceso) <span className="text-red-500">*</span>
          </label>
          <input type="email" className="input border-primary/40 focus:ring-primary" required
            placeholder="tu@email.com"
            value={form.titular_email} onChange={e => set('titular_email', e.target.value)} />
          <p className="text-xs text-primary font-medium mt-1">
            Este será tu usuario para ingresar al sistema
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Teléfono <span className="text-red-500">*</span></label>
            <input className="input" required placeholder="+54 11 ..."
              value={form.titular_telefono} onChange={e => set('titular_telefono', e.target.value)} />
          </div>
          <div>
            <label className="label">DNI / CUIT</label>
            <input className="input" placeholder="20-12345678-0"
              value={form.titular_dni} onChange={e => set('titular_dni', e.target.value)} />
          </div>
        </div>

        {/* Contraseña — resaltada */}
        <div className="border border-primary/20 bg-primary/3 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <KeyRound className="w-4 h-4" /> Contraseña de acceso al panel
          </div>

          <div>
            <label className="label">Contraseña <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input pr-10 border-primary/40"
                required minLength={6}
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={e => set('password', e.target.value)}
              />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Confirmar contraseña <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showConf ? 'text' : 'password'}
                className="input pr-10 border-primary/40"
                required minLength={6}
                placeholder="Repetí la contraseña"
                value={form.confirm_password}
                onChange={e => set('confirm_password', e.target.value)}
              />
              <button type="button" onClick={() => setShowConf(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-primary font-medium mt-1">
              Esta contraseña te permitirá acceder al panel de administración
            </p>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full py-3 text-base">
          Siguiente →
        </button>
      </form>
    </div>
  );
}
