import { Clock, User, Phone, CreditCard, XCircle, CheckCircle, Lock, AlertCircle, MessageCircle, DollarSign, GraduationCap, Trophy } from 'lucide-react';
import NeonBorderCell from './NeonBorderCell';
import { waLink } from '../../utils/whatsapp';

const METODO_LABELS = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  mercadopago: 'MercadoPago', tarjeta: 'Tarjeta',
};

// ── Colores por estado del turno (tokens del tema, claro y oscuro) ───────────
//   asignado  = ámbar  (turno confirmado, aún no comenzó)
//   asistido  = verde  (turno confirmado cuya hora de inicio ya pasó)
//   noasistido= rojo   (marcado como "no asistió")
//   pendiente = ámbar con borde punteado (solicitud web esperando confirmación)
// Fondo tintado suave + borde del mismo tono; el estado se lee en el badge,
// no en un borde lateral grueso.
const tinte = (v, fondo, borde, estilo = 'solid') => ({
  background: `rgb(var(--${v}) / ${fondo})`,
  border: `1px ${estilo} rgb(var(--${v}) / ${borde})`,
});
const badgeDe = (v) => ({
  background: `rgb(var(--${v}) / 0.16)`,
  color: `rgb(var(--${v}))`,
  border: `1px solid rgb(var(--${v}) / 0.35)`,
});
const RESERVA = { name: 'text-foreground', phone: 'text-foreground/80', method: 'text-muted-foreground', time: 'text-foreground', monto: 'text-success' };

const STYLES = {
  libre: {
    card:   { ...tinte('success', 0.06, 0.22), cursor: 'pointer' },
    hover:  tinte('success', 0.12, 0.42),
    icon:   'text-success', text: 'text-success', hint: 'text-success/80',
  },
  asignado:   { ...RESERVA, card: tinte('warning', 0.09, 0.32), badge: badgeDe('warning'), icon: 'text-warning', label: 'Asignado' },
  asistido:   { ...RESERVA, card: tinte('success', 0.13, 0.40), badge: badgeDe('success'), icon: 'text-success', label: 'Asistido' },
  noasistido: { ...RESERVA, card: tinte('danger', 0.13, 0.40),  badge: badgeDe('danger'),  icon: 'text-danger',  label: 'No asistió' },
  pendiente:  { ...RESERVA, card: tinte('warning', 0.06, 0.5, 'dashed'), badge: badgeDe('warning'), icon: 'text-warning', label: 'Pendiente' },
  secondary: { card: tinte('foreground', 0.025, 0.08), text: 'text-muted-foreground' },
  // Clase de profesor (violeta) / partido de torneo (azul): ocupan la cancha sin ser reservas
  clase:  { card: tinte('violet', 0.09, 0.35), icon: 'text-violet', text: 'text-foreground' },
  torneo: { card: tinte('info', 0.09, 0.35),   icon: 'text-info',   text: 'text-foreground' },
  past: {
    card: { ...tinte('foreground', 0.02, 0.06), opacity: 0.45, cursor: 'not-allowed' },
    icon: 'text-muted-foreground', text: 'text-muted-foreground',
  },
};

