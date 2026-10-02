import { useState, useEffect, useMemo } from 'react';
import { X, User, Phone, Mail, CreditCard, DollarSign, FileText, Clock, CheckCircle } from 'lucide-react';

const METODOS = [
  { value: 'efectivo',      label: 'Efectivo',       icon: '💵' },
  { value: 'transferencia', label: 'Transferencia',  icon: '🏦' },
  { value: 'mercadopago',   label: 'MercadoPago',    icon: '💳' },
  { value: 'tarjeta',       label: 'Tarjeta',        icon: '💳' },
];

// Turnos de hora completa: 1 h y 2 h (sin 30 min ni 1½ h).
const TODAS_DURACIONES = [
  { value: 60,  label: '1 hora',       labelCorto: '1 h' },
  { value: 120, label: '2 horas',      labelCorto: '2 h' },
];

function addMinutes(hora, min) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Modal de reserva (jugador en la web y admin en la agenda).
 * cargarOpcionesPago(duracion, monto) → { mp_conectado, predeterminada, opciones[] }
 *   Modalidades: 'complejo' (paga en el lugar) · 'seña' · 'total' (MercadoPago).
 *   Las de MercadoPago aparecen solas si el complejo está conectado por OAuth;
 *   los montos los calcula el servidor (seña de la cancha o % del complejo).
 */
export default function BookingModal({ slot, field, allSlots, onConfirm, onClose, playerMode = false, cargarOpcionesPago, playerData = {} }) {
  // Duraciones que permite la cancha (default: todas)
  const fieldDuraciones = field?.duraciones_permitidas?.length
    ? field.duraciones_permitidas
    : [60, 120];

  // Calcular qué duraciones son realmente disponibles desde este slot
  const duracionesDisponibles = useMemo(() => {
    const startIdx = allSlots.findIndex(s => s.hora === slot.hora);
    return TODAS_DURACIONES.filter(d => {
      if (!fieldDuraciones.includes(d.value)) return false;
      const slotsNecesarios = d.value / 60;   // slots de 60 min (hora completa)
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
  const [fijo, setFijo]       = useState(false);   // turno fijo (recurrente) — solo admin/colaborador

  // Modalidad de pago: 'complejo' | 'seña' | 'total' (preseleccionada la del complejo)
  const [tipoPago, setTipoPago] = useState('complejo');
  const [pagos, setPagos] = useState(null);            // respuesta de opciones-pago
  const [eligioPago, setEligioPago] = useState(false); // el usuario tocó una opción → no pisarla
  const elegir = (t) => { setTipoPago(t); setEligioPago(true); };

  // Opciones según duración (y precio, si el admin lo ajusta): el servidor calcula los montos
  useEffect(() => {
    if (!duracion || !cargarOpcionesPago) return;
    const t = setTimeout(() => {
      cargarOpcionesPago(duracion, playerMode ? undefined : form.monto)
        .then(r => {
          setPagos(r);
          setTipoPago(prev => {
            const sigue = r.opciones.find(o => o.tipo === prev && o.disponible);
            return eligioPago && sigue ? prev : r.predeterminada;
          });
        })
        .catch(() => setPagos(null));
    }, playerMode ? 0 : 350);
    return () => clearTimeout(t);
  }, [duracion, form.monto]);   // eslint-disable-line react-hooks/exhaustive-deps
  const opcionesMP = (pagos?.opciones || []).filter(o => o.tipo !== 'complejo' && o.disponible);
  const esMP = tipoPago === 'seña' || tipoPago === 'total';

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
        // Modalidad de pago: offline o MercadoPago (jugador → paga él; admin → link para el cliente)
        tipo_pago: tipoPago,
        // Turno fijo (recurrente) — solo modo admin/colaborador
        fijo: !playerMode && fijo,
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

          {/* ── pago: modalidades (complejo / seña / total) ── */}
          <div>
            <label className="label !text-slate-600">{playerMode ? '¿Cómo querés pagar?' : 'Modalidad de pago'}</label>
            <div className="space-y-2">
              {/* Pagar en el complejo (offline) — siempre disponible */}
              <button type="button" onClick={() => elegir('complejo')}
                aria-pressed={tipoPago === 'complejo'}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
                  ${tipoPago === 'complejo' ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'}`}>
                <span className="text-xl">🏟️</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">Pagar en el complejo</div>
                  <div className="text-xs text-slate-500">{playerMode ? 'Reservás ahora y pagás en el lugar.' : 'Queda pendiente de cobro en el lugar.'}</div>
                </div>
                {tipoPago === 'complejo' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
              </button>

              {/* Seña / total con MercadoPago (solo si el complejo está conectado) */}
              {opcionesMP.map(o => (
                <button key={o.tipo} type="button" onClick={() => elegir(o.tipo)}
                  aria-pressed={tipoPago === o.tipo}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
                    ${tipoPago === o.tipo ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'}`}>
                  <span className="text-xl">💳</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{o.label}</div>
                    <div className="text-xs text-slate-500">
                      {o.tipo === 'seña' ? 'Asegura el turno con una seña; el resto se paga en el lugar.' : 'Turno completo pagado por adelantado.'}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">${Number(o.monto).toLocaleString('es-AR')}</span>
                </button>
              ))}

              {pagos && !pagos.mp_conectado && (
                <p className="text-xs text-slate-500">
                  {playerMode ? 'Este complejo aún no acepta pagos online. Podés reservar y pagar en el lugar.' : 'Conectá MercadoPago en Configuración para ofrecer seña o pago total online.'}
                </p>
              )}
              {!playerMode && esMP && (
                <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                  Se genera el link de pago de MercadoPago para enviárselo al cliente. El turno queda reservado y se confirma cuando MercadoPago aprueba el pago.
                </p>
              )}
            </div>
          </div>

          {/* Admin: método (si paga en el lugar) y precio editable */}
          {!playerMode && (
            <div className="grid grid-cols-2 gap-3">
              {!esMP && (
                <div>
                  <label className="label !text-slate-600">Método de pago</label>
                  <select className="input text-sm" value={form.metodo_pago}
                    onChange={e => set('metodo_pago', e.target.value)}>
                    {METODOS.map(m => (
                      <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={esMP ? 'col-span-2' : ''}>
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

          {/* Turno fijo — solo panel admin/colaborador */}
          {!playerMode && (
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer hover:border-primary transition-colors">
              <input type="checkbox" className="mt-0.5" checked={fijo} onChange={e => setFijo(e.target.checked)} />
              <span className="text-sm">
                <span className="font-semibold text-slate-800">Turno fijo (se repite cada semana)</span>
                <span className="block text-xs text-slate-500">Se agenda automáticamente este mismo día y hora en las próximas semanas.</span>
              </span>
            </label>
          )}

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
                : esMP
                  ? (() => {
                      const m = Number(opcionesMP.find(o => o.tipo === tipoPago)?.monto || 0).toLocaleString('es-AR');
                      return playerMode
                        ? `Pagar ${tipoPago === 'seña' ? 'seña' : 'total'} $${m}`
                        : `Reservar y generar link ($${m})`;
                    })()
                  : 'Confirmar reserva'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
