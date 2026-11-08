import { useState, useEffect } from 'react';
import { Copy, Check, MessageCircle, ExternalLink, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { payPublico, ESTADO_PAY, pesos } from '../../services/payService';

/**
 * QR de una orden de Jugahoy Pay con su estado EN VIVO (SSE): pendiente → procesando → pagado.
 * Incluye copiar link y compartir por WhatsApp (el del dispositivo, como el resto de los módulos).
 * `orden`: { token, url, qr, importe, concepto, cliente_nombre, cliente_telefono, estado }
 */
export default function QrOrden({ orden, tamano = 'md', onEstado, compacto = false }) {
  const [estado, setEstado] = useState(orden.estado);
  const [pagado, setPagado] = useState(orden.importe_pagado || 0);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    setEstado(orden.estado);
    return payPublico.escuchar(orden.token, (ev) => {
      if (!ev.estado) return;
      setEstado(ev.estado);
      if (ev.importe_pagado != null) setPagado(ev.importe_pagado);
      onEstado?.(ev);
    });
  }, [orden.token]);   // eslint-disable-line react-hooks/exhaustive-deps

  const copiar = async () => { try { await navigator.clipboard.writeText(orden.url); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sin portapapeles */ } };
  const texto = `Hola${orden.cliente_nombre ? ` ${orden.cliente_nombre}` : ''}: tu pago de ${pesos(orden.importe)} por ${orden.concepto}. Pagalo acá: ${orden.url}`;
  const wa = `https://wa.me/${orden.cliente_telefono || ''}?text=${encodeURIComponent(texto)}`;
  const px = { sm: 'w-36 h-36', md: 'w-56 h-56', lg: 'w-[min(80vw,28rem)] h-[min(80vw,28rem)]' }[tamano];
  const e = ESTADO_PAY[estado] || { label: estado, cls: '' };
  const pagadoOk = estado === 'aprobado';

  return (
    <div className={`rounded-xl border ${pagadoOk ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border bg-card'} p-3 space-y-2 text-center`}>
      {orden.cliente_nombre && !compacto && <div className="font-semibold truncate">{orden.cliente_nombre}</div>}
      <div className="relative mx-auto w-fit">
        <img src={orden.qr} alt={`QR de pago de ${pesos(orden.importe)}`} className={`${px} rounded-lg bg-white p-1 ${pagadoOk ? 'opacity-20' : ''}`} />
        {pagadoOk && <CheckCircle2 className="absolute inset-0 m-auto w-1/2 h-1/2 text-emerald-500" aria-hidden="true" />}
      </div>
      <div className="text-xl font-black tabular-nums">{pesos(orden.importe)}</div>
      <div className="flex items-center justify-center gap-1.5 text-sm" role="status" aria-live="polite">
        {estado === 'procesando' ? <Loader2 className="w-4 h-4 animate-spin" /> : pagadoOk ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : ['rechazado', 'vencido'].includes(estado) ? <XCircle className="w-4 h-4 text-red-400" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
        <span className={`badge ${e.cls}`}>{e.label}</span>
        {estado === 'parcial' && <span className="text-xs text-muted-foreground">({pesos(pagado)} de {pesos(orden.importe)})</span>}
      </div>
      {!compacto && (
        <div className="flex flex-wrap justify-center gap-1">
          <button type="button" className="btn-ghost text-xs" onClick={copiar}>{copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar link'}</button>
          <a className="btn-ghost text-xs" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
          <a className="btn-ghost text-xs" href={orden.url} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /> Abrir</a>
        </div>
      )}
    </div>
  );
}
