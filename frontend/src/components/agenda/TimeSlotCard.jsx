import { Clock, User, Phone, CreditCard, XCircle, CheckCircle, Lock, AlertCircle, UserX, MessageCircle, DollarSign } from 'lucide-react';
import NeonBorderCell from './NeonBorderCell';
import { waLink } from '../../utils/whatsapp';

const METODO_LABELS = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  mercadopago: 'MercadoPago', tarjeta: 'Tarjeta',
};

// ── Paleta dark por estado del turno ─────────────────────────────────────────
//   asignado  = amarillo (turno confirmado, aún no comenzó)
//   asistido  = verde    (turno confirmado cuya hora de inicio ya pasó)
//   noasistido= rojo     (marcado como "no asistió")
//   pendiente = ámbar    (solicitud web esperando confirmación)
// Textos claros sobre fondos translúcidos oscuros → contraste/legibilidad OK.
const STYLES = {
  libre: {
    card:   { background: 'rgba(34,197,94,0.07)',  border: '1px solid rgba(34,197,94,0.22)',  cursor: 'pointer' },
    hover:  { background: 'rgba(34,197,94,0.13)',  border: '1px solid rgba(34,197,94,0.40)' },
    icon:   'text-green-400', text: 'text-green-300', hint: 'text-green-500',
  },
  asignado: {  // amarillo
    card:   { background: 'rgba(234,179,8,0.12)',  border: '1px solid rgba(234,179,8,0.30)', borderLeft: '3px solid rgba(234,179,8,0.7)' },
    name:   'text-yellow-100', phone: 'text-yellow-200', method: 'text-yellow-300', time: 'text-yellow-100',
    badge:  { background: 'rgba(234,179,8,0.22)', color: '#fde68a', border: '1px solid rgba(234,179,8,0.4)' },
    monto:  'text-green-300', icon: 'text-yellow-300', label: 'Asignado',
  },
  asistido: {  // verde
    card:   { background: 'rgba(34,197,94,0.13)',  border: '1px solid rgba(34,197,94,0.32)', borderLeft: '3px solid rgba(34,197,94,0.7)' },
    name:   'text-green-100', phone: 'text-green-200', method: 'text-green-300', time: 'text-green-100',
    badge:  { background: 'rgba(34,197,94,0.22)', color: '#86efac', border: '1px solid rgba(34,197,94,0.4)' },
    monto:  'text-green-300', icon: 'text-green-300', label: 'Asistido',
  },
  noasistido: {  // rojo
    card:   { background: 'rgba(239,68,68,0.13)',  border: '1px solid rgba(239,68,68,0.32)', borderLeft: '3px solid rgba(239,68,68,0.7)' },
    name:   'text-red-100', phone: 'text-red-200', method: 'text-red-300', time: 'text-red-100',
    badge:  { background: 'rgba(239,68,68,0.22)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)' },
    monto:  'text-green-300', icon: 'text-red-300', label: 'No asistió',
  },
  pendiente: {  // ámbar
    card:   { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)', borderLeft: '3px solid rgba(245,158,11,0.55)' },
    name:   'text-amber-100', phone: 'text-amber-200', method: 'text-amber-300', time: 'text-amber-100',
    badge:  { background: 'rgba(245,158,11,0.20)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' },
    monto:  'text-green-300', icon: 'text-amber-300', label: 'Pendiente',
  },
  secondary: {
    card:   { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid rgba(255,255,255,0.15)' },
    text:   'text-white/40',
  },
  past: {
    card:   { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', opacity: 0.35, cursor: 'not-allowed' },
    icon:   'text-white/20', text: 'text-white/25',
  },
};

export default function TimeSlotCard({ slot, onSelect, onManage, onCancel, onNoShow, onConfirm, onCorrectNoShow, index }) {
  const isLibre     = slot.estado === 'libre';
  const isOcupado   = slot.estado === 'ocupado';
  const isPast      = slot.past && !isOcupado;
  const isSecondary = isOcupado && !slot.isFirstOfBooking;
  const isPendiente  = isOcupado && slot.booking?.estado === 'pendiente';
  const isNoAsistido = isOcupado && slot.booking?.estado === 'no_asistido';
  const isConfirmado = isOcupado && slot.booking?.estado === 'confirmado';
  const isAsistido   = isConfirmado && slot.past;   // ya comenzó → asistido (verde)
  const isCobrado    = isOcupado && !!slot.booking?.cobrado;
  // Se puede marcar ausencia solo si el turno ya empezó y está confirmado
  const puedeMarcarAusencia = isConfirmado && slot.isFirstOfBooking && slot.past;
  // El turno (primer slot, no pendiente) es gestionable: cobrar / agregar consumos
  const esGestionable = isOcupado && slot.isFirstOfBooking && slot.booking && !isPendiente && onManage;

  // Estilo del estado del turno (amarillo / verde / rojo / ámbar)
  const ES = isNoAsistido ? STYLES.noasistido
           : isAsistido   ? STYLES.asistido
           : isPendiente  ? STYLES.pendiente
           :                STYLES.asignado;   // confirmado futuro

  // Estilo base de la tarjeta
  let baseStyle;
  if (isPast)              baseStyle = STYLES.past.card;
  else if (isLibre)        baseStyle = STYLES.libre.card;
  else if (isSecondary)    baseStyle = STYLES.secondary.card;
  else                     baseStyle = { ...ES.card, ...(esGestionable ? { cursor: 'pointer' } : {}) };

  const S = ES;

  // Para slots libres usamos NeonBorderCell como contenedor externo.
  // radius=12 coincide con rounded-xl (0.75rem = 12px).
  const Wrapper = (isLibre && !isPast) ? NeonBorderCell : 'div';
  const wrapperProps = (isLibre && !isPast)
    ? { active: true, radius: 12, speed: '1.8s', trail: true }
    : {};

  return (
    <Wrapper
      className="group relative rounded-xl transition-all duration-150"
      style={baseStyle}
      data-aos="fade-up"
      data-aos-delay={Math.min(index * 15, 200)}
      data-aos-once="true"
      onClick={() => {
        if (isLibre && !isPast) return onSelect(slot);
        if (esGestionable) return onManage(slot);
      }}
      onMouseEnter={e => {
        if (isLibre && !isPast) {
          Object.assign(e.currentTarget.style, STYLES.libre.hover);
        }
      }}
      onMouseLeave={e => {
        if (isLibre && !isPast) {
          Object.assign(e.currentTarget.style, STYLES.libre.card);
        }
      }}
      {...wrapperProps}
    >
      {isOcupado && slot.isFirstOfBooking && slot.booking ? (
        /* ── Reserva (primer slot): layout de 2 filas, sin superposición en móvil ── */
        <div className="px-3 sm:px-4 py-2.5">

          {/* Fila superior: hora · estado · cancelar */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className={`w-3.5 h-3.5 shrink-0 ${S.icon}`} />
              <span className={`text-sm tabular-nums font-semibold ${S.time}`}>
                {slot.hora}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isNoAsistido ? (
                <>
                  <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(148,163,184,0.18)', color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.3)' }}>
                    <UserX className="w-3 h-3" /> No asistió
                  </span>
                  {/* Corregir → asistió (solo administradores) */}
                  {onCorrectNoShow && (
                    <button
                      onClick={e => { e.stopPropagation(); onCorrectNoShow(slot.booking_id); }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all duration-150"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.30)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
                      title="Corregir: marcar como asistido"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Asistió
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Badge de estado: amarillo (asignado) / verde (asistido) / ámbar (pendiente) */}
                  <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={S.badge}>
                    {isAsistido ? <CheckCircle className="w-3 h-3" /> : isPendiente ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {S.label}
                  </span>

                  {/* Cobrado */}
                  {isCobrado && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.4)' }}>
                      <DollarSign className="w-3 h-3" /> Cobrado
                    </span>
                  )}

                  {/* Confirmar — solo para reservas pendientes (solicitudes web) */}
                  {isPendiente && onConfirm && (
                    <button
                      onClick={e => { e.stopPropagation(); onConfirm(slot.booking_id); }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all duration-150"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.30)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
                      title="Confirmar este turno"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Confirmar
                    </button>
                  )}

                  {/* Marcar como no asistido — solo si el turno ya expiró */}
                  {puedeMarcarAusencia && onNoShow && (
                    <button
                      onClick={e => { e.stopPropagation(); onNoShow(slot.booking_id); }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all duration-150"
                      style={{ background: 'rgba(148,163,184,0.14)', color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.28)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(148,163,184,0.24)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(148,163,184,0.14)'}
                      title="Marcar como no asistido"
                    >
                      <UserX className="w-3.5 h-3.5" /> No asistió
                    </button>
                  )}

                  {/* Cancelar — solo con permiso (onCancel) y si el turno NO empezó */}
                  {onCancel && !slot.past && (
                    <button
                      onClick={e => { e.stopPropagation(); onCancel(slot.booking_id); }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all duration-150"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                      title="Cancelar esta reserva"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Fila de detalles: cliente · teléfono · método · rango · monto (envuelve) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5">
            <div className={`flex items-center gap-1.5 text-sm font-semibold min-w-0 ${S.name}`}>
              <User className={`w-3.5 h-3.5 shrink-0 ${S.icon}`} />
              <span className="truncate max-w-[50vw] sm:max-w-none">{slot.booking.nombre_cliente}</span>
            </div>
            {slot.booking.telefono_cliente && (
              waLink(slot.booking.telefono_cliente) ? (
                /* Botón: el admin escribe al cliente por WhatsApp */
                <a
                  href={waLink(slot.booking.telefono_cliente)}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="Escribir al cliente por WhatsApp"
                  className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md transition-colors"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.22)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.12)'}
                >
                  <MessageCircle className="w-3 h-3 shrink-0" /> {slot.booking.telefono_cliente}
                </a>
              ) : (
                <span className={`flex items-center gap-1 text-xs ${S.phone}`}>
                  <Phone className="w-3 h-3 shrink-0" /> {slot.booking.telefono_cliente}
                </span>
              )
            )}
            <span className={`flex items-center gap-1 text-xs ${S.method}`}>
              <CreditCard className="w-3 h-3 shrink-0" />
              {METODO_LABELS[slot.booking.metodo_pago] || slot.booking.metodo_pago}
            </span>
            <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={S.badge}>
              {slot.booking.hora_inicio} → {slot.booking.hora_fin}
              <span className="ml-1 opacity-60">({slot.booking.duracion}min)</span>
            </span>
            {slot.booking.monto > 0 && (
              <span className="text-sm font-bold text-green-400">
                ${parseFloat(slot.booking.monto).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* ── Libre / pasado / continuación: layout horizontal simple ── */
        <div className={`flex items-center gap-3 px-4 ${isSecondary ? 'py-1.5' : 'py-3'}`}>

          {/* Hora */}
          <div className="flex items-center gap-1.5 w-20 sm:w-24 shrink-0">
            {isSecondary ? (
              <div className="w-3.5 h-3.5 flex items-center justify-center">
                <div className="w-px h-4 bg-red-700 mx-auto" />
              </div>
            ) : (
              <Clock className={`w-3.5 h-3.5 shrink-0 ${isPast ? STYLES.past.icon : STYLES.libre.icon}`} />
            )}
            <span className={`text-sm tabular-nums font-semibold ${
              isPast ? STYLES.past.text : isSecondary ? 'text-red-700 font-normal' : 'text-green-300'
            }`}>
              {slot.hora}
            </span>
          </div>

          {/* Central */}
          <div className="flex-1 min-w-0">
            {isLibre && !isPast && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span className="text-sm text-green-300 font-medium">Disponible</span>
                <span className="text-xs text-green-600 hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity">
                  — clic para reservar
                </span>
              </div>
            )}
            {isPast && (
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-white/20" />
                <span className="text-xs text-white/25">Horario pasado</span>
              </div>
            )}
            {isSecondary && (
              <span className="text-xs italic" style={{ color: 'rgba(239,68,68,0.45)' }}>continuación</span>
            )}
          </div>

          {/* Badge libre */}
          {isLibre && !isPast && (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
              Libre
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}
