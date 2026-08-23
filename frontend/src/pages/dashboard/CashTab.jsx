import { useState, useEffect } from 'react';
import { posService } from '../../services/posService';
import { DollarSign, Plus, Lock, Unlock, TrendingUp, TrendingDown, Filter } from 'lucide-react';
import { METODOS_PAGO, metodoLabel, metodoChipStyle } from '../../utils/metodoPago';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Chip de método de pago (legible sobre las tarjetas oscuras).
function MetodoChip({ metodo }) {
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={metodoChipStyle(metodo)}>
      {metodoLabel(metodo)}
    </span>
  );
}

export default function CashTab({ complexId }) {
  const [caja, setCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTxForm, setShowTxForm] = useState(false);
  const [tx, setTx] = useState({ tipo: 'ingreso', concepto: '', monto: '', metodo_pago: 'efectivo' });
  const [submitting, setSubmitting] = useState(false);
  const [filtroMetodo, setFiltroMetodo] = useState('');   // '' = todos

  const load = () => {
    posService.getCurrent(complexId).then(setCaja).catch(() => setCaja(null)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [complexId]);

  const open = async () => {
    const monto = prompt('Monto inicial de caja:') || '0';
    await posService.open(complexId, { monto_inicial: parseFloat(monto) });
    load();
  };

  const close = async () => {
    if (!confirm('¿Cerrar la caja del día?')) return;
    await posService.close(complexId);
    load();
  };

  const addTx = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await posService.addTransaction(complexId, { ...tx, monto: parseFloat(tx.monto) });
      setTx({ tipo: 'ingreso', concepto: '', monto: '', metodo_pago: 'efectivo' });
      setShowTxForm(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const allTx = caja?.transactions || [];
  // El filtro por método afecta el listado y los totales → "reporte por método".
  const visibles = filtroMetodo ? allTx.filter(t => t.metodo_pago === filtroMetodo) : allTx;
  const ingresos = visibles.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + parseFloat(t.monto), 0);
  const egresos = visibles.filter(t => t.tipo === 'egreso').reduce((s, t) => s + parseFloat(t.monto), 0);

  // Desglose por método (sobre todos los movimientos de la caja abierta).
  const porMetodo = METODOS_PAGO.map(m => {
    const ing = allTx.filter(t => t.tipo === 'ingreso' && t.metodo_pago === m.v).reduce((s, t) => s + parseFloat(t.monto), 0);
    const egr = allTx.filter(t => t.tipo === 'egreso'  && t.metodo_pago === m.v).reduce((s, t) => s + parseFloat(t.monto), 0);
    return { ...m, ing, egr };
  }).filter(m => m.ing > 0 || m.egr > 0);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Gestión de Caja</h2>
        {!caja ? (
          <button onClick={open} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Unlock className="w-4 h-4" /> Abrir caja
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowTxForm(s => !s)} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
              <Plus className="w-4 h-4" /> Transacción
            </button>
            <button onClick={close} className="btn-outline flex items-center gap-2 text-sm py-2 px-4 text-red-500 border-red-300 hover:bg-red-50">
              <Lock className="w-4 h-4" /> Cerrar caja
            </button>
          </div>
        )}
      </div>

      {!caja ? (
        <div className="card text-center py-16 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay caja abierta. Abrí una para registrar operaciones.</p>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Ingresos', value: ingresos, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Egresos', value: egresos, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
              { label: 'Balance', value: ingresos - egresos, icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`card ${bg} border-0`}>
                <Icon className={`w-5 h-5 ${color} mb-1`} />
                <div className={`text-2xl font-bold ${color}`}>${value.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {/* Form transacción */}
          {showTxForm && (
            <form onSubmit={addTx} className="card mb-4 space-y-3">
              <h3 className="font-semibold text-sm">Nueva transacción</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Tipo</label>
                  <select className="input text-sm" value={tx.tipo} onChange={e => setTx(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Método de pago</label>
                  <select className="input text-sm" value={tx.metodo_pago} onChange={e => setTx(f => ({ ...f, metodo_pago: e.target.value }))}>
                    {METODOS_PAGO.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label text-xs">Concepto</label><input className="input text-sm" required value={tx.concepto} onChange={e => setTx(f => ({ ...f, concepto: e.target.value }))} /></div>
              <div><label className="label text-xs">Monto ($)</label><input type="number" step="0.01" className="input text-sm" required value={tx.monto} onChange={e => setTx(f => ({ ...f, monto: e.target.value }))} /></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowTxForm(false)} className="btn-outline flex-1 text-sm py-2">Cancelar</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 text-sm py-2">{submitting ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          )}

          {/* Desglose por método de pago (reporte del día) */}
          {porMetodo.length > 0 && (
            <div className="card mb-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Totales por método de pago</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {porMetodo.map(m => (
                  <div key={m.v} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <MetodoChip metodo={m.v} />
                    <div className="mt-1.5 text-sm font-bold text-green-400">{money(m.ing)}</div>
                    {m.egr > 0 && <div className="text-xs text-red-400">-{money(m.egr)}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtro por método */}
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select className="input text-sm w-auto" value={filtroMetodo} onChange={e => setFiltroMetodo(e.target.value)}>
              <option value="">Todos los métodos</option>
              {METODOS_PAGO.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
            {filtroMetodo && (
              <span className="text-xs text-muted-foreground">
                {visibles.length} mov. · ingresos {money(ingresos)} · egresos {money(egresos)}
              </span>
            )}
          </div>

          {/* Transacciones */}
          <div className="space-y-2">
            {visibles.length === 0 ? (
              <div className="card text-center py-8 text-muted-foreground text-sm">
                {filtroMetodo ? 'Sin movimientos con este método.' : 'Sin movimientos aún.'}
              </div>
            ) : visibles.map(t => (
              <div key={t.id} className="card py-3 flex items-center gap-3">
                <div className={t.tipo === 'ingreso' ? 'text-green-500' : 'text-red-500'}>
                  {t.tipo === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.concepto}</div>
                  <div className="text-xs text-muted-foreground">{new Date(t.fecha).toLocaleTimeString('es-AR')}</div>
                </div>
                <MetodoChip metodo={t.metodo_pago} />
                <span className={`font-semibold whitespace-nowrap ${t.tipo === 'ingreso' ? 'text-green-600' : 'text-red-500'}`}>
                  {t.tipo === 'ingreso' ? '+' : '-'}{money(t.monto)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
