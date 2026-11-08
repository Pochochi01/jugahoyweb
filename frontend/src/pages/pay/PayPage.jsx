import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CreditCard, CheckCircle2, XCircle, Clock, Loader2, ShieldCheck, Receipt } from 'lucide-react';
import { payPublico, ESTADO_PAY, pesos } from '../../services/payService';

/**
 * /pay/:token — Página pública de pago de Jugahoy Pay (destino del QR y del link).
 * Muestra club, concepto, detalle, importe y estado en vivo; "Pagar ahora" abre Checkout Pro
 * (saldo en cuenta, débito, crédito con cuotas, transferencia). Pago parcial si la orden lo permite.
 */
export default function PayPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [yendo, setYendo] = useState(false);
  const [monto, setMonto] = useState('');

  useEffect(() => {
    payPublico.orden(token).then(setO).catch(e => setError(e.status === 404 ? 'No encontramos esta orden de pago.' : (e.message || 'No se pudo cargar el pago.')));
    return payPublico.escuchar(token, (ev) => ev.estado && setO(x => (x ? { ...x, estado: ev.estado, importe_pagado: ev.importe_pagado ?? x.importe_pagado, saldo: ev.importe != null ? ev.importe - (ev.importe_pagado || 0) : x.saldo } : x)));
  }, [token]);

  const pagar = async () => {
    setYendo(true); setError('');
    try {
      const r = await payPublico.checkout(token, o.permite_parcial && monto ? Number(monto) : undefined);
      window.location.href = r.url;
    } catch (e) { setError(e.message || 'No se pudo iniciar el pago.'); setYendo(false); }
  };

  if (error && !o) return <Centro><Tarjeta><XCircle className="w-10 h-10 text-red-400 mx-auto" /><p className="text-center">{error}</p></Tarjeta></Centro>;
  if (!o) return <Centro><Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="Cargando" /></Centro>;

  const e = ESTADO_PAY[o.estado] || { label: o.estado, cls: '' };
  const volvio = params.get('resultado');
  const pagado = o.estado === 'aprobado';
  return (
    <Centro>
      <Tarjeta>
        <div className="flex items-center gap-3">
          {o.club?.logo_url ? <img src={o.club.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover bg-muted" /> : <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-black text-lg">{(o.club?.nombre || 'J').slice(0, 1)}</div>}
          <div className="min-w-0">
            <div className="font-bold truncate">{o.club?.nombre}</div>
            {o.club?.ciudad && <div className="text-xs text-muted-foreground truncate">{o.club.direccion} · {o.club.ciudad}</div>}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> Concepto</div>
          <div className="font-semibold leading-snug">{o.concepto}</div>
          {o.cliente && <div className="text-sm text-muted-foreground">A nombre de {o.cliente}</div>}
        </div>

        {o.detalle?.length > 1 && (
          <ul className="text-sm divide-y divide-border rounded-lg border border-border">
            {o.detalle.map((d, i) => <li key={i} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0">{d.concepto}</span><span className="tabular-nums shrink-0">{pesos(d.importe)}</span></li>)}
          </ul>
        )}

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{o.importe_pagado > 0 && !pagado ? 'Saldo a pagar' : 'Importe'}</div>
            <div className="text-3xl font-black tabular-nums">{pesos(o.importe_pagado > 0 && !pagado ? o.saldo : o.importe)}</div>
            {o.importe_pagado > 0 && !pagado && <div className="text-xs text-muted-foreground">Pagado {pesos(o.importe_pagado)} de {pesos(o.importe)}</div>}
          </div>
          <span className={`badge ${e.cls}`} role="status" aria-live="polite">{e.label}</span>
        </div>

        {pagado ? (
          <div className="rounded-xl bg-emerald-500/10 text-emerald-400 px-4 py-4 text-center space-y-1">
            <CheckCircle2 className="w-10 h-10 mx-auto" />
            <div className="font-bold">¡Pago aprobado!</div>
            {o.pagado_at && <div className="text-xs">{new Date(o.pagado_at).toLocaleString('es-AR')}</div>}
          </div>
        ) : o.estado === 'procesando' ? (
          <div className="rounded-xl bg-sky-500/10 text-sky-400 px-4 py-4 text-center space-y-1"><Clock className="w-8 h-8 mx-auto" /><div className="font-semibold">Estamos esperando la confirmación del pago.</div><div className="text-xs">Esta pantalla se actualiza sola.</div></div>
        ) : ['vencido', 'cancelado', 'reembolsado'].includes(o.estado) ? (
          <div className="rounded-xl bg-muted px-4 py-3 text-center text-sm">Esta orden ya no se puede pagar ({e.label.toLowerCase()}). Consultá con el club.</div>
        ) : (
          <div className="space-y-3">
            {volvio === 'rechazado' && <p className="text-sm text-red-400 text-center">El pago no se aprobó. Podés intentar de nuevo con otro medio.</p>}
            {o.permite_parcial && (
              <label className="block text-xs text-muted-foreground">Monto a pagar (podés pagar una parte)
                <input className="input" inputMode="decimal" placeholder={`Hasta ${pesos(o.saldo)}`} value={monto} onChange={ev => setMonto(ev.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} />
              </label>
            )}
            <button className="btn-primary w-full btn-lg font-bold" disabled={yendo || !o.puede_pagar} onClick={pagar}>
              {yendo ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />} {yendo ? 'Abriendo Mercado Pago…' : 'Pagar ahora'}
            </button>
            {!o.puede_pagar && <p className="text-xs text-amber-400 text-center">El club todavía no habilitó el pago online. Pagá en el club.</p>}
            <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Pago seguro con Mercado Pago: dinero en cuenta, débito, crédito en cuotas o transferencia.</p>
            {error && <p className="text-sm text-red-400 text-center" role="alert">{error}</p>}
          </div>
        )}
      </Tarjeta>
    </Centro>
  );
}

const Centro = ({ children }) => <div className="min-h-screen bg-background flex items-center justify-center p-4">{children}</div>;
const Tarjeta = ({ children }) => <div className="card w-full max-w-md space-y-5">{children}</div>;
