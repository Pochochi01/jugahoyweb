import { Clock, User, Phone, CreditCard, XCircle, CheckCircle, Lock, AlertCircle } from 'lucide-react';
import NeonBorderCell from './NeonBorderCell';

const METODO_LABELS = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  mercadopago: 'MercadoPago', tarjeta: 'Tarjeta',
};

// ── Paleta dark para cada estado ─────────────────────────────────────────────
const STYLES = {
  libre: {
    card:   { background: 'rgba(34,197,94,0.07)',  border: '1px solid rgba(34,197,94,0.22)',  cursor: 'pointer' },
    hover:  { background: 'rgba(34,197,94,0.13)',  border: '1px solid rgba(34,197,94,0.40)' },
    icon:   'text-green-400',
    text:   'text-green-300',
    hint:   'text-green-500',
  },
  confirmado: {
    card:   { background: 'rgba(239,68,68,0.08)',  border: '1px solid rgba(239,68,68,0.22)',  borderLeft: '3px solid rgba(239,68,68,0.60)' },
    name:   'text-red-200',
    phone:  'text-red-400',
    method: 'text-red-500',
    badge:  { background: 'rgba(239,68,68,0.18)', color: '#fca5a5' },
    monto:  'text-green-400',
    icon:   'text-red-400',
  },
  pendiente: {
    card:   { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', borderLeft: '3px solid rgba(245,158,11,0.55)' },
    name:   'text-amber-200',
    phone:  'text-amber-400',
    method: 'text-amber-500',
    badge:  { background: 'rgba(245,158,11,0.18)', color: '#fcd34d' },
    monto:  'text-green-400',
    icon:   'text-amber-400',
  },
  secondary: {
    card:   { background: 'rgba(239,68,68,0.04)',  border: '1px solid rgba(239,68,68,0.12)',  borderLeft: '3px solid rgba(239,68,68,0.25)' },
    text:   'text-red-600',
  },
  past: {
    card:   { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', opacity: 0.35, cursor: 'not-allowed' },
    icon:   'text-white/20',
    text:   'text-white/25',
  },
};

export default function TimeSlotCard({ slot, onSelect, onCancel, index }) {
  const isLibre     = slot.estado === 'libre';
  const isOcupado   = slot.estado === 'ocupado';
  const isPast      = slot.past && !isOcupado;
  const isSecondary = isOcupado && !slot.isFirstOfBooking;
  const isPendiente = isOcupado && slot.booking?.estado === 'pendiente';

  // Estilo base según estado
  let baseStyle;
  if (isPast)                   baseStyle = STYLES.past.card;
  else if (isLibre)             baseStyle = STYLES.libre.card;
  else if (isPendiente && !isSecondary) baseStyle = STYLES.pendiente.card;
  else if (isSecondary)         baseStyle = STYLES.secondary.card;
  else                          baseStyle = STYLES.confirmado.card;

  const S = isPendiente ? STYLES.pendiente : STYLES.confirmado;

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
      onClick={() => isLibre && !isPast && onSelect(slot)}
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
              <span className={`text-sm tabular-nums font-semibold ${isPendiente ? 'text-amber-200' : 'text-red-200'}`}>
                {slot.hora}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isPendiente ? (
                <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.30)' }}>
                  <AlertCircle className="w-3 h-3" /> Pendiente
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.28)' }}>
                  Confirmado
                </span>
              )}
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
            </div>
          </div>

          {/* Fila de detalles: cliente · teléfono · método · rango · monto (envuelve) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5">
            <div className={`flex items-center gap-1.5 text-sm font-semibold min-w-0 ${S.name}`}>
              <User className={`w-3.5 h-3.5 shrink-0 ${S.icon}`} />
              <span className="truncate max-w-[50vw] sm:max-w-none">{slot.booking.nombre_cliente}</span>
            </div>
            {slot.booking.telefono_cliente && (
              <span className={`flex items-center gap-1 text-xs ${S.phone}`}>
                <Phone className="w-3 h-3 shrink-0" /> {slot.booking.telefono_cliente}
              </span>
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
