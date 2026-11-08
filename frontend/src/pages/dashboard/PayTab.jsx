import { useState, useEffect, useMemo, useCallback } from 'react';
import { QrCode, ListOrdered, Wallet, BarChart3, Plus, RotateCcw, Ban, Banknote, Bell, Search, ChevronLeft, ChevronRight, Monitor, X } from 'lucide-react';
import { payClub, ESTADO_PAY, MODULO_PAY, pesos } from '../../services/payService';
import QrOrden from '../../components/pay/QrOrden';

/**
 * Jugahoy Pay — motor único de cobros del club.
 *   Cobro QR (portería) · Órdenes · Cuenta corriente · Finanzas
 * Todo se actualiza en tiempo real (SSE del club).
 */
const errMsg = (e) => e?.message || 'Ocurrió un error';
const VISTAS = [['porteria', 'Cobro QR', QrCode], ['ordenes', 'Órdenes', ListOrdered], ['cuenta', 'Cuenta corriente', Wallet], ['finanzas', 'Finanzas', BarChart3]];

export default function PayTab({ complexId, vistaInicial }) {
  const svc = useMemo(() => payClub(complexId), [complexId]);
  const [vista, setVista] = useState(VISTAS.some(([k]) => k === vistaInicial) ? vistaInicial : 'porteria');
  const [tick, setTick] = useState(0);   // eventos en vivo → refrescar listados
  useEffect(() => svc.escuchar((ev) => ev.estado && setTick(t => t + 1)), [svc]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2 mr-auto"><QrCode className="w-5 h-5 text-primary" /> Jugahoy Pay</h2>
        {VISTAS.map(([k, l, Icon]) => (
          <button key={k} onClick={() => setVista(k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${vista === k ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}><Icon className="w-4 h-4" /> {l}</button>
        ))}
        <a className="btn-ghost text-sm" href={`/autopago?club=${complexId}`} target="_blank" rel="noreferrer" title="Modo kiosco para TV o tablet"><Monitor className="w-4 h-4" /> Autopago</a>
      </div>
      {vista === 'porteria' && <Porteria svc={svc} />}
      {vista === 'ordenes' && <Ordenes svc={svc} tick={tick} />}
      {vista === 'cuenta' && <Cuenta svc={svc} tick={tick} />}
      {vista === 'finanzas' && <Finanzas svc={svc} tick={tick} />}
    </div>
  );
}

// ── Portería: cobro QR inmediato ──────────────────────────────
const CONCEPTOS = [['porteria', 'Ingreso / portería'], ['cantina', 'Cantina'], ['buffet', 'Buffet'], ['alquiler', 'Alquiler de elementos'], ['producto', 'Producto del club'], ['clase', 'Clase particular'], ['clinica', 'Clínica deportiva'], ['evento', 'Entrada a evento'], ['multa', 'Multa / recargo'], ['otro', 'Otro']];
export function FormCobro({ svc, onCreada, compacto = false }) {
  const [f, setF] = useState({ modulo: 'porteria', concepto: '', importe: '', cliente: '', dni: '', telefono: '', permite_parcial: false, a_cuenta: false });
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const crear = async (e) => {
    e.preventDefault(); setError('');
    const importe = Number(String(f.importe).replace(',', '.'));
    if (!(importe > 0)) return setError('Ingresá el importe.');
    setCreando(true);
    try {
      const o = await svc.crearOrden({
        modulo: f.modulo, concepto: f.concepto.trim() || CONCEPTOS.find(c => c[0] === f.modulo)[1], importe,
        permite_parcial: f.permite_parcial, cliente: f.cliente || f.dni ? { nombre: f.cliente.trim() || undefined, dni: f.dni || undefined, telefono: f.telefono || undefined } : undefined,
        vence_minutos: f.a_cuenta ? undefined : 60 * 24,
      });
      onCreada(o, f.a_cuenta);
      setF(x => ({ ...x, concepto: '', importe: '', cliente: '', dni: '', telefono: '' }));
    } catch (err) { setError(errMsg(err)); } finally { setCreando(false); }
  };
  return (
    <form onSubmit={crear} className="card space-y-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">1. Concepto
          <select className="input text-sm" value={f.modulo} onChange={e => set('modulo', e.target.value)}>{CONCEPTOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Detalle (opcional)<input className="input text-sm" value={f.concepto} onChange={e => set('concepto', e.target.value)} placeholder="Ej.: 2 aguas + gatorade" /></label>
        <label className="text-xs text-muted-foreground">Importe<input className="input text-lg font-bold" inputMode="decimal" value={f.importe} onChange={e => set('importe', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="$" required /></label>
        {!compacto && <label className="text-xs text-muted-foreground">Cliente (opcional, para su cuenta corriente)<input className="input text-sm" value={f.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Nombre" /></label>}
        {!compacto && <label className="text-xs text-muted-foreground">DNI (opcional)<input className="input text-sm" inputMode="numeric" value={f.dni} onChange={e => set('dni', e.target.value.replace(/\D/g, ''))} /></label>}
        {!compacto && <label className="text-xs text-muted-foreground">WhatsApp (opcional)<input className="input text-sm" inputMode="tel" value={f.telefono} onChange={e => set('telefono', e.target.value.replace(/[^\d]/g, ''))} placeholder="549381…" /></label>}
      </div>
      {!compacto && (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.permite_parcial} onChange={e => set('permite_parcial', e.target.checked)} /> Permitir pago parcial</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.a_cuenta} disabled={!f.cliente && !f.dni} onChange={e => set('a_cuenta', e.target.checked)} /> Pago posterior (a cuenta, sin vencimiento)</label>
        </div>
      )}
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={creando}><QrCode className="w-4 h-4" /> {creando ? 'Generando…' : '2. Generar QR'}</button>
    </form>
  );
}

function Porteria({ svc }) {
  const [orden, setOrden] = useState(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <FormCobro svc={svc} onCreada={(o, aCuenta) => { setOrden(o); setMsg(aCuenta ? 'Quedó cargado en la cuenta corriente del cliente: puede pagarlo después con este QR o el link.' : ''); }} />
      <div className="space-y-3">
        {orden ? (
          <>
            <div className="text-sm text-muted-foreground">3. Mostrá el QR al cliente · se confirma solo al aprobarse el pago.</div>
            <QrOrden orden={orden} tamano="lg" />
            {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
            <div className="flex flex-wrap gap-2 justify-center">
              <button className="btn-outline text-sm" onClick={async () => { try { await svc.confirmar(orden.id, { metodo: 'efectivo' }); } catch (e) { setMsg(errMsg(e)); } }}><Banknote className="w-4 h-4" /> Cobró en efectivo</button>
              <button className="btn-ghost text-sm" onClick={() => setOrden(null)}><Plus className="w-4 h-4" /> Nuevo cobro</button>
            </div>
          </>
        ) : <div className="card text-center text-sm text-muted-foreground py-16"><QrCode className="w-10 h-10 mx-auto mb-2" />Elegí el concepto y el importe para generar el QR.</div>}
      </div>
    </div>
  );
}

// ── Órdenes ───────────────────────────────────────────────────
function Ordenes({ svc, tick }) {
  const [f, setF] = useState({ estado: '', modulo: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => svc.ordenes({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page, limit: 25 }).then(setData).catch(e => setError(errMsg(e))), [svc, f, page]);
  useEffect(() => { cargar(); }, [cargar, tick]);
  const accion = async (fn, confirmar) => {
    if (confirmar && !window.confirm(confirmar)) return;
    setError('');
    try { await fn(); cargar(); if (abierta) setAbierta(await svc.orden(abierta.id)); } catch (e) { setError(errMsg(e)); }
  };
  const paginas = data ? Math.ceil(data.total / data.limit) : 0;
  return (
    <div className="space-y-3">
      <div className="card !p-3 grid sm:grid-cols-3 gap-2">
        <label className="text-xs text-muted-foreground">Estado<select className="input text-sm" value={f.estado} onChange={e => { setF(x => ({ ...x, estado: e.target.value })); setPage(1); }}><option value="">Todos</option>{Object.entries(ESTADO_PAY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Módulo<select className="input text-sm" value={f.modulo} onChange={e => { setF(x => ({ ...x, modulo: e.target.value })); setPage(1); }}><option value="">Todos</option>{Object.entries(MODULO_PAY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Buscar<span className="relative block"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="input text-sm !pl-8" value={f.q} onChange={e => { setF(x => ({ ...x, q: e.target.value })); setPage(1); }} placeholder="Cliente o concepto" /></span></label>
      </div>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!data ? <div className="h-40 rounded-xl bg-muted animate-pulse" /> : !data.items.length ? <div className="card text-center text-sm text-muted-foreground py-10">No hay órdenes con estos filtros.</div> : (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b border-border text-left"><th className="px-3 py-2">Fecha</th><th className="px-2">Concepto</th><th className="px-2">Cliente</th><th className="px-2 text-right">Importe</th><th className="px-2">Estado</th><th className="px-3" /></tr></thead>
            <tbody>{data.items.map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => svc.orden(o.id).then(setAbierta)}>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(o.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-2 py-2"><div className="font-medium">{o.concepto}</div><div className="text-xs text-muted-foreground">{MODULO_PAY[o.modulo] || o.modulo}</div></td>
                <td className="px-2 py-2">{o.cliente_nombre || '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pesos(o.importe)}{o.importe_pagado > 0 && o.estado !== 'aprobado' && <div className="text-[11px] text-muted-foreground">pagado {pesos(o.importe_pagado)}</div>}</td>
                <td className="px-2 py-2"><span className={`badge ${ESTADO_PAY[o.estado]?.cls || ''}`}>{ESTADO_PAY[o.estado]?.label || o.estado}</span></td>
                <td className="px-3 py-2 text-right text-xs text-primary">Ver</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {paginas > 1 && <div className="flex items-center justify-center gap-3 text-sm"><button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></button><span>{page} / {paginas}</span><button className="btn-ghost" disabled={page >= paginas} onClick={() => setPage(p => p + 1)} aria-label="Siguiente"><ChevronRight className="w-4 h-4" /></button></div>}
      {abierta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAbierta(null)} />
          <div className="relative w-full sm:max-w-2xl bg-card border border-border rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{abierta.concepto}</h3><div className="text-xs text-muted-foreground">{MODULO_PAY[abierta.modulo] || abierta.modulo} · {abierta.cliente_nombre || 'sin cliente'} · creada por {abierta.creado_por || '—'}</div></div><button className="p-1 rounded hover:bg-muted" onClick={() => setAbierta(null)} aria-label="Cerrar"><X className="w-5 h-5" /></button></div>
            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
              <QrOrden orden={abierta} tamano="sm" />
              <div className="space-y-3 text-sm">
                <ul className="divide-y divide-border rounded-lg border border-border">{(abierta.detalle || []).map((d, i) => <li key={i} className="flex justify-between px-3 py-1.5"><span>{d.concepto}</span><span className="tabular-nums">{pesos(d.importe)}</span></li>)}</ul>
                <div className="flex flex-wrap gap-2">
                  {['pendiente', 'parcial', 'rechazado', 'procesando', 'vencido'].includes(abierta.estado) && <button className="btn-outline text-xs" onClick={() => accion(() => svc.confirmar(abierta.id, { metodo: 'efectivo' }), `¿Registrar el cobro de ${pesos(abierta.saldo)} en efectivo?`)}><Banknote className="w-3.5 h-3.5" /> Cobrar en efectivo</button>}
                  {['pendiente', 'parcial', 'rechazado', 'vencido'].includes(abierta.estado) && <button className="btn-ghost text-xs" onClick={() => accion(() => svc.recordatorio(abierta.id))}><Bell className="w-3.5 h-3.5" /> Recordatorio</button>}
                  {['pendiente', 'rechazado', 'vencido'].includes(abierta.estado) && abierta.importe_pagado === 0 && <button className="btn-ghost text-xs text-red-400" onClick={() => accion(() => svc.cancelar(abierta.id), '¿Anular esta orden?')}><Ban className="w-3.5 h-3.5" /> Anular</button>}
                  {['aprobado', 'parcial'].includes(abierta.estado) && <button className="btn-ghost text-xs text-red-400" onClick={() => accion(() => svc.reembolsar(abierta.id), '¿Reembolsar el pago? Se devuelve el dinero por el mismo medio.')}><RotateCcw className="w-3.5 h-3.5" /> Reembolsar</button>}
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Auditoría</div>
                  <ol className="text-xs space-y-1">{(abierta.eventos || []).map(ev => <li key={ev.id}><span className="text-muted-foreground">{new Date(ev.createdAt).toLocaleString('es-AR')}</span> · {ev.tipo.replace(/_/g, ' ')}{ev.estado_nuevo && ` → ${ESTADO_PAY[ev.estado_nuevo]?.label || ev.estado_nuevo}`}{ev.usuario && ` · ${ev.usuario}`}{ev.origen && ` (${ev.origen})`}</li>)}</ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cuenta corriente ──────────────────────────────────────────
function Cuenta({ svc, tick }) {
  const [q, setQ] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(true);
  const [lista, setLista] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [orden, setOrden] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { const t = setTimeout(() => svc.clientes({ q: q || undefined, deuda: soloDeuda ? 1 : undefined }).then(setLista).catch(e => setError(errMsg(e))), 300); return () => clearTimeout(t); }, [svc, q, soloDeuda, tick]);
  useEffect(() => { if (cliente) svc.cliente(cliente.cliente_key).then(setCliente).catch(() => {}); }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid lg:grid-cols-[22rem_1fr] gap-4 items-start">
      <div className="card !p-3 space-y-2">
        <input className="input text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente o DNI" />
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={soloDeuda} onChange={e => setSoloDeuda(e.target.checked)} /> Solo con deuda</label>
        <ul className="divide-y divide-border">
          {!lista ? <li className="h-20 bg-muted animate-pulse rounded" /> : !lista.length ? <li className="text-sm text-muted-foreground py-4 text-center">Sin clientes.</li> : lista.map(c => (
            <li key={c.cliente_key}><button className="w-full text-left py-2 flex justify-between gap-2 hover:text-primary" onClick={() => { setOrden(null); svc.cliente(c.cliente_key).then(setCliente).catch(e => setError(errMsg(e))); }}>
              <span className="min-w-0 truncate">{c.nombre || c.cliente_key}</span><span className={`tabular-nums ${c.saldo > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pesos(Math.abs(c.saldo))}</span></button></li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        {error && <div className="alert-error" role="alert">{error}</div>}
        {!cliente ? <div className="card text-center text-sm text-muted-foreground py-12"><Wallet className="w-8 h-8 mx-auto mb-2" />Elegí un cliente para ver su cuenta.</div> : (
          <>
            <div className="card grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-4 font-semibold">{cliente.nombre || cliente.cliente_key}</div>
              <div><div className="text-xs text-muted-foreground">Deuda total</div><div className="text-xl font-bold text-red-400 tabular-nums">{pesos(cliente.deuda_total)}</div></div>
              <div><div className="text-xs text-muted-foreground">Saldo a favor</div><div className="text-xl font-bold text-emerald-400 tabular-nums">{pesos(cliente.saldo_actual)}</div></div>
              <div><div className="text-xs text-muted-foreground">Pendiente de cobro</div><div className="text-xl font-bold tabular-nums">{pesos(cliente.saldo_pendiente)}</div></div>
              <div className="flex items-end">{cliente.saldo_pendiente > 0 && <button className="btn-primary text-sm w-full" onClick={() => svc.cobrarSaldo(cliente.cliente_key).then(setOrden).catch(e => setError(errMsg(e)))}><QrCode className="w-4 h-4" /> Cobrar saldo</button>}</div>
            </div>
            {orden && <div className="max-w-xs"><QrOrden orden={orden} /></div>}
            <div className="card !p-0">
              <div className="px-4 py-2 border-b border-border text-sm font-semibold">Últimos movimientos</div>
              <ul className="divide-y divide-border text-sm">{cliente.movimientos.map(mv => (
                <li key={mv.id} className="px-4 py-2 flex justify-between gap-3"><span className="min-w-0"><span className="block truncate">{mv.concepto}</span><span className="text-xs text-muted-foreground">{new Date(mv.created_at || mv.createdAt).toLocaleString('es-AR')} · {mv.tipo}</span></span><span className={`tabular-nums shrink-0 ${mv.importe > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{mv.importe > 0 ? '+' : '−'}{pesos(Math.abs(mv.importe))}</span></li>
              ))}</ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Finanzas ──────────────────────────────────────────────────
function Kpi({ label, valor, sub }) {
  return <div className="card !p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold tabular-nums">{valor}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
function Barras({ filas, etiqueta, valor }) {
  const max = Math.max(1, ...filas.map(valor));
  return (
    <ul className="space-y-1.5">{filas.map((f, i) => (
      <li key={i} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-sm">
        <span className="truncate text-muted-foreground">{etiqueta(f)}</span>
        <span className="h-2.5 rounded bg-muted overflow-hidden"><span className="block h-full bg-primary rounded" style={{ width: `${(valor(f) / max) * 100}%` }} /></span>
        <span className="tabular-nums">{pesos(valor(f))}</span>
      </li>
    ))}</ul>
  );
}
function Finanzas({ svc, tick }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { svc.dashboard().then(setD).catch(e => setError(errMsg(e))); }, [svc, tick]);
  if (error) return <div className="alert-error">{error}</div>;
  if (!d) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Kpi label="Cobros de hoy" valor={pesos(d.cobros_hoy)} sub={`${d.cobros_hoy_cantidad} cobro(s)`} />
        <Kpi label="Facturación anual" valor={pesos(d.facturacion_anual)} />
        <Kpi label="Saldo pendiente" valor={pesos(d.saldo_pendiente)} sub={`${d.ordenes_pendientes} orden(es) sin pagar`} />
        <Kpi label="Deuda total (cuentas)" valor={pesos(d.deuda_total)} />
        <Kpi label="Reservas (mes)" valor={pesos(d.reservas)} />
        <Kpi label="Cantina (mes)" valor={pesos(d.cantina)} />
        <Kpi label="Conversión QR" valor={`${d.conversion_qr}%`} sub="órdenes pagadas / generadas" />
        <Kpi label="Tiempo promedio de pago" valor={d.tiempo_promedio_pago_min != null ? `${d.tiempo_promedio_pago_min} min` : '—'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-2"><h3 className="font-semibold text-sm">Cobros por módulo (mes)</h3>{d.por_modulo.length ? <Barras filas={d.por_modulo} etiqueta={f => MODULO_PAY[f.modulo] || f.modulo} valor={f => f.total} /> : <p className="text-sm text-muted-foreground">Sin cobros en el período.</p>}</div>
        <div className="card space-y-2"><h3 className="font-semibold text-sm">Facturación mensual</h3>{d.facturacion_mensual.length ? <Barras filas={d.facturacion_mensual} etiqueta={f => f.mes} valor={f => f.total} /> : <p className="text-sm text-muted-foreground">Sin datos.</p>}</div>
        {d.por_escuela.length > 0 && <div className="card space-y-2"><h3 className="font-semibold text-sm">Cobros por escuela</h3><Barras filas={d.por_escuela} etiqueta={f => f.nombre} valor={f => f.total} /></div>}
        {d.por_torneo.length > 0 && <div className="card space-y-2"><h3 className="font-semibold text-sm">Cobros por torneo</h3><Barras filas={d.por_torneo} etiqueta={f => f.nombre} valor={f => f.total} /></div>}
        <div className="card space-y-2"><h3 className="font-semibold text-sm">Top jugadores con deuda</h3>{d.top_deudores.length ? <ul className="text-sm divide-y divide-border">{d.top_deudores.map(c => <li key={c.cliente_key} className="flex justify-between py-1.5"><span className="truncate">{c.nombre || c.cliente_key}</span><span className="tabular-nums text-red-400">{pesos(c.saldo)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Nadie debe nada.</p>}</div>
        <div className="card space-y-2"><h3 className="font-semibold text-sm">Top clientes (mes)</h3>{d.top_clientes.length ? <ul className="text-sm divide-y divide-border">{d.top_clientes.map(c => <li key={c.cliente_key} className="flex justify-between py-1.5"><span className="truncate">{c.nombre || c.cliente_key}</span><span className="tabular-nums">{pesos(c.total)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Sin datos.</p>}</div>
      </div>
    </div>
  );
}
