import TimeSlotCard from './TimeSlotCard';
import { CalendarX } from 'lucide-react';

function horaToLogicalMin(hora) {
  const [h, m] = hora.split(':').map(Number);
  const min = h * 60 + m;
  return h < 8 ? min + 1440 : min;
}

const GRUPOS = [
  { label: 'Mañana',    emoji: '🌅', minStart: 480,  minEnd: 720,  note: null },
  { label: 'Tarde',     emoji: '☀️',  minStart: 720,  minEnd: 1080, note: null },
  { label: 'Noche',     emoji: '🌙', minStart: 1080, minEnd: 1440, note: null },
  { label: 'Madrugada', emoji: '🌃', minStart: 1440, minEnd: 1560, note: 'día siguiente' },
];

export default function TimeSlotList({ slots, loading, onSelect, onCancel }) {
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Cargando horarios...</p>
    </div>
  );

  if (!slots || slots.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <CalendarX className="w-12 h-12 opacity-20" />
      <p className="text-sm">No hay horarios configurados para esta cancha.</p>
    </div>
  );

  let globalIndex = 0;

  return (
    <div className="space-y-7">
      {GRUPOS.map(grupo => {
        const grupoSlots = slots.filter(s => {
          const lm = horaToLogicalMin(s.hora);
          return lm >= grupo.minStart && lm < grupo.minEnd;
        });
        if (grupoSlots.length === 0) return null;

        const libres   = grupoSlots.filter(s => s.estado === 'libre' && !s.past).length;
        const ocupados = grupoSlots.filter(s => s.isFirstOfBooking).length;

        return (
          <div key={grupo.label}>
            {/* ── Cabecera del grupo ── */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">{grupo.emoji}</span>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/35">
                {grupo.label}
              </h4>
              {grupo.note && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
                  {grupo.note}
                </span>
              )}
              {/* Línea separadora */}
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              {/* Contadores */}
              <div className="flex items-center gap-3 text-xs">
                {libres > 0 && (
                  <span style={{ color: 'rgba(74,222,128,0.7)' }}>
                    {libres} libre{libres !== 1 ? 's' : ''}
                  </span>
                )}
                {ocupados > 0 && (
                  <span style={{ color: 'rgba(248,113,113,0.7)' }}>
                    {ocupados} reserva{ocupados !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* ── Slots ── */}
            <div className="space-y-1.5">
              {grupoSlots.map(slot => {
                const idx = globalIndex++;
                return (
                  <TimeSlotCard
                    key={slot.hora}
                    slot={slot}
                    index={idx}
                    onSelect={onSelect}
                    onCancel={onCancel}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
