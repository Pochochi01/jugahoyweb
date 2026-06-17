import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, RefreshCw,
  CheckCircle, XCircle, Clock, AlertCircle, Phone, User,
} from 'lucide-react';
import { agendaService }  from '../../services/agendaService';
import { settingsService } from '../../services/settingsService';
import TimeSlotList from '../../components/agenda/TimeSlotList';
import BookingModal from '../../components/agenda/BookingModal';

function today() { return new Date().toISOString().split('T')[0]; }
function formatDateDisplay(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function shiftDate(d, n) {
  const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n);
  return dt.toISOString().split('T')[0];
}

// ── Estilos inline dark reutilizables ─────────────────────────────────────────
const DARK = {
  surface:  { background: '#0d1220', border: '1px solid #1e2a3d' },
  amber:    { background: 'rgba(245,158,11,0.07)',  border: '1px solid rgba(245,158,11,0.22)' },
  amberCard:{ background: 'rgba(245,158,11,0.04)',  border: '1px solid rgba(245,158,11,0.16)' },
};

// ── Panel de solicitudes pendientes ──────────────────────────────────────────
function PendingPanel({ complexId, onUpdated }) {
  const [pendientes,  setPendientes]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [processing,  setProcessing]  = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [motivo,      setMotivo]      = useState('');

  const load = useCallback(() => {
    agendaService.getPendientes(complexId)
      .then(setPendientes).catch(() => setPendientes([]))
      .finally(() => setLoading(false));
  }, [complexId]);
  useEffect(() => { load(); }, [load]);

  const confirmar = async (b) => {
    setProcessing(b.id);
    try {
      await agendaService.confirmar(complexId, b.id);
      setPendientes(ps => ps.filter(p => p.id !== b.id));
      onUpdated?.();
    } finally { setProcessing(null); }
  };

  const rechazar = async () => {
    if (!rejectModal) return;
    setProcessing(rejectModal.id);
    try {
      await agendaService.rechazar(complexId, rejectModal.id, motivo);
      setPendientes(ps => ps.filter(p => p.id !== rejectModal.id));
      setRejectModal(null); setMotivo('');
      onUpdated?.();
    } finally { setProcessing(null); }
  };

  if (loading || pendientes.length === 0) return null;

  return (
    <div className="rounded-xl p-4 mb-2" style={DARK.amber}>
      {/* Título */}
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-300">
          {pendientes.length} solicitud{pendientes.length !== 1 ? 'es' : ''} pendiente{pendientes.length !== 1 ? 's' : ''} de confirmación
        </span>
      </div>

      <div className="space-y-2">
        {pendientes.map(b => (
          <div key={b.id} className="flex items-center gap-3 flex-wrap rounded-lg px-4 py-3" style={DARK.amberCard}>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                <User className="w-3.5 h-3.5 text-amber-500" />
                {b.nombre_cliente}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-white/40 flex-wrap">
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {b.hora_inicio} → {b.hora_fin} ({b.duracion} min)
                </span>
                {b.field && <span className="text-amber-400/70">{b.field.nombre}</span>}
                {b.telefono_cliente && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {b.telefono_cliente}</span>
                )}
                {b.monto > 0 && <span className="text-green-400 font-semibold">${parseFloat(b.monto).toFixed(0)}</span>}
              </div>
            </div>
            {/* Acciones */}
            <div className="flex gap-2 shrink-0">
              <button disabled={!!processing} onClick={() => confirmar(b)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.30)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}>
                {processing === b.id ? '...' : <><CheckCircle className="w-3.5 h-3.5" /> Confirmar</>}
              </button>
              <button disabled={!!processing} onClick={() => { setRejectModal(b); setMotivo(''); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}>
                <XCircle className="w-3.5 h-3.5" /> Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de rechazo */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setRejectModal(null)} />
          <div className="relative z-10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={DARK.surface}>
            <h3 className="font-bold text-white mb-1">Rechazar solicitud</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {rejectModal.nombre_cliente} — {rejectModal.fecha} {rejectModal.hora_inicio}
            </p>
            <label className="label text-sm">Motivo (opcional)</label>
            <textarea className="input h-20 resize-none mb-4 text-sm"
              placeholder="Ej: cancha en mantenimiento, horario ocupado..."
              value={motivo} onChange={e => setMotivo(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="btn-outline flex-1 text-sm">Cancelar</button>
              <button onClick={rechazar} disabled={!!processing}
                className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-colors"
                style={{ background: 'rgba(239,68,68,0.85)', color: '#fff' }}>
                {processing ? 'Rechazando...' : 'Rechazar turno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────────────
export default function AgendaTab({ complexId }) {
  const [fields,        setFields]        = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [date,          setDate]          = useState(today());
  const [slots,         setSlots]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [selectedSlot,  setSelectedSlot]  = useState(null);
  const [toast,         setToast]         = useState(null);

  useEffect(() => {
    settingsService.getFields(complexId).then(data => {
      const activas = data.filter(f => f.activa !== false);
      setFields(activas);
      if (activas.length > 0) setSelectedField(activas[0]);
    }).catch(() => {});
  }, [complexId]);

  const loadSlots = useCallback(() => {
    if (!selectedField) return;
    setLoading(true);
    agendaService.getSlots(complexId, selectedField.id, date)
      .then(data => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [complexId, selectedField, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const handleConfirmBooking = async (formData) => {
    await agendaService.reservar(complexId, formData);
    setSelectedSlot(null);
    showToast('success', 'Reserva creada y confirmada.');
    loadSlots();
  };

  const handleCancel = async (bookingId) => {
    if (!window.confirm('¿Cancelar esta reserva y liberar todos los horarios?')) return;
    try {
      await agendaService.cancelar(complexId, bookingId);
      showToast('success', 'Reserva cancelada.');
      loadSlots();
    } catch { showToast('error', 'No se pudo cancelar.'); }
  };

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const libres   = slots.filter(s => s.estado === 'libre' && !s.past).length;
  const ocupados = slots.filter(s => s.isFirstOfBooking).length;
  const pasados  = slots.filter(s => s.past && s.estado !== 'ocupado').length;

  return (
    <div className="space-y-4">

      {/* ── Pendientes ── */}
      <PendingPanel complexId={complexId} onUpdated={loadSlots} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Agenda</h2>
        <button onClick={loadSlots}
          className="p-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)' }}
          title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
        </button>
      </div>

      {/* ── Navegación de fecha ── */}
      <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={DARK.surface}>
        <button onClick={() => setDate(d => shiftDate(d, -1))}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <CalendarDays className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold capitalize truncate text-white">{formatDateDisplay(date)}</span>
        </div>

        <button onClick={() => setDate(d => shiftDate(d, 1))}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="h-5 w-px bg-border" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="text-xs text-muted-foreground bg-transparent border-none outline-none cursor-pointer" />
        {date !== today() && (
          <button onClick={() => setDate(today())} className="text-xs text-primary font-medium hover:text-primary/80 transition-colors">
            Hoy
          </button>
        )}
      </div>

      {/* ── Tabs de canchas ── */}
      {fields.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {fields.map(f => (
            <button key={f.id} onClick={() => setSelectedField(f)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style={selectedField?.id === f.id
                ? { background: '#22c55e', color: '#fff', border: '1px solid #22c55e' }
                : { background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid #1e2a3d' }
              }
              onMouseEnter={e => { if (selectedField?.id !== f.id) e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { if (selectedField?.id !== f.id) e.currentTarget.style.color = '#94a3b8'; }}
            >
              {f.nombre}
              <span className="ml-1.5 text-xs opacity-60 capitalize">({f.deporte})</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl py-8 text-center text-sm text-muted-foreground" style={DARK.surface}>
          Sin canchas activas. Agregá una en <strong className="text-white/60">Configuración</strong>.
        </div>
      )}

      {/* ── Stats ── */}
      {selectedField && !loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: libres,   label: 'Libres',   color: '#4ade80', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.20)' },
            { value: ocupados, label: 'Reservas', color: '#f87171', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.20)' },
            { value: pasados,  label: 'Pasados',  color: '#94a3b8', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
          ].map(({ value, label, color, bg, border }) => (
            <div key={label} className="rounded-xl py-3 text-center"
              style={{ background: bg, border: `1px solid ${border}` }}>
              <div className="text-2xl font-black tabular-nums" style={{ color }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: color + 'aa' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lista de slots ── */}
      {selectedField && (
        <TimeSlotList
          slots={slots}
          loading={loading}
          onSelect={setSelectedSlot}
          onCancel={handleCancel}
        />
      )}

      {/* ── Modal de reserva (admin crea directamente) ── */}
      {selectedSlot && (
        <BookingModal
          slot={selectedSlot}
          field={selectedField}
          allSlots={slots}
          onConfirm={handleConfirmBooking}
          onClose={() => setSelectedSlot(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl shadow-xl text-sm font-medium text-white"
          style={{ background: toast.type === 'success' ? '#16a34a' : '#dc2626', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