export default function TimeSlotCard({ slot, onSelect, onManage, onCancel, onNoShow, onConfirm, onCorrectNoShow, index }) {
  const isLibre     = slot.estado === 'libre';
  const isOcupado   = slot.estado === 'ocupado';
  const isPast      = slot.past && !isOcupado;
  const bloqueo     = isOcupado && !slot.booking ? slot.bloqueo : null;   // clase / partido de torneo
  const isBloqueo   = Boolean(bloqueo) && slot.isFirstOfBloque;
  const isSecondary = isOcupado && !slot.isFirstOfBooking && !isBloqueo;
  const isPendiente  = isOcupado && slot.booking?.estado === 'pendiente';
  const isNoAsistido = isOcupado && slot.booking?.estado === 'no_asistido';
  const isConfirmado = isOcupado && slot.booking?.estado === 'confirmado';
  // ¿Ya empezó el turno? (en vivo: no espera a recargar la agenda)
  const empezo = slot.past || (slot.booking?.hora_inicio && slot.fecha
    && new Date(`${slot.fecha}T${slot.booking.hora_inicio}:00`) <= new Date());
  // Flujo: Asignado (antes de empezar) → Asistido (al empezar) ↔ Cancelado (click).
  // Una vez iniciado, "Asignado" ya no vuelve.
  const isAsistido   = isConfirmado && empezo;
  const isCobrado    = isOcupado && !!slot.booking?.cobrado;
  // Se puede marcar ausencia solo si el turno ya empezó y está confirmado
  const puedeMarcarAusencia = isConfirmado && slot.isFirstOfBooking && empezo;
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
  else if (isBloqueo)      baseStyle = STYLES[bloqueo.tipo].card;
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
      {isBloqueo ? (
        /* ── Clase de profesor / partido de torneo ── */
        <div className="px-3 sm:px-4 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {bloqueo.tipo === 'clase'
              ? <GraduationCap className={`w-3.5 h-3.5 shrink-0 ${STYLES.clase.icon}`} />
              : <Trophy className={`w-3.5 h-3.5 shrink-0 ${STYLES.torneo.icon}`} />}
            <span className={`text-sm tabular-nums font-semibold ${STYLES[bloqueo.tipo].text}`}>{bloqueo.hora_inicio} → {bloqueo.hora_fin}</span>
            <span className={`text-xs font-medium truncate ${STYLES[bloqueo.tipo].text}`}>· {bloqueo.titulo}</span>
          </div>
          {bloqueo.detalle && (
            <div className="text-xs text-foreground/70 truncate">
              {bloqueo.tipo === 'clase' ? 'Alumnos: ' : ''}{bloqueo.detalle}
            </div>
          )}
          {bloqueo.staff?.length > 0 && (
            <div className="text-[11px] text-foreground/70 truncate">Staff: {bloqueo.staff.join(', ')}</div>
          )}
          {bloqueo.profesor?.whatsapp && waLink(bloqueo.profesor.whatsapp) && (
            <a href={waLink(bloqueo.profesor.whatsapp)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-purple-300 hover:underline">
              <MessageCircle className="w-3 h-3 shrink-0" /> Prof. {bloqueo.profesor.nombre} · {bloqueo.profesor.whatsapp}
            </a>
          )}
        </div>
      ) : isOcupado && slot.isFirstOfBooking && slot.booking ? (
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
                  <button type="button" disabled={!onCorrectNoShow}
                    onClick={e => { e.stopPropagation(); onCorrectNoShow?.(slot.booking_id); }}
                    title={onCorrectNoShow ? 'Click para volver a Asistido' : 'No asistió'}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-[filter,transform] duration-150 enabled:hover:brightness-110 enabled:active:scale-[0.96] disabled:cursor-default"
                    style={S.badge}>
                    <XCircle className="w-3 h-3" /> No asistió
                  </button>
                </>
              ) : (
                <>
                  {/* Badge de estado: amarillo (asignado) / verde (asistido) / ámbar (pendiente) */}
                  {puedeMarcarAusencia && onNoShow ? (
                    <button type="button" onClick={e => { e.stopPropagation(); onNoShow(slot.booking_id); }}
                      title="Click para marcar No asistió"
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.96]"
                      style={S.badge}>
                      <CheckCircle className="w-3 h-3" /> {S.label}
                    </button>
                  ) : (
                    <button type="button" disabled onClick={e => e.stopPropagation()}
                      title={isPendiente ? 'Solicitud pendiente de confirmación' : 'Pasa a Asistido automáticamente al iniciar el turno'}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full cursor-default" style={S.badge}>
                      {isAsistido ? <CheckCircle className="w-3 h-3" /> : isPendiente ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {S.label}
                    </button>
                  )}

                  {/* Cobrado */}
                  {isCobrado && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgb(var(--success) / 0.2)', color: 'rgb(var(--success))', border: '1px solid rgb(var(--success) / 0.4)' }}>
                      <DollarSign className="w-3 h-3" /> Cobrado
                    </span>
                  )}

                  {/* Confirmar — solo para reservas pendientes (solicitudes web) */}
                  {isPendiente && onConfirm && (
                    <button
                      onClick={e => { e.stopPropagation(); onConfirm(slot.booking_id); }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all duration-150"
                      style={{ background: 'rgb(var(--success) / 0.15)', color: 'rgb(var(--success))', border: '1px solid rgb(var(--success) / 0.30)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgb(var(--success) / 0.25)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgb(var(--success) / 0.15)'}
                      title="Confirmar este turno"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Confirmar
                    </button>
                  )}


                  {/* Cancelar — solo con permiso (onCancel) y si el turno NO empezó */}
                  {/* Cancelar: solo antes de que empiece el turno */}
                  {onCancel && !isCobrado && !empezo && (
                    <button
                      onClick={e => { e.stopPropagation(); onCancel(slot.booking_id); }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all duration-150"
                      style={{ background: 'rgb(var(--danger) / 0.12)', color: 'rgb(var(--danger))', border: '1px solid rgb(var(--danger) / 0.25)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgb(var(--danger) / 0.22)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgb(var(--danger) / 0.12)'}
                      title="Cancelar el turno (se avisa al cliente por WhatsApp)"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancelar turno
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Entrenamiento de escuela (turno fijo de la escuela) */}
          {slot.escuela && (
            <div className="flex items-center gap-1.5 pl-5 mb-1 text-xs text-sky-300 min-w-0">
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {slot.escuela.escuela}{slot.escuela.categoria ? ` · ${slot.escuela.categoria}` : ''}
                {slot.escuela.entrenadores?.length > 0 && <span className="text-foreground/70"> · Prof. {slot.escuela.entrenadores.join(', ')}</span>}
              </span>
            </div>
          )}

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
                  style={{ background: 'rgb(var(--success) / 0.12)', color: 'rgb(var(--success))', border: '1px solid rgb(var(--success) / 0.25)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgb(var(--success) / 0.22)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgb(var(--success) / 0.12)'}
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
            {/* Modalidad de pago: offline pendiente / seña o total online */}
            {(() => {
              const b = slot.booking;
              const pagadoOnline = b.mp_payment_id && b.estado === 'confirmado' ? Number(b.monto_pagado) || 0 : 0;
              let txt = null, cls = '';
              if (b.estado === 'pendiente_pago') { txt = `Esperando pago online (${b.tipo_pago === 'seña' ? 'seña' : 'total'})`; cls = 'bg-amber-500/15 text-amber-300'; }
              else if (pagadoOnline > 0 && pagadoOnline < Number(b.monto)) { txt = `Seña online · saldo $${(Number(b.monto) - pagadoOnline).toLocaleString('es-AR')}`; cls = 'bg-sky-500/15 text-sky-300'; }
              else if (pagadoOnline > 0) { txt = 'Pagado online'; cls = 'bg-green-500/15 text-green-300'; }
              else if (b.tipo_pago === 'complejo' && !b.cobrado) { txt = 'Paga en el complejo'; cls = 'bg-muted text-foreground/70'; }
              return txt && <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{txt}</span>;
            })()}
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
                <span className="text-xs text-muted-foreground">Horario pasado</span>
              </div>
            )}
            {isSecondary && (
              <span className="text-xs italic" style={{ color: 'rgb(var(--danger) / 0.45)' }}>continuación</span>
            )}
          </div>

          {/* Badge libre */}
          {isLibre && !isPast && (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgb(var(--success) / 0.15)', color: 'rgb(var(--success))', border: '1px solid rgb(var(--success) / 0.25)' }}>
              Libre
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}
