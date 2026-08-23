import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, DollarSign, ShoppingCart, User, CalendarDays, Clock, Plus, Minus,
  Trash2, Search, Users, CheckCircle, Circle, ArrowLeft, Loader2, Beer,
} from 'lucide-react';
import { agendaService } from '../../services/agendaService';

const DARK = {
  surface: { background: '#0d1220', border: '1px solid #1e2a3d' },
  row:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' },
};

const METODOS = [
  { v: 'efectivo',    l: 'Efectivo' },
  { v: 'mercadopago', l: 'MercadoPago' },
  { v: 'tarjeta',     l: 'Tarjeta' },
];

const money = n => `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-AR')}`;

export default function TurnoModal({ complexId, slot, onClose, onChanged, showToast }) {
  const bookingId = slot?.booking_id;
  const [view,     setView]     = useState('acciones');   // acciones | consumos | cobrar
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [detalle,  setDetalle]  = useState(null);         // { booking, consumos, totales }

  const cargar = useCallback(() => {
    if (!bookingId) return;
    setLoading(true);
    agendaService.getTurno(complexId, bookingId)
      .then(setDetalle).catch(() => setDetalle(null))
      .finally(() => setLoading(false));
  }, [complexId, bookingId]);
  useEffect(() => { cargar(); }, [cargar]);

  const b        = detalle?.booking;
  const consumos = detalle?.consumos || [];
  const totales  = detalle?.totales  || { cancha: 0, consumos: 0, total: 0 };
  const yaCobrado = !!b?.cobrado;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div className="relative z-10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[88vh] flex flex-col" style={DARK.surface}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white font-bold">
              {view === 'consumos' ? <ShoppingCart className="w-4 h-4 text-primary" />
                : view === 'cobrar' ? <DollarSign className="w-4 h-4 text-primary" />
                : <User className="w-4 h-4 text-primary" />}
              <span className="truncate">
                {view === 'consumos' ? 'Agregar consumos' : view === 'cobrar' ? 'Cobrar turno' : (b?.nombre_cliente || 'Turno')}
              </span>
            </div>
            {b && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />
                  {new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {b.hora_inicio}–{b.hora_fin}</span>
                {b.field?.nombre && <span className="text-primary/70">{b.field.nombre}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
          ) : !b ? (
            <p className="text-center text-sm text-muted-foreground py-10">No se pudo cargar el turno.</p>
          ) : view === 'acciones' ? (
            <AccionesView b={b} totales={totales} yaCobrado={yaCobrado}
              onConsumos={() => setView('consumos')} onCobrar={() => setView('cobrar')} />
          ) : view === 'consumos' ? (
            <ConsumosView complexId={complexId} bookingId={bookingId} consumos={consumos} totales={totales}
              yaCobrado={yaCobrado} saving={saving} setSaving={setSaving}
              onBack={() => setView('acciones')} onChangedLocal={() => { cargar(); onChanged?.(); }} showToast={showToast} />
          ) : (
            <CobrarView complexId={complexId} bookingId={bookingId} b={b} consumos={consumos} totales={totales}
              yaCobrado={yaCobrado} saving={saving} setSaving={setSaving}
              onBack={() => setView('acciones')}
              onDone={() => { onChanged?.(); onClose(); }} showToast={showToast} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vista: elegir acción ──────────────────────────────────────────────────────
function AccionesView({ b, totales, yaCobrado, onConsumos, onCobrar }) {
  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="rounded-xl p-4" style={DARK.row}>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Costo de cancha</span><span className="text-white font-semibold">{money(totales.cancha)}</span></div>
        <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Consumos</span><span className="text-white font-semibold">{money(totales.consumos)}</span></div>
        <div className="flex justify-between text-base mt-2 pt-2 border-t border-border">
          <span className="text-white font-bold">Total</span><span className="text-green-400 font-black">{money(totales.total)}</span>
        </div>
      </div>

      {yaCobrado && (
        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
          <CheckCircle className="w-4 h-4 shrink-0" />
          Turno cobrado{b.cobro_detalle?.jugadores ? ` — ${b.cobro_detalle.jugadores} jugador${b.cobro_detalle.jugadores !== 1 ? 'es' : ''} · ${money(b.cobro_detalle.por_jugador)} c/u` : ''}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <button onClick={onCobrar} disabled={yaCobrado}
          className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: yaCobrado ? '#334155' : '#16a34a' }}>
          <DollarSign className="w-5 h-5" /> Cobrar turno
        </button>
        <button onClick={onConsumos} disabled={yaCobrado}
          className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }}>
          <ShoppingCart className="w-5 h-5" /> Agregar consumos
        </button>
      </div>
    </div>
  );
}

// ── Vista: consumos (módulo de ventas del turno) ──────────────────────────────
function ConsumosView({ complexId, bookingId, consumos, totales, yaCobrado, saving, setSaving, onBack, onChangedLocal, showToast }) {
  const [productos, setProductos] = useState([]);
  const [q,         setQ]         = useState('');
  const [cants,     setCants]     = useState({});   // { productoId: cantidad }

  useEffect(() => {
    agendaService.productosTurno(complexId).then(setProductos).catch(() => setProductos([]));
  }, [complexId]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter(p => !t || p.nombre.toLowerCase().includes(t));
  }, [productos, q]);

  const getCant = id => cants[id] ?? 1;
  const setCant = (id, v) => setCants(c => ({ ...c, [id]: Math.max(1, v) }));

  const agregar = async (producto) => {
    const cantidad = getCant(producto.id);
    setSaving(true);
    try {
      await agendaService.agregarConsumos(complexId, bookingId, [{ producto_id: producto.id, cantidad }]);
      setCants(c => ({ ...c, [producto.id]: 1 }));
      onChangedLocal();
      // refrescar stock local
      agendaService.productosTurno(complexId).then(setProductos).catch(() => {});
    } catch (err) {
      showToast?.('error', err?.response?.data?.message || 'No se pudo agregar el consumo.');
    } finally { setSaving(false); }
  };

  const quitar = async (consumoId) => {
    setSaving(true);
    try {
      await agendaService.quitarConsumo(complexId, bookingId, consumoId);
      onChangedLocal();
      agendaService.productosTurno(complexId).then(setProductos).catch(() => {});
    } catch (err) {
      showToast?.('error', err?.response?.data?.message || 'No se pudo quitar el consumo.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Volver
      </button>

      {/* Consumos ya cargados */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Consumos del turno</h4>
        {consumos.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">Todavía no hay consumos.</p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={DARK.row}>
            <div className="grid grid-cols-[3rem_1fr_5rem_5rem_2rem] gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/35 border-b border-border">
              <span className="text-center">Cant.</span><span>Producto</span><span className="text-right">Precio</span><span className="text-right">Total</span><span />
            </div>
            {consumos.map(c => (
              <div key={c.id} className="grid grid-cols-[3rem_1fr_5rem_5rem_2rem] gap-2 px-3 py-2 text-sm items-center border-b border-border/50 last:border-0">
                <span className="text-center tabular-nums text-white/80">{Number(c.cantidad)}</span>
                <span className="text-white truncate">{c.nombre_producto}</span>
                <span className="text-right tabular-nums text-muted-foreground">{money(c.precio_unitario)}</span>
                <span className="text-right tabular-nums text-green-400 font-semibold">{money(c.subtotal)}</span>
                {!yaCobrado && (
                  <button onClick={() => quitar(c.id)} disabled={saving}
                    className="text-red-400/70 hover:text-red-400 transition-colors justify-self-center" title="Quitar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 text-sm font-bold bg-white/[0.02]">
              <span className="text-white">Total consumos</span><span className="text-green-400">{money(totales.consumos)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Selector de productos */}
      {!yaCobrado && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Agregar producto</h4>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input className="input pl-9" placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {filtrados.length === 0 && <p className="text-sm text-muted-foreground italic py-2">Sin productos.</p>}
            {filtrados.map(p => {
              const sinStock = !p.disponible;
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={DARK.row}>
                  <Beer className="w-4 h-4 text-amber-400/70 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{p.nombre}</div>
                    <div className="text-xs text-muted-foreground">{money(p.precio_venta)} · stock {Number(p.stock)}</div>
                  </div>
                  {sinStock ? (
                    <span className="text-xs text-red-400/80 px-2">Sin stock</span>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCant(p.id, getCant(p.id) - 1)} className="p-1 rounded bg-white/5 text-white/70 hover:text-white"><Minus className="w-3 h-3" /></button>
                        <span className="w-6 text-center text-sm tabular-nums text-white">{getCant(p.id)}</span>
                        <button onClick={() => setCant(p.id, getCant(p.id) + 1)} className="p-1 rounded bg-white/5 text-white/70 hover:text-white"><Plus className="w-3 h-3" /></button>
                      </div>
                      <button onClick={() => agregar(p)} disabled={saving}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <Plus className="w-3.5 h-3.5" /> Agregar
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vista: cobrar (división entre jugadores + método de pago por jugador) ──────
function CobrarView({ complexId, bookingId, b, consumos, totales, yaCobrado, saving, setSaving, onBack, onDone, showToast }) {
  const [jugadores, setJugadores] = useState(1);
  // Cada jugador: { pagado, metodo }. metodo se asigna al tildar el pago.
  const [pagos,     setPagos]     = useState([{ pagado: false, metodo: '' }]);
  const [metodo,    setMetodo]    = useState(b?.metodo_pago || 'efectivo');   // método por defecto del dropdown

  // Ajusta la cantidad de slots de pago al cambiar la cantidad de jugadores.
  useEffect(() => {
    setPagos(prev => Array.from({ length: jugadores }, (_, i) => prev[i] ?? { pagado: false, metodo: '' }));
  }, [jugadores]);

  const porJugador = jugadores > 0 ? totales.total / jugadores : totales.total;
  const pagados    = pagos.filter(p => p.pagado).length;
  // "Pagado": suma en tiempo real de los jugadores tildados.
  const pagado     = Math.round(pagados * porJugador * 100) / 100;
  const pendiente  = Math.round((totales.total - pagado) * 100) / 100;

  const setJug = v => setJugadores(Math.max(1, Math.min(50, parseInt(v) || 1)));

  // Al tildar → toma el método del dropdown; al destildar → conserva el método.
  const togglePago = i => setPagos(p => p.map((x, idx) =>
    idx === i ? { pagado: !x.pagado, metodo: !x.pagado ? (x.metodo || metodo) : x.metodo } : x));
  const setMetodoJugador = (i, m) => setPagos(p => p.map((x, idx) => idx === i ? { ...x, metodo: m } : x));

  const cobrar = async () => {
    if (pendiente > 0 && !window.confirm(
      `Quedan ${money(pendiente)} sin marcar como pagados (${pagados}/${jugadores} jugadores). ¿Confirmar el cobro igualmente?`)) return;
    setSaving(true);
    try {
      const payload = {
        jugadores,
        metodo_pago: metodo,
        pagos: pagos.map(p => ({ pagado: p.pagado, metodo: p.metodo || metodo })),
      };
      const res = await agendaService.cobrarTurno(complexId, bookingId, payload);
      showToast?.('success', res?.message || 'Turno cobrado.');
      onDone();
    } catch (err) {
      showToast?.('error', err?.response?.data?.message || 'No se pudo cobrar el turno.');
    } finally { setSaving(false); }
  };

  if (yaCobrado) {
    const cd = b.cobro_detalle || {};
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Volver</button>
        <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-white font-bold">Este turno ya fue cobrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Total {money(cd.total ?? totales.total)}{cd.pagado != null && <> · Pagado {money(cd.pagado)}</>}
          </p>
        </div>
        {Array.isArray(cd.pagos) && cd.pagos.length > 0 && (
          <div className="rounded-lg overflow-hidden text-sm" style={DARK.row}>
            {cd.pagos.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-border/40 last:border-0">
                <span className="text-white/80">Jugador {i + 1}</span>
                {p.pagado
                  ? <span className="flex items-center gap-1.5 text-green-400"><CheckCircle className="w-3.5 h-3.5" /> {METODOS.find(m => m.v === p.metodo)?.l || p.metodo}</span>
                  : <span className="text-white/40">Sin pagar</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Volver</button>

      {/* Desglose */}
      <div className="rounded-xl p-4" style={DARK.row}>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Costo de cancha</span><span className="text-white font-semibold">{money(totales.cancha)}</span></div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-muted-foreground">Consumos {consumos.length > 0 && <span className="opacity-60">({consumos.length})</span>}</span>
          <span className="text-white font-semibold">{money(totales.consumos)}</span>
        </div>
        <div className="flex justify-between text-lg mt-2 pt-2 border-t border-border">
          <span className="text-white font-bold">Total</span><span className="text-green-400 font-black">{money(totales.total)}</span>
        </div>
        {/* Pagado (dinámico) */}
        <div className="flex justify-between text-sm mt-1.5">
          <span className="text-muted-foreground">Pagado <span className="opacity-60">({pagados}/{jugadores})</span></span>
          <span className={`font-bold ${pendiente > 0 ? 'text-amber-400' : 'text-green-400'}`}>{money(pagado)}</span>
        </div>
      </div>

      {/* Método de pago por defecto */}
      <div>
        <label className="label">Método de pago</label>
        <select className="input" value={metodo} onChange={e => setMetodo(e.target.value)}>
          {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">Se asigna a cada jugador al marcar su pago (podés cambiarlo en cada uno).</p>
      </div>

      {/* Jugadores */}
      <div>
        <label className="label flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Cantidad de jugadores</label>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setJug(jugadores - 1)} className="p-2 rounded-lg bg-white/5 text-white/70 hover:text-white"><Minus className="w-4 h-4" /></button>
            <input type="number" min="1" max="50" value={jugadores} onChange={e => setJug(e.target.value)}
              className="input w-16 text-center" />
            <button onClick={() => setJug(jugadores + 1)} className="p-2 rounded-lg bg-white/5 text-white/70 hover:text-white"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="text-sm text-muted-foreground">
            = <span className="text-white font-bold">{money(porJugador)}</span> por jugador
          </div>
        </div>
      </div>

      {/* Slots de pago por jugador (con método individual) */}
      <div>
        <label className="label mb-2">Pago por jugador</label>
        <div className="space-y-1.5">
          {pagos.map((p, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={p.pagado
                ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={() => togglePago(i)} className="flex items-center gap-2 shrink-0"
                style={{ color: p.pagado ? '#4ade80' : '#94a3b8' }}>
                {p.pagado ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                <span className="text-sm font-medium">Jug. {i + 1}</span>
              </button>
              <span className="text-xs text-muted-foreground ml-1 tabular-nums">{money(porJugador)}</span>
              <div className="flex-1" />
              {p.pagado && (
                <select value={p.metodo || metodo} onChange={e => setMetodoJugador(i, e.target.value)}
                  className="text-xs rounded-lg px-2 py-1.5 bg-white/5 text-white border border-white/10 focus:outline-none focus:border-primary">
                  {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>

      <button onClick={cobrar} disabled={saving}
        className="btn-primary w-full py-3 flex items-center justify-center gap-2 font-bold">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
        Confirmar cobro · {money(totales.total)}
      </button>
    </div>
  );
}
