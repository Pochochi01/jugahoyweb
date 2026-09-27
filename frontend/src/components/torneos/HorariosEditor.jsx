import { Plus, X } from 'lucide-react';
import { diasTorneo, fechaCorta } from '../../utils/torneos';

/**
 * Editor de franjas horarias [{ fecha: 'YYYY-MM-DD' | null, desde, hasta }].
 * Se usa para la disponibilidad de canchas y para los horarios preferidos de
 * una pareja. fecha null = "todos los días del torneo".
 */
export default function HorariosEditor({ value = [], onChange, fechaInicio, fechaFin, compact = false }) {
  const dias = diasTorneo(fechaInicio, fechaFin);
  const set = (i, k, v) => onChange(value.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const add = () => onChange([...value, { fecha: null, desde: compact ? '18:00' : '09:00', hasta: compact ? '23:00' : '22:00' }]);
  const del = (i) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      {value.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select className="input !w-auto text-sm" value={f.fecha || ''} onChange={e => set(i, 'fecha', e.target.value || null)}>
            <option value="">Todos los días</option>
            {dias.map(d => <option key={d} value={d}>{fechaCorta(d)}</option>)}
          </select>
          <input type="time" className="input !w-auto text-sm" value={f.desde} onChange={e => set(i, 'desde', e.target.value)} />
          <span className="text-muted-foreground text-sm">a</span>
          <input type="time" className="input !w-auto text-sm" value={f.hasta} onChange={e => set(i, 'hasta', e.target.value)} />
          <button type="button" onClick={() => del(i)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded" aria-label="Quitar franja">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-sm text-primary flex items-center gap-1 hover:underline">
        <Plus className="w-4 h-4" /> Agregar franja
      </button>
    </div>
  );
}
