import { useState, useEffect, useMemo } from 'react';
import { X, User, Phone, Mail, CreditCard, DollarSign, FileText, Clock, CheckCircle } from 'lucide-react';

const METODOS = [
  { value: 'efectivo',      label: 'Efectivo',       icon: '💵' },
  { value: 'transferencia', label: 'Transferencia',  icon: '🏦' },
  { value: 'mercadopago',   label: 'MercadoPago',    icon: '💳' },
  { value: 'tarjeta',       label: 'Tarjeta',        icon: '💳' },
];

const TODAS_DURACIONES = [
  { value: 30,  label: '30 min',       labelCorto: '½ h' },
  { value: 60,  label: '1 hora',       labelCorto: '1 h' },
  { value: 90,  label: '1 h 30 min',   labelCorto: '1½ h' },
  { value: 120, label: '2 horas',      labelCorto: '2 h' },
];

function addMinutes(hora, min) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function BookingModal({ slot, field, allSlots, onConfirm, onClose, playerMode = false, mpEnabled = false, playerData = {} }) {
  // Duraciones que permite la cancha (default: todas)
  const fieldDuraciones = field?.duraciones_permitidas?.length
    ? field.duraciones_permitidas
    : [30, 60, 90, 120];

  // Calcular qué duraciones son realmente disponibles desde este slot
  const duracionesDisponibles = useMemo(() => {
    const startIdx = allSlots.findIndex(s => s.hora === slot.hora);
    return TODAS_DURACIONES.filter(d => {
      if (!fieldDuraciones.includes(d.value)) return false;
      const slotsNecesarios = d.value / 30;
      for (let i = 0; i < slotsNecesarios; i++) {
        const s = allSlots[startIdx + i];
        if (!s || s.estado !== 'libre' || s.past) return false;
      }
      return true;
    });
  }, [slot.hora, allSlots, fieldDuraciones]);

  const [duracion, setDuracion] = useState(duracionesDisponibles[0]?.value ?? null);
  const [form, setForm] = useState({
    nombre_cliente:   playerData?.nombre || '',
    telefono_cliente: playerData?.telefono || '',
    email_cliente:    '',
    metodo_pago:      'efectivo',
    monto:            field?.precio_base ? String(field.precio_base) : '',
    notas:            '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Opciones de pago del jugador: 'complejo' | 'seña' | 'total'
  const [tipoPago, setTipoPago] = useState('complejo');
  const senaMonto  = Number(field?.sena_monto) || 0;
  const totalMonto = Number(form.monto) || 0;

  const horaFin = duracion ? addMinutes(slot.hora, duracion) : '--:--';

  // precio automático: precios_por_duracion tiene prioridad, luego precio_base proporcional
  useEffect(() => {
    if (!duracion) return;
    const precios = field?.precios_por_duracion;
    if (precios && precios[String(duracion)] !== undefined) {
      setForm(f => ({ ...f, monto: String(precios[String(duracion)]) }));
    } else if (field?.precio_base) {
      const precio = parseFloat(field.precio_base) * (duracion / 60);
      setForm(f => ({ ...f, monto: String(precio.toFixed(0)) }));
    }
  }, [duracion, field?.precios_por_duracion, field?.precio_base]);

  // cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!duracion) return setError('Seleccioná una duración.');
    if (!form.nombre_cliente.trim()) return setError('El nombre del cliente es obligatorio.');
    setError('');
    setLoading(true);
    try {
      await onConfirm({
        ...form,
        field_id: slot.field_id,
        fecha:    slot.fecha,
        hora:     slot.hora,
        duracion,
        monto:    form.monto ? parseFloat(form.monto) : undefined,
        // En modo jugador, el tipo de pago define el flujo (offline / MercadoPago)
        tipo_pago: playerMode ? tipoPago : undefined,
      });
    } catch (err) {
      setError(err.message || 'Error al confirmar la reserva.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* cabecera */}
        <div className="bg-primary px-6 py-4 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">Reservar turno</h2>
              <div className="flex items-center gap-1.5 text-primary-100 text-sm mt-0.5 opacity-90">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {slot.hora}
                  {duracion && ` → ${horaFin}`}
                </span>
                <span className="opacity-60">·</span>
                <span>{field?.nombre}</span>
                <span className="opacity-60">·</span>
                <span>
                  {new Date(slot.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors mt-0.5">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* [&_.label]: fuerza etiquetas oscuras y legibles sobre el modal blanco */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto max-h-[75vh] [&_.label]:text-slate-600">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          {/* ── selector de duración ── */}
          <div>
            <label className="label">
              Duración del turno <span className="text-red-500">*</span>
            </label>
            {duracionesDisponibles.length === 0 ? (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                No hay duraciones disponibles desde este horario sin superponerse con otra reserva.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {TODAS_DURACIONES.map(d => {
                  const available = duracionesDisponibles.find(x => x.value === d.value);
                  const selected  = duracion === d.value;
                  if (!fieldDuraciones.includes(d.value)) return null;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      disabled={!available}
                      onClick={() => setDuracion(d.value)}
                      className={`relative flex flex-col items-center justify-center py-3 rounded-xl border-2 text-sm font-medium transition-all
                        ${selected
                          ? 'bg-primary text-white border-primary shadow-md scale-[1.02]'
                          : available
                            ? 'border-slate-300 text-slate-700 hover:border-primary hover:text-primary bg-white'
                            : 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                        }`}
                    >
                      {selected && <CheckCircle className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-white/80" />}
                      <span className="text-lg font-bold">{d.labelCorto}</span>
                      <span className="text-xs opacity-75">{d.label}</span>
                      {!available && fieldDuraciones.includes(d.value) && (
                        <span className="text-xs text-red-400 mt-0.5">No disponible</span>
                      )}
                      {available && duracion === d.value && (
                        <span className="text-xs text-white/80 mt-0.5">
                          {slot.hora} → {addMinutes(slot.hora, d.value)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── datos del cliente ── */}
          <div>
            <label className="label">Nombre del cliente <span className="text-red-500">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input className="input pl-9" placeholder="Juan García" required
                value={form.nombre_cliente}
                onChange={e => set('nombre_cliente', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input className="input pl-9" placeholder="11 1234-5678"
                  value={form.telefono_cliente}
                  onChange={e => set('telefono_cliente', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" className="input pl-9" placeholder="mail@ej.com"
                  value={form.email_cliente}
                  onChange={e => set('email_cliente', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── pago ── */}
          {playerMode ? (
            /* Jugador: elige cómo pagar. El monto lo fija la cancha (no editable).
               Las opciones de MercadoPago solo aparecen si el complejo tiene MP
               configurado (mpEnabled). */
            <div>
              <label className="label !text-slate-600">¿Cómo querés pagar?</label>
              <div className="space-y-2">
                {/* Pagar en el complejo (offline) — siempre disponible */}
                <button type="button" onClick={() => setTipoPago('complejo')}
                  aria-pressed={tipoPago === 'complejo'}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
                    ${tipoPago === 'complejo' ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'}`}>
                  <span className="text-xl">🏟️</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">Pagar en el complejo</div>
                    <div className="text-xs text-slate-500">Reservás ahora y pagás en el lugar.</div>
                  </div>
                  {tipoPago === 'complejo' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                </button>

                {/* Pagar seña con MercadoPago (MP habilitado + cancha con seña) */}
                {mpEnabled && senaMonto > 0 && (
                  <button type="button" onClick={() => setTipoPago('seña')}
                    aria-pressed={tipoPago === 'seña'}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
                      ${tipoPago === 'seña' ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'}`}>
                    <span className="text-xl">💳</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">Pagar seña con MercadoPago</div>
                      <div className="text-xs text-slate-500">Asegurás el turno con una seña.</div>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">${senaMonto.toLocaleString('es-AR')}</span>
                  </button>
                )}

                {/* Pagar total con MercadoPago (solo si MP está habilitado) */}
                {mpEnabled && (
                  <button type="button" onClick={() => setTipoPago('total')}
                    aria-pressed={tipoPago === 'total'}
                    disabled={totalMonto <= 0}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50
                      ${tipoPago === 'total' ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'}`}>
                    <span className="text-xl">💳</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">Pagar total con MercadoPago</div>
                      <div className="text-xs text-slate-500">Pagás el turno completo ahora.</div>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">${totalMonto.toLocaleString('es-AR')}</span>
                  </button>
                )}

                {!mpEnabled && (
                  <p className="text-xs text-slate-500">
                    Este complejo aún no acepta pagos online. Podés reservar y pagar en el lugar.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Admin: método y precio manuales */
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label !text-slate-600">Método de pago</label>
                <select className="input text-sm" value={form.metodo_pago}
                  onChange={e => set('metodo_pago', e.target.value)}>
                  {METODOS.map(m => (
                    <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label !text-slate-600">Precio ($)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="number" min="0" step="1" className="input pl-9" placeholder="0"
                    value={form.monto}
                    onChange={e => set('monto', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="label">Notas</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <textarea className="input pl-9 h-16 resize-none" placeholder="Observaciones opcionales..."
                value={form.notas} onChange={e => set('notas', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-1 border-t border-border">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg font-semibold border border-slate-300 text-slate-700
                         hover:border-primary hover:text-primary transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || duracionesDisponibles.length === 0}
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Procesando...</>
                : (playerMode && tipoPago === 'seña') ? `Pagar seña $${senaMonto.toLocaleString('es-AR')}`
                : (playerMode && tipoPago === 'total') ? `Pagar total $${totalMonto.toLocaleString('es-AR')}`
                : 'Confirmar reserva'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
