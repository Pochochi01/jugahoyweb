import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2, QrCode, Loader2, Ban } from 'lucide-react';
import { payClub, pesos } from '../../services/payService';
import QrOrden from './QrOrden';

/**
 * "Generar cobro" de un turno (Jugahoy Pay): jugadores, modo de división, asignación de cada
 * consumo (jugador / pareja / grupo), vista previa calculada por el backend y un QR por pagador
 * con seguimiento en vivo. Si ya hay un cobro en curso, muestra sus QR.
 */
const MODOS = [['iguales', 'Dividir en partes iguales'], ['uno', 'Un jugador paga todo'], ['porcentaje', 'Dividir por porcentaje'], ['pareja', 'Dividir por pareja']];
const errMsg = (e) => e?.message || 'Ocurrió un error';

export default function LiquidacionReserva({ complexId, bookingId, b, onBack, onCobrado }) {
  const svc = useMemo(() => payClub(complexId), [complexId]);
  const [jugadores, setJugadores] = useState(() => Array.from({ length: 4 }, (_, i) => ({ nombre: i === 0 ? (b?.nombre_cliente || '') : '', dni: '', telefono: i === 0 ? (b?.telefono_cliente || '') : '' })));
  const [modo, setModo] = useState('iguales');
  const [pagador, setPagador] = useState(0);
  const [porcentajes, setPorcentajes] = useState([25, 25, 25, 25]);
  const [asign, setAsign] = useState({});
  const [prev, setPrev] = useState(null);
  const [activas, setActivas] = useState(null);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);

  useEffect(() => { svc.liquidacion(bookingId).then(r => setActivas(r.ordenes)).catch(() => setActivas([])); }, [svc, bookingId]);
  const nombres = jugadores.map((j, i) => j.nombre.trim() || `Jugador ${i + 1}`);
  const cuerpo = () => ({
    jugadores: jugadores.map((j, i) => ({ nombre: nombres[i], dni: j.dni || undefined, telefono: j.telefono || undefined })),
    modo, pagador, porcentajes, asignaciones: asign,
  });
  // Vista previa en vivo (el backend calcula: misma regla que al generar)
  useEffect(() => {
    if (activas === null || activas.length) return undefined;
    const t = setTimeout(() => { setError(''); svc.liquidar(bookingId, cuerpo()).then(setPrev).catch(e => { setPrev(null); setError(errMsg(e)); }); }, 300);
    return () => clearTimeout(t);
  }, [jugadores, modo, pagador, porcentajes, asign, activas]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setJug = (i, k, v) => setJugadores(js => js.map((j, x) => (x === i ? { ...j, [k]: v } : j)));
  const agregar = () => { setJugadores(js => [...js, { nombre: '', dni: '', telefono: '' }]); setPorcentajes(p => [...p, 0]); };
  const quitar = (i) => { setJugadores(js => js.filter((_, x) => x !== i)); setPorcentajes(p => p.filter((_, x) => x !== i)); setAsign({}); if (pagador >= jugadores.length - 1) setPagador(0); };
  const generar = async () => {
    setGenerando(true); setError('');
    try { const r = await svc.liquidar(bookingId, { ...cuerpo(), generar: true }); setActivas(r.ordenes); } catch (e) { setError(errMsg(e)); } finally { setGenerando(false); }
  };
  const anularTodo = async () => {
    if (!window.confirm('¿Anular el cobro por QR de este turno? Las órdenes sin pagar quedan anuladas.')) return;
    try {
      for (const o of activas.filter(x => ['pendiente', 'rechazado'].includes(x.estado) && !x.importe_pagado)) await svc.cancelar(o.id, 'Anulado desde el turno');
      const r = await svc.liquidacion(bookingId); setActivas(r.ordenes);
    } catch (e) { setError(errMsg(e)); }
  };
  const valorAsign = (c) => { const a = asign[c.id]; return a ? `${a.tipo}:${a.indice ?? ''}` : 'grupo:'; };
  const parejas = Array.from({ length: Math.ceil(jugadores.length / 2) }, (_, i) => i);

  if (activas === null) return <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (activas.length) {
    const cobradas = activas.filter(o => o.estado === 'aprobado').length;
    return (
      <div className="space-y-4">
        <button className="btn-ghost text-sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Volver</button>
        <p className="text-sm text-muted-foreground">Cada jugador escanea su QR (o recibe el link por WhatsApp). Se actualiza solo · {cobradas} de {activas.length} pagado(s).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activas.map(o => <QrOrden key={o.id} orden={o} tamano="sm" onEstado={(ev) => {
            setActivas(xs => {
              const nuevas = xs.map(x => (x.token === ev.token ? { ...x, estado: ev.estado, importe_pagado: ev.importe_pagado } : x));
              if (nuevas.every(x => x.estado === 'aprobado')) setTimeout(() => onCobrado?.(), 800);
              return nuevas;
            });
          }} />)}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {cobradas < activas.length && <button className="btn-ghost text-sm text-red-400" onClick={anularTodo}><Ban className="w-4 h-4" /> Anular el cobro por QR</button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button className="btn-ghost text-sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Volver</button>
      <section className="space-y-2">
        <div className="text-sm font-semibold">Jugadores</div>
        {jugadores.map((j, i) => (
          <div key={i} className="grid grid-cols-[1fr_6.5rem_auto] sm:grid-cols-[1fr_7rem_9rem_auto] gap-2 items-center">
            <input className="input text-sm" value={j.nombre} onChange={e => setJug(i, 'nombre', e.target.value)} placeholder={`Jugador ${i + 1}`} aria-label={`Nombre del jugador ${i + 1}`} />
            <input className="input text-sm" inputMode="numeric" value={j.dni} onChange={e => setJug(i, 'dni', e.target.value.replace(/\D/g, ''))} placeholder="DNI" aria-label={`DNI del jugador ${i + 1}`} />
            <input className="input text-sm hidden sm:block" inputMode="tel" value={j.telefono} onChange={e => setJug(i, 'telefono', e.target.value.replace(/\D/g, ''))} placeholder="WhatsApp" aria-label={`WhatsApp del jugador ${i + 1}`} />
            <button className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30" disabled={jugadores.length <= 1} onClick={() => quitar(i)} aria-label={`Quitar jugador ${i + 1}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {jugadores.length < 12 && <button className="btn-ghost text-xs" onClick={agregar}><Plus className="w-3.5 h-3.5" /> Agregar jugador</button>}
      </section>

      <section className="space-y-2">
        <div className="text-sm font-semibold">¿Cómo se cobra?</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {MODOS.map(([k, l]) => <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${modo === k ? 'border-primary bg-primary/10' : 'border-border'}`}><input type="radio" checked={modo === k} onChange={() => setModo(k)} /> {l}</label>)}
        </div>
        {modo === 'uno' && <label className="text-xs text-muted-foreground">Paga<select className="input text-sm" value={pagador} onChange={e => setPagador(Number(e.target.value))}>{nombres.map((n, i) => <option key={i} value={i}>{n}</option>)}</select></label>}
        {modo === 'porcentaje' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{nombres.map((n, i) => (
            <label key={i} className="text-xs text-muted-foreground truncate">{n} (%)<input className="input text-sm" inputMode="decimal" value={porcentajes[i] ?? 0} onChange={e => setPorcentajes(p => p.map((x, k) => (k === i ? Number(e.target.value.replace(/[^\d.]/g, '')) || 0 : x)))} /></label>
          ))}<div className="text-xs self-end pb-2">Suma: {porcentajes.reduce((a, x) => a + Number(x || 0), 0)}%</div></div>
        )}
        {modo === 'pareja' && <p className="text-xs text-muted-foreground">Parejas: {parejas.map(p => nombres.slice(p * 2, p * 2 + 2).join(' / ')).join(' · ')} — cada pareja paga la mitad y recibe un solo QR.</p>}
      </section>

      {prev?.consumos_detalle?.length > 0 && modo !== 'uno' && (
        <section className="space-y-2">
          <div className="text-sm font-semibold">Consumos · ¿de quién es cada uno?</div>
          {prev.consumos_detalle.map(c => (
            <div key={c.id} className="grid grid-cols-[1fr_auto_10rem] gap-2 items-center text-sm">
              <span className="truncate">{c.nombre_producto}{Number(c.cantidad) > 1 && ` x${Number(c.cantidad)}`}</span>
              <span className="tabular-nums text-muted-foreground">{pesos(c.subtotal)}</span>
              <select className="input text-sm" value={valorAsign(c)} onChange={e => { const [tipo, indice] = e.target.value.split(':'); setAsign(a => ({ ...a, [c.id]: tipo === 'grupo' ? { tipo } : { tipo, indice: Number(indice) } })); }}>
                <option value="grupo:">Todo el grupo</option>
                {nombres.map((n, i) => <option key={i} value={`jugador:${i}`}>{n}</option>)}
                {parejas.map(p => <option key={`p${p}`} value={`pareja:${p}`}>Pareja {nombres.slice(p * 2, p * 2 + 2).join(' / ')}</option>)}
              </select>
            </div>
          ))}
        </section>
      )}

      {prev && (
        <section className="rounded-xl border border-border divide-y divide-border">
          {prev.pagadores.map((p, i) => (
            <div key={i} className="px-3 py-2 text-sm">
              <div className="flex justify-between font-semibold"><span>{p.nombre}</span><span className="tabular-nums">{pesos(p.total)}</span></div>
              <div className="text-xs text-muted-foreground">{p.items.map(it => `${it.concepto} ${pesos(it.importe)}`).join(' · ')}</div>
            </div>
          ))}
          <div className="px-3 py-2 flex justify-between text-sm font-bold"><span>Total</span><span className="tabular-nums">{pesos(prev.total)}</span></div>
        </section>
      )}
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      <button className="btn-primary w-full btn-lg font-bold" disabled={!prev || generando} onClick={generar}>
        {generando ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />} Generar {prev?.pagadores.length || ''} QR de pago
      </button>
    </div>
  );
}
