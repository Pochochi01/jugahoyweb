import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mercadopagoService } from '../services/mercadopagoService';
import { tomarVerifier } from '../utils/pkce';

/**
 * /mercadopago/callback — vuelta del OAuth de MercadoPago (PKCE).
 * MercadoPago → backend (MP_REDIRECT_URI) → esta página, que tiene el
 * code_verifier guardado al tocar "Conectar". Lo envía con el código y vuelve
 * al panel (Configuración) con el resultado.
 */
export default function MercadoPagoCallbackPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState('Conectando tu cuenta de MercadoPago…');
  const hecho = useRef(false);   // StrictMode monta dos veces: el código se canjea UNA vez

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const q = new URLSearchParams(window.location.search);
    const volver = (params) => navigate(`/dashboard?${new URLSearchParams(params)}`, { replace: true });
    const pkce = tomarVerifier();

    (async () => {
      if (q.get('error')) {
        const cid = pkce?.complexId || (await mercadopagoService.complejoDelState(q.get('state')).catch(() => ({}))).complex_id || '';
        return volver({ mp: 'error', complex: cid, mp_msg: q.get('error') === 'access_denied' ? 'Cancelaste la autorización en MercadoPago.' : `MercadoPago: ${q.get('error_description') || q.get('error')}` });
      }
      if (!pkce) {
        return volver({ mp: 'error', mp_msg: 'La conexión venció o se inició en otro navegador. Volvé a tocar "Conectar con MercadoPago".' });
      }
      try {
        const r = await mercadopagoService.canjear({ code: q.get('code'), state: q.get('state'), code_verifier: pkce.verifier });
        volver({ mp: 'conectado', complex: r.complex_id, mp_email: r.correo_vinculado || '' });
      } catch (err) {
        setMsg('No se pudo conectar.');
        volver({ mp: 'error', complex: pkce.complexId || '', mp_msg: err?.message || 'No se pudo conectar MercadoPago.' });
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="card text-center space-y-3 max-w-sm">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#009ee3] border-t-transparent mx-auto" />
        <p className="text-sm">{msg}</p>
      </div>
    </div>
  );
}
