import { ChevronLeft, ChevronRight } from 'lucide-react';

export const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const sumarDias = (f, n) => {
  const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const inicioSemana = (f = hoy()) => sumarDias(f, -((new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7)); // lunes
const etiquetaDia = (f) => {
  const d = new Date(`${f}T12:00:00Z`);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

/** Navegación semanal ◀ semana ▶ */
export function SemanaNav({ desde, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button className="p-2 rounded-lg hover:bg-muted" onClick={() => onChange(sumarDias(desde, -7))} aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-sm font-medium min-w-[150px] text-center">{etiquetaDia(desde)} – {etiquetaDia(sumarDias(desde, 6))}</span>
      <button className="p-2 rounded-lg hover:bg-muted" onClick={() => onChange(sumarDias(desde, 7))} aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
      <button className="text-xs text-primary hover:underline ml-1" onClick={() => onChange(inicioSemana())}>Hoy</button>
    </div>
  );
}

/**
 * Grilla día × hora.
 *  - ocupados:    clases [{ id, fecha, hora_inicio, hora_fin, cancha, club, alumnos }]
 *  - disponibles: turnos libres [{ fecha, hora_inicio, field_id, cancha }] (opcional)
 *  - onLibre(slot) / onClase(clase): clicks (opcionales)
 *  - mostrarClub: muestra el club en cada clase (vista consolidada)
 */
export default function GrillaSemanal({ dias, ocupados = [], disponibles = [], onLibre, onClase, mostrarClub = false }) {
  const horaDe = (h) => `${h.slice(0, 2)}:00`;
  const horas = [...new Set([...ocupados, ...disponibles].map(x => horaDe(x.hora_inicio)))].sort();
  const hoyStr = hoy();

  if (!horas.length) {
    return <div className="card text-sm text-muted-foreground text-center py-8">Sin horarios habilitados ni clases en esta semana.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs border-collapse min-w-[760px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card w-14 p-2 text-muted-foreground font-medium border-b border-border">Hora</th>
            {dias.map(d => (
              <th key={d} className={`p-2 font-medium border-b border-l border-border ${d === hoyStr ? 'text-primary' : ''}`}>{etiquetaDia(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horas.map(h => (
            <tr key={h}>
              <td className="sticky left-0 bg-card p-2 text-muted-foreground font-mono border-t border-border align-top">{h}</td>
              {dias.map(d => {
                const clases = ocupados.filter(c => c.fecha === d && horaDe(c.hora_inicio) === h);
                const libres = disponibles.filter(s => s.fecha === d && s.hora_inicio === h);
                return (
                  <td key={d} className="p-1 border-t border-l border-border align-top space-y-1">
                    {clases.map(c => (
                      <button key={c.id} type="button" onClick={() => onClase?.(c)} disabled={!onClase}
                        className="w-full text-left rounded-md px-2 py-1 bg-primary/15 border border-primary/40 hover:bg-primary/25 transition-colors">
                        <div className="font-semibold truncate">{c.alumnos?.map(a => a.nombre).join(', ')}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.hora_inicio}–{c.hora_fin} · {c.cancha}</div>
                        {mostrarClub && <div className="text-[10px] text-primary truncate">{c.club}</div>}
                      </button>
                    ))}
                    {libres.map(s => (
                      <button key={s.field_id} type="button" onClick={() => onLibre?.(s)} disabled={!onLibre}
                        className="w-full text-left rounded-md px-2 py-1 border border-dashed border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">
                        Libre · <span className="truncate">{s.cancha}</span>
                      </button>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
