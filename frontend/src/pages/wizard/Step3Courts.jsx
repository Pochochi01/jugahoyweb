import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const DEPORTES = ['futbol', 'padel', 'tenis', 'basquet', 'voley', 'otro'];
const PISOS = ['cesped_sintetico', 'cemento', 'parquet', 'tierra', 'otro'];

const emptyCancha = () => ({ nombre: '', deporte: 'futbol', piso: 'cesped_sintetico', dimensiones: '', duracion_turno: 60, techada: false, precio_base: '' });

export default function Step3Courts({ onNext, onBack, initial }) {
  const [courts, setCourts] = useState(initial?.length ? initial : [emptyCancha()]);

  const update = (i, key, val) => setCourts(cs => cs.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  const add = () => setCourts(cs => [...cs, emptyCancha()]);
  const remove = (i) => setCourts(cs => cs.filter((_, idx) => idx !== i));

  const handleSubmit = (e) => { e.preventDefault(); onNext(courts); };

  return (
    <div className="card" data-aos="fade-up">
      <h2 className="text-xl font-bold mb-1">Paso 3: Canchas</h2>
      <p className="text-muted-foreground text-sm mb-6">Configurá las canchas de tu complejo</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        {courts.map((c, i) => (
          <div key={i} className="border border-border rounded-xl p-4 relative">
            {courts.length > 1 && (
              <button type="button" onClick={() => remove(i)} className="absolute top-3 right-3 text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <div className="font-medium text-sm mb-3 text-primary">Cancha {i + 1}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label text-xs">Nombre</label><input className="input text-sm" required value={c.nombre} onChange={e => update(i, 'nombre', e.target.value)} /></div>
              <div>
                <label className="label text-xs">Deporte</label>
                <select className="input text-sm" value={c.deporte} onChange={e => update(i, 'deporte', e.target.value)}>
                  {DEPORTES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Piso</label>
                <select className="input text-sm" value={c.piso} onChange={e => update(i, 'piso', e.target.value)}>
                  {PISOS.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div><label className="label text-xs">Dimensiones</label><input className="input text-sm" placeholder="20x40" value={c.dimensiones} onChange={e => update(i, 'dimensiones', e.target.value)} /></div>
              <div><label className="label text-xs">Duración turno (min)</label><input type="number" className="input text-sm" value={c.duracion_turno} onChange={e => update(i, 'duracion_turno', parseInt(e.target.value))} /></div>
              <div><label className="label text-xs">Precio base ($)</label><input type="number" className="input text-sm" value={c.precio_base} onChange={e => update(i, 'precio_base', e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={c.techada} onChange={e => update(i, 'techada', e.target.checked)} className="accent-primary" />
              <span className="text-sm">Cancha techada</span>
            </label>
          </div>
        ))}
        <button type="button" onClick={add} className="w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Agregar cancha
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="btn-outline flex-1">← Atrás</button>
          <button type="submit" className="btn-primary flex-1">Siguiente →</button>
        </div>
      </form>
    </div>
  );
}
