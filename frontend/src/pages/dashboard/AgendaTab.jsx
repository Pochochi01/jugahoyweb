import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, RefreshCw,
  CheckCircle, XCircle, Clock, AlertCircle, Phone, User, Repeat, Trash2,
} from 'lucide-react';
import { agendaService }  from '../../services/agendaService';
import { settingsService } from '../../services/settingsService';
import { useAuth } from '../../context/AuthContext';
import TimeSlotList from '../../components/agenda/TimeSlotList';
import BookingModal from '../../components/agenda/BookingModal';
import LinkPagoModal from '../../components/agenda/LinkPagoModal';
import TurnoModal from '../../components/agenda/TurnoModal';
import ConfirmacionAsistencia from '../../components/ConfirmacionAsistencia';
import { hoyAR, sumarDias } from '../../utils/fecha';

// Hoy en Argentina (no salta al día siguiente a las 21 hs, ver utils/fecha)
function today() { return hoyAR(); }
/** "lunes 5 de octubre de 2026" → "Lunes 5 de octubre" (+ año si no es el actual). */
function formatDateDisplay(d) {
  const dt = new Date(d + 'T12:00:00');
  const s = dt.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(dt.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  }).replace(',', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shiftDate(d, n) { return sumarDias(d, n); }

// Advertencia de cancelación según cuánto falte para el inicio del turno.
function avisoCancelacion(fecha, hora) {
  const inicio = new Date(`${fecha}T${hora}:00`);
  const hs = (inicio - new Date()) / 3_600_000;
  return hs < 2
    ? 'Este turno solo puede cancelarse dentro de los primeros 15 min después de reservarlo.'
    : 'Recordá: los turnos se cancelan con al menos 2 h de anticipación.';
}

// ── Estilos inline dark reutilizables ─────────────────────────────────────────
const DARK = {
  surface:  { background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))' },
  amber:    { background: 'rgb(var(--warning) / 0.07)',  border: '1px solid rgb(var(--warning) / 0.22)' },
  amberCard:{ background: 'rgb(var(--warning) / 0.04)',  border: '1px solid rgb(var(--warning) / 0.16)' },
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
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
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
                style={{ background: 'rgb(var(--success) / 0.15)', color: 'rgb(var(--success))', border: '1px solid rgb(var(--success) / 0.30)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgb(var(--success) / 0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgb(var(--success) / 0.15)'}>
                {processing === b.id ? '...' : <><CheckCircle className="w-3.5 h-3.5" /> Confirmar</>}
              </button>
              <button disabled={!!processing} onClick={() => { setRejectModal(b); setMotivo(''); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150"
                style={{ background: 'rgb(var(--danger) / 0.12)', color: 'rgb(var(--danger))', border: '1px solid rgb(var(--danger) / 0.25)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgb(var(--danger) / 0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgb(var(--danger) / 0.12)'}>
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
            <h3 className="font-bold text-foreground mb-1">Rechazar solicitud</h3>
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
                style={{ background: 'rgb(var(--danger) / 0.85)', color: '#fff' }}>
                {processing ? 'Rechazando...' : 'Rechazar turno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ── Modal de gestión de turnos fijos ─────────────────────────────────────────
function FijosModal({ complexId, onClose, onChanged }) {
  const [fijos,      setFijos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    agendaService.listFijos(complexId)
      .then(data => setFijos(Array.isArray(data) ? data : []))
      .catch(() => setFijos([]))
      .finally(() => setLoading(false));
  }, [complexId]);
  useEffect(() => { load(); }, [load]);

  const baja = async (f) => {
    if (!window.confirm(`¿Dar de baja el turno fijo de ${f.nombre_cliente} (${DIAS[f.dia_semana]} ${f.hora_inicio})?\nSe eliminarán los turnos futuros aún no jugados.`)) return;
    setProcessing(f.id);
    try {
      await agendaService.bajaFijo(complexId, f.id);
      setFijos(fs => fs.filter(x => x.id !== f.id));
      onChanged?.();
    } catch {
      // silencioso: el listado se recarga
      load();
    } finally { setProcessing(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div className="relative z-10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" style={DARK.surface}>
        <div className="flex items-center gap-2 mb-4">
          <Repeat className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-foreground">Turnos fijos</h3>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
        ) : fijos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No hay turnos fijos activos. Podés crear uno tildando <strong className="text-foreground/70">“Turno fijo”</strong> al reservar un horario.
          </p>
        ) : (
          <div className="space-y-2">
            {fijos.map(f => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg px-4 py-3" style={DARK.amberCard}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                    <User className="w-3.5 h-3.5 text-amber-500" />
                    {f.nombre_cliente}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Repeat className="w-3 h-3" /> {DIAS[f.dia_semana]}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {f.hora_inicio} → {f.hora_fin}
                    </span>
                    {f.field && <span className="text-amber-400/70">{f.field.nombre}</span>}
                    {f.telefono_cliente && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {f.telefono_cliente}</span>
                    )}
                    {f.monto > 0 && <span className="text-green-400 font-semibold">${parseFloat(f.monto).toFixed(0)}</span>}
                  </div>
                </div>
                <button disabled={!!processing} onClick={() => baja(f)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 shrink-0"
                  style={{ background: 'rgb(var(--danger) / 0.12)', color: 'rgb(var(--danger))', border: '1px solid rgb(var(--danger) / 0.25)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgb(var(--danger) / 0.22)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgb(var(--danger) / 0.12)'}>
                  {processing === f.id ? '...' : <><Trash2 className="w-3.5 h-3.5" /> Dar de baja</>}
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="btn-outline w-full text-sm mt-5">Cerrar</button>
      </div>
    </div>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────────────
export default function AgendaTab({ complexId }) {
  const { hasPermission, isComplexAdmin } = useAuth();
  // Admins siempre pueden; los colaboradores necesitan el permiso 'cancelar_turnos'.
  const puedeCancelar = hasPermission(complexId, 'cancelar_turnos');
  // Corregir asistencia: SOLO administradores (no colaboradores).
  const esAdmin = isComplexAdmin;
  const [fields,        setFields]        = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [date,          setDate]          = useState(today());
  const [slots,         setSlots]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [selectedSlot,  setSelectedSlot]  = useState(null);
  const [linkPago,      setLinkPago]      = useState(null);   // { pago, booking } tras reservar con seña/total
  const [toast,         setToast]         = useState(null);
  const [conteos,       setConteos]       = useState({});   // { fieldId: cantidad de turnos del día }
  const [showFijos,     setShowFijos]     = useState(false); // modal de gestión de turnos fijos
  const [manageSlot,    setManageSlot]    = useState(null);  // turno abierto (cobrar / consumos)
  const [cancelFijo,    setCancelFijo]    = useState(null);  // { bookingId, recurringId, nombre }

  useEffect(() => {
    settingsService.getFields(complexId).then(data => {
      const activas = data.filter(f => f.activa !== false);
      setFields(activas);
      if (activas.length > 0) setSelectedField(activas[0]);
    }).catch(() => {});
  }, [complexId]);

  // Contador de turnos del día por cancha (badge en cada tab)
  const loadConteos = useCallback(() => {
    agendaService.conteoDia(complexId, date).then(setConteos).catch(() => setConteos({}));
  }, [complexId, date]);
  useEffect(() => { loadConteos(); }, [loadConteos]);

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
    if (formData.fijo) {
      const res = await agendaService.crearFijo(complexId, formData);
      setSelectedSlot(null);
      showToast('success', res?.message || 'Turno fijo creado.');
      loadSlots(); loadConteos();
      return;
    }
    const res = await agendaService.reservar(complexId, formData);
    setSelectedSlot(null);
    if (res?.pago) {
      // Seña / total con MercadoPago → link para mandarle al cliente
      setLinkPago({ pago: res.pago, booking: res.booking });
      showToast('success', 'Turno reservado: enviale el link de pago al cliente.');
    } else if (res?.pago_error) {
      showToast('error', `Turno reservado, pero no se pudo generar el link de MercadoPago: ${res.pago_error}`);
    } else {
      showToast('success', formData.tipo_pago === 'complejo' ? 'Reserva creada: paga en el complejo.' : 'Reserva creada y confirmada.');
    }
    loadSlots(); loadConteos();
  };

  // Cancela una reserva puntual (un solo turno).
  const doCancel = async (bookingId) => {
    try {
      const r = await agendaService.cancelar(complexId, bookingId);
      showToast('success', r?.message || 'Turno cancelado.');
      loadSlots(); loadConteos();
    } catch (err) {
      // Muestra el motivo del backend (ej. regla de las 2 h / 15 min)
      showToast('error', err?.response?.data?.message || 'No se pudo cancelar.');
    }
  };

  const handleCancel = async (bookingId) => {
    const booking = slots.find(s => s.booking_id === bookingId)?.booking;
    // Turno fijo → preguntar: solo este día o todo el turno fijo.
    if (booking?.recurring_id) {
      setCancelFijo({ bookingId, recurringId: booking.recurring_id, nombre: booking.nombre_cliente });
      return;
    }
    if (!window.confirm('¿Cancelar este turno y liberar los horarios? Se le avisa al cliente por WhatsApp.')) return;
    doCancel(bookingId);
  };

  // Da de baja todo el turno fijo (elimina las ocurrencias futuras).
  const handleBajaFijoCompleto = async () => {
    if (!cancelFijo) return;
    try {
      const res = await agendaService.bajaFijo(complexId, cancelFijo.recurringId);
      showToast('success', res?.message || 'Turno fijo dado de baja.');
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'No se pudo dar de baja el turno fijo.');
    } finally {
      setCancelFijo(null);
      loadSlots(); loadConteos();
    }
  };

  const handleConfirm = async (bookingId) => {
    try {
      await agendaService.confirmar(complexId, bookingId);
      const slot = slots.find(s => s.booking_id === bookingId && s.isFirstOfBooking);
      const hora = slot?.booking?.hora_inicio || slot?.hora;
      const aviso = hora ? ` ${avisoCancelacion(date, hora)}` : '';
      showToast('success', `Turno confirmado.${aviso}`);
      loadSlots();
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'No se pudo confirmar.');
    }
  };

  const handleNoShow = async (bookingId) => {
    if (!window.confirm('¿Marcar este turno como "No asistió"? (el cliente no se presentó)')) return;
    try {
      await agendaService.noAsistido(complexId, bookingId);
      showToast('success', 'Turno marcado como no asistido.');
      loadSlots();
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'No se pudo marcar.');
    }
  };

  const handleCorrectNoShow = async (bookingId) => {
    if (!window.confirm('¿Volver este turno a "Asistido"?')) return;
    try {
      await agendaService.asistio(complexId, bookingId);
      showToast('success', 'Turno marcado como asistido.');
      loadSlots();
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'No se pudo corregir.');
    }
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

      {/* ── Confirmaciones de asistencia por WhatsApp (cancelados sin confirmar) ── */}
      <ConfirmacionAsistencia complexId={complexId} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="sr-only">Agenda del día</h2>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setShowFijos(true)} className="btn-outline btn-sm" title="Gestionar turnos fijos">
            <Repeat className="w-4 h-4" aria-hidden="true" /> Turnos fijos
          </button>
          <button onClick={loadSlots} className="btn-icon" aria-label="Actualizar agenda" title="Actualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Navegación de fecha ── */}
      <div className="flex items-center gap-1 sm:gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        <button onClick={() => setDate(d => shiftDate(d, -1))} className="btn-icon shrink-0" aria-label="Día anterior">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <label className="relative flex-1 min-w-0 flex items-center justify-center gap-2 rounded-lg py-2 cursor-pointer hover:bg-muted transition-colors duration-160">
          <CalendarDays className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-sm sm:text-base font-semibold truncate text-foreground">{formatDateDisplay(date)}</span>
          <input type="date" value={date} aria-label="Elegir fecha en el calendario"
            onChange={e => e.target.value && setDate(e.target.value)}
            onClick={e => e.currentTarget.showPicker?.()}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button onClick={() => setDate(d => shiftDate(d, 1))} className="btn-icon shrink-0" aria-label="Día siguiente">
          <ChevronRight className="w-5 h-5" />
        </button>
        {date !== today() && (
          <button onClick={() => setDate(today())} className="btn-outline btn-sm shrink-0">Hoy</button>
        )}
      </div>

      {/* ── Tabs de canchas ── */}
      {fields.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {fields.map(f => {
            const conteo = conteos[f.id] || 0;
            return (
              <button key={f.id} onClick={() => setSelectedField(f)}
                aria-pressed={selectedField?.id === f.id}
                className={`relative px-4 py-2 rounded-xl text-sm font-semibold border transition-[background-color,border-color,color] duration-160 ease-out
                  ${selectedField?.id === f.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/25'}`}
              >
                {f.nombre}
                <span className="ml-1.5 text-xs font-medium opacity-70 capitalize">{f.deporte}</span>
                {/* Badge de notificación: cantidad de turnos del día en esta cancha */}
                {conteo > 0 && (
                  <span
                    className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold text-danger-foreground tabular"
                    style={{ background: 'rgb(var(--danger))', border: '2px solid rgb(var(--background))' }}
                    title={`${conteo} turno${conteo !== 1 ? 's' : ''} agendado${conteo !== 1 ? 's' : ''} este día`}>
                    {conteo}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl py-8 text-center text-sm text-muted-foreground" style={DARK.surface}>
          Sin canchas activas. Agregá una en <strong className="text-foreground/70">Configuración</strong>.
        </div>
      )}

      {/* ── Stats ── */}
      {selectedField && !loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: libres,   label: 'Libres',   color: 'rgb(var(--success))', bg: 'rgb(var(--success) / 0.08)',   border: 'rgb(var(--success) / 0.20)' },
            { value: ocupados, label: 'Reservas', color: 'rgb(var(--info))', bg: 'rgb(var(--info) / 0.08)',   border: 'rgb(var(--info) / 0.22)' },
            { value: pasados,  label: 'Pasados',  color: 'rgb(var(--muted-foreground))', bg: 'rgb(var(--foreground) / 0.03)', border: 'rgb(var(--foreground) / 0.07)' },
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
          onManage={setManageSlot}
          onCancel={puedeCancelar ? handleCancel : undefined}
          onNoShow={handleNoShow}
          onConfirm={handleConfirm}
          onCorrectNoShow={handleCorrectNoShow}
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
          cargarOpcionesPago={(duracion, monto) => agendaService.opcionesPago(complexId, { field_id: selectedField.id, duracion, monto })}
        />
      )}
      {linkPago && <LinkPagoModal pago={linkPago.pago} booking={linkPago.booking} onClose={() => setLinkPago(null)} />}

      {/* ── Modal de gestión del turno (cobrar / consumos) ── */}
      {manageSlot && (
        <TurnoModal
          complexId={complexId}
          slot={manageSlot}
          onClose={() => setManageSlot(null)}
          onChanged={() => { loadSlots(); loadConteos(); }}
          showToast={showToast}
        />
      )}

      {/* ── Cancelación de turno fijo: puntual vs completo ── */}
      {cancelFijo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setCancelFijo(null)} />
          <div className="relative z-10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={DARK.surface}>
            <h3 className="font-bold text-foreground mb-1">Cancelar turno fijo</h3>
            <p className="text-sm text-muted-foreground mb-5">
              El turno de <strong className="text-foreground/85">{cancelFijo.nombre}</strong> es un turno fijo (se repite cada semana). ¿Qué querés cancelar?
            </p>
            <div className="space-y-2.5">
              <button
                onClick={() => { const id = cancelFijo.bookingId; setCancelFijo(null); doCancel(id); }}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: 'rgb(var(--warning) / 0.12)', color: 'rgb(var(--warning))', border: '1px solid rgb(var(--warning) / 0.3)' }}>
                Solo el turno de este día
                <span className="block text-xs font-normal text-amber-200/60 mt-0.5">Libera este horario; el turno fijo sigue vigente.</span>
              </button>
              <button
                onClick={handleBajaFijoCompleto}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: 'rgb(var(--danger) / 0.12)', color: 'rgb(var(--danger))', border: '1px solid rgb(var(--danger) / 0.3)' }}>
                Todo el turno fijo
                <span className="block text-xs font-normal text-red-200/60 mt-0.5">Elimina también las próximas semanas (turnos futuros no jugados).</span>
              </button>
              <button onClick={() => setCancelFijo(null)} className="btn-outline w-full text-sm mt-1">Volver</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de turnos fijos ── */}
      {showFijos && (
        <FijosModal
          complexId={complexId}
          onClose={() => setShowFijos(false)}
          onChanged={() => { loadSlots(); loadConteos(); }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div role="status" aria-live="polite"
          className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-elevated text-foreground shadow-pop text-sm font-medium animate-pop-in">
          {toast.type === 'success'
            ? <CheckCircle className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
            : <XCircle className="w-5 h-5 text-danger shrink-0" aria-hidden="true" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
