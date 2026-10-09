import { useState, useEffect, useMemo } from 'react';
import { X, User, Phone, Mail, CreditCard, DollarSign, FileText, Clock, CheckCircle, Building2, Loader2, Repeat, Info } from 'lucide-react';

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
export default function BookingModal({ slot, field, allSlots, onConfirm, onClose, playerMode = false, cargarOpcionesPago, playerData = {}, soloPagoOnline = false }) {
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
            const sigue = r.opciones.find(o => o.tipo === prev && o.disponible && !(soloPagoOnline && o.tipo === 'complejo'));
            if (eligioPago && sigue) return prev;
            // Incumplido: solo seña/total con Mercado Pago
            if (soloPagoOnline) return r.opciones.find(o => o.tipo === 'seña' && o.disponible)?.tipo || r.opciones.find(o => o.tipo === 'total' && o.disponible)?.tipo || 'seña';
            return r.predeterminada;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="reserva-titulo">
      <div className="absolute inset-0 bg-black/55 animate-fade-in" onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-md max-h-[92dvh] flex flex-col bg-elevated border border-border rounded-t-2xl sm:rounded-2xl shadow-pop overflow-hidden animate-sheet-in sm:animate-pop-in">
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-border shrink-0" aria-hidden="true" />
        {/* cabecera: qué se reserva, siempre visible */}
        <div className="px-5 pt-4 pb-4 sm:px-6 sm:pt-5 flex items-start justify-between gap-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 id="reserva-titulo" className="text-xl font-extrabold tracking-tight">Reservar turno</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground tabular">
                <Clock className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                {slot.hora}{duracion && ` – ${horaFin}`}
              </span>
              <span aria-hidden="true">·</span>
              <span>{field?.nombre}</span>
              <span aria-hidden="true">·</span>
              <span>
                {new Date(slot.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn-icon -mr-2 -mt-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 space-y-5">
          {error && <div className="alert-error" role="alert">{error}</div>}

          {/* ── selector de duración ── */}
          <div>
            <label className="label">
              Duración
            </label>
            {duracionesDisponibles.length === 0 ? (
              <div className="alert-error">
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
                      aria-pressed={selected}
                      className={`relative flex flex-col items-center justify-center py-3 rounded-xl border text-sm font-medium
                        transition-[background-color,border-color,color,transform] duration-160 ease-out active:scale-[0.98]
                        ${selected
                          ? 'bg-primary/10 text-foreground border-primary ring-1 ring-primary'
                          : available
                            ? 'bg-card border-border text-foreground hover:border-foreground/30'
                            : 'bg-muted/50 border-border text-muted-foreground/60 cursor-not-allowed'
                        }`}
                    >
                      {selected && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" aria-hidden="true" />}
                      <span className="text-lg font-bold">{d.labelCorto}</span>
                      <span className="text-xs text-muted-foreground">{d.label}</span>
                      {!available && fieldDuraciones.includes(d.value) && (
                        <span className="text-xs text-danger mt-0.5">Se superpone</span>
                      )}
                      {available && duracion === d.value && (
                        <span className="text-xs text-primary font-semibold mt-0.5 tabular">
                          {slot.hora} – {addMinutes(slot.hora, d.value)}
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
            <label htmlFor="bk-nombre" className="label">{playerMode ? 'A nombre de' : 'Nombre del cliente'}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input id="bk-nombre" className="input pl-9" required autoComplete="name"
                value={form.nombre_cliente}
                onChange={e => set('nombre_cliente', e.target.value)} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bk-tel" className="label">Celular</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input id="bk-tel" type="tel" inputMode="tel" autoComplete="tel" className="input pl-9" placeholder="381 555-0142"
                  value={form.telefono_cliente}
                  onChange={e => set('telefono_cliente', e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="bk-email" className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input id="bk-email" type="email" inputMode="email" autoComplete="email" className="input pl-9" placeholder="nombre@email.com"
                  value={form.email_cliente}
                  onChange={e => set('email_cliente', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── pago: modalidades (complejo / seña / total) ── */}
          <div>
            <span className="label">{playerMode ? '¿Cómo querés pagar?' : 'Modalidad de pago'}</span>
            <div className="space-y-2">
              {soloPagoOnline && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2" role="note">
                  Por reiteradas inasistencias, este turno solo se puede reservar pagando con Mercado Pago (seña o total).
                </p>
              )}
              {/* Pagar en el complejo (offline) — no disponible para incumplidos */}
              {!soloPagoOnline && <button type="button" onClick={() => elegir('complejo')}
                aria-pressed={tipoPago === 'complejo'}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-[background-color,border-color] duration-160 ease-out
                  ${tipoPago === 'complejo' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:border-foreground/30'}`}>
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-muted text-foreground shrink-0"><Building2 className="w-[18px] h-[18px]" aria-hidden="true" /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">Pagar en el complejo</div>
                  <div className="text-xs text-muted-foreground">{playerMode ? 'Reservás ahora y pagás en el lugar.' : 'Queda pendiente de cobro en el lugar.'}</div>
                </div>
                {tipoPago === 'complejo' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
              </button>}

              {/* Seña / total con MercadoPago (solo si el complejo está conectado) */}
              {opcionesMP.map(o => (
                <button key={o.tipo} type="button" onClick={() => elegir(o.tipo)}
                  aria-pressed={tipoPago === o.tipo}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-[background-color,border-color] duration-160 ease-out
                    ${tipoPago === o.tipo ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:border-foreground/30'}`}>
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-info/12 text-info shrink-0"><CreditCard className="w-[18px] h-[18px]" aria-hidden="true" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{o.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.tipo === 'seña' ? 'Asegura el turno con una seña; el resto se paga en el lugar.' : 'Turno completo pagado por adelantado.'}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular shrink-0">${Number(o.monto).toLocaleString('es-AR')}</span>
                </button>
              ))}

              {pagos && !pagos.mp_conectado && (
                <p className="text-xs text-muted-foreground">
                  {playerMode ? 'Este complejo aún no acepta pagos online. Podés reservar y pagar en el lugar.' : 'Conectá MercadoPago en Configuración para ofrecer seña o pago total online.'}
                </p>
              )}
              {!playerMode && esMP && (
                <p className="alert-info text-xs"><Info className="w-4 h-4 shrink-0" aria-hidden="true" />
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
                  <label htmlFor="bk-metodo" className="label">Método de pago</label>
                  <select id="bk-metodo" className="input text-sm" value={form.metodo_pago}
                    onChange={e => set('metodo_pago', e.target.value)}>
                    {METODOS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={esMP ? 'col-span-2' : ''}>
                <label htmlFor="bk-precio" className="label">Precio</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input id="bk-precio" type="number" min="0" step="1" inputMode="numeric" className="input pl-9 tabular" placeholder="0"
                    value={form.monto}
                    onChange={e => set('monto', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="bk-notas" className="label">Notas <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <textarea id="bk-notas" className="input pl-9 h-16 resize-none" placeholder="Ej: traemos pelota, pechera, etc."
                value={form.notas} onChange={e => set('notas', e.target.value)} />
            </div>
          </div>

          {/* Turno fijo — solo panel admin/colaborador */}
          {!playerMode && (
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 cursor-pointer hover:border-foreground/30 transition-colors duration-160">
              <input type="checkbox" className="mt-0.5 w-4 h-4" checked={fijo} onChange={e => setFijo(e.target.checked)} />
              <span className="text-sm">
                <span className="font-semibold text-foreground inline-flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> Turno fijo semanal</span>
                <span className="block text-xs text-muted-foreground">Se agenda automáticamente este mismo día y hora en las próximas semanas.</span>
              </span>
            </label>
          )}

        </div>
          <div className="flex gap-3 px-5 py-4 sm:px-6 border-t border-border bg-elevated shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || duracionesDisponibles.length === 0}
              className="btn-primary flex-1"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Procesando…</>
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
