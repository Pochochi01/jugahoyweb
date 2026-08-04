import { useState, useEffect, useRef } from 'react';
import { MessageCircle, ShieldCheck, ArrowRight, RotateCcw, CheckCircle } from 'lucide-react';
import { verificationService } from '../services/verificationService';

/**
 * PhoneVerification — verificación del teléfono por WhatsApp (OTP de 6 dígitos).
 *
 * Flujo: "Enviar código" → llega por WhatsApp → ingresar 6 dígitos → "Verificar".
 * Muestra intentos restantes, cooldown de reenvío y estado de éxito.
 *
 * Props:
 *   telefono   teléfono a verificar (informativo)
 *   onVerified callback cuando se verifica con éxito
 *   compact    variante compacta (para banners)
 */
export default function PhoneVerification({ telefono, onVerified, compact = false }) {
  const [step,      setStep]      = useState('idle');   // idle | code | done
  const [code,      setCode]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [info,      setInfo]      = useState('');
  const [cooldown,  setCooldown]  = useState(0);
  const timerRef = useRef(null);

  // Cuenta regresiva del cooldown de reenvío
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const enviar = async () => {
    setLoading(true); setError(''); setInfo('');
    try {
      const res = await verificationService.sendCode(telefono);
      if (res.alreadyVerified) { setStep('done'); onVerified?.(); return; }
      setStep('code');
      setCooldown(30);
      setInfo(res.dev_otp ? `Código (solo dev): ${res.dev_otp}` : 'Te enviamos un código por WhatsApp.');
    } catch (err) {
      const d = err?.response?.data;
      // 429 con cooldown → arrancar el contador con lo que informe el server
      if (d?.code === 'OTP_COOLDOWN') setStep('code');
      setError(d?.message || err.message || 'No se pudo enviar el código.');
    } finally { setLoading(false); }
  };

  const verificar = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Ingresá los 6 dígitos.'); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      await verificationService.confirmCode(code);
      setStep('done');
      onVerified?.();
    } catch (err) {
      setError(err?.response?.data?.message || 'Código incorrecto.');
    } finally { setLoading(false); }
  };

  if (step === 'done') {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-600">
        <CheckCircle className="w-4 h-4" /> Teléfono verificado
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'card space-y-4'}>
      {!compact && (
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Verificá tu WhatsApp</h3>
        </div>
      )}

      {step !== 'code' ? (
        <>
          <p className="text-sm text-muted-foreground">
            Te enviaremos un código a <strong className="text-foreground">{telefono || 'tu número'}</strong> por
            WhatsApp para confirmar que es tuyo.
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={enviar} disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-60">
            <MessageCircle className="w-4 h-4" />
            {loading ? 'Enviando…' : 'Enviar código por WhatsApp'}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Ingresá el código de 6 dígitos que te llegó por WhatsApp.</p>
          {info && <p className="text-xs text-primary">{info}</p>}
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className="input text-center tracking-[0.4em] text-lg font-bold w-40"
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificar()}
            />
            <button onClick={verificar} disabled={loading || code.length !== 6}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              {loading ? 'Verificando…' : <>Verificar <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={enviar} disabled={loading || cooldown > 0}
            className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
          </button>
        </>
      )}

      {!compact && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border pt-3">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          El código vence en 5 minutos y es de un solo uso.
        </div>
      )}
    </div>
  );
}
