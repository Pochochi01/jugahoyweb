import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Step1Organization from './wizard/Step1Organization';
import Step2Complex from './wizard/Step2Complex';
import Step3Courts from './wizard/Step3Courts';
import Step4Review from './wizard/Step4Review';
import { publicService } from '../services/publicService';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, LayoutDashboard } from 'lucide-react';

const STEPS = ['Organización', 'Complejo', 'Canchas', 'Revisión'];

export default function RegisterComplexPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [step,    setStep]    = useState(0);
  const [data,    setData]    = useState({ org: {}, complex: {}, courts: [] });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);
  const [newUser, setNewUser] = useState(null);

  const next = (key, values) => {
    setData(d => ({ ...d, [key]: values }));
    setStep(s => s + 1);
  };
  const back = () => { setError(''); setStep(s => s - 1); };

  const handleFinish = async () => {
    setLoading(true);
    setError('');
    try {
      const { org, complex, courts } = data;
      const response = await publicService.registerComplex({
        // Step 1 — titular y credenciales
        titular_nombre:   org.titular_nombre,
        titular_apellido: org.titular_apellido,
        titular_email:    org.titular_email,
        titular_telefono: org.titular_telefono,
        titular_dni:      org.titular_dni,
        password:         org.password,
        // Step 2 — datos del complejo
        nombre:           complex.nombre,
        descripcion:      complex.descripcion,
        direccion:        complex.direccion,
        ciudad:           complex.ciudad,
        provincia:        complex.provincia,
        telefono:         complex.telefono,
        email:            complex.email,
        prestaciones:     complex.prestaciones,
        // Step 3 — canchas
        fields: courts,
      });

      // Auto-login: guardar token y actualizar contexto de auth
      loginWithToken(response.token, response.user);
      setNewUser(response.user);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Error al registrar el complejo. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (done) return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center bg-muted px-4">
        <div className="card text-center max-w-lg w-full" data-aos="zoom-in">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">¡Complejo registrado!</h2>
          <p className="text-muted-foreground mb-6">
            Tu cuenta y complejo fueron creados exitosamente.
            Ya podés acceder al panel de administración.
          </p>

          {/* Recordatorio de credenciales */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-left mb-6 space-y-2">
            <p className="text-sm font-semibold text-primary">Tus datos de acceso</p>
            <div className="text-sm">
              <span className="text-muted-foreground">Email: </span>
              <span className="font-semibold">{data.org.titular_email}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Contraseña: </span>
              <span className="font-mono">{'•'.repeat(Math.min(data.org.password?.length || 8, 12))}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Guardá estos datos para tu próximo inicio de sesión.
            </p>
          </div>

          <button className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            onClick={() => navigate('/dashboard')}>
            <LayoutDashboard className="w-5 h-5" /> Ir al panel de administración
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );

  // ── Wizard ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-muted py-12">
        <div className="max-w-2xl mx-auto px-4">

          {/* Progress bar */}
          <div className="flex items-center mb-8">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border-2 transition-colors
                  ${i < step ? 'bg-primary border-primary text-white'
                    : i === step ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div className={`text-xs ml-1.5 hidden sm:block font-medium
                  ${i === step ? 'text-primary' : 'text-muted-foreground'}`}>
                  {label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Error global */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          {step === 0 && <Step1Organization onNext={v => next('org', v)}     initial={data.org} />}
          {step === 1 && <Step2Complex      onNext={v => next('complex', v)} onBack={back} initial={data.complex} />}
          {step === 2 && <Step3Courts       onNext={v => next('courts', v)}  onBack={back} initial={data.courts} />}
          {step === 3 && (
            <Step4Review
              data={data}
              onBack={back}
              onFinish={handleFinish}
              loading={loading}
            />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
