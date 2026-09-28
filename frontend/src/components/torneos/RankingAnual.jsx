import { useState, useEffect, useCallback } from 'react';
import { Trash2, Pencil, Plus } from 'lucide-react';
import { CATEGORIAS, catLabel, GENEROS, errMsg } from '../../utils/torneos';

const VACIO = { dni: '', nombre: '', puntos: '' };

/**
 * Ranking anual del club por temporada + categoría + género.
 * Es la base de los cabezas de serie en torneos 'anual': la pareja suma los
 * puntos de sus dos jugadores. Se actualiza solo al finalizar cada torneo
 * anual; acá se consulta y se ajusta a mano.
 */
export default function RankingAnual({ svc }) {
  const [f, setF] = useState({ temporada: new Date().getFullYear(), categoria: 6, genero: 'masculino' });
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => svc.ranking_list(f).then(setData).catch(e => setError(errMsg(e))), [svc, f]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault(); setError('');
    try { await svc.ranking_upsert({ ...f, ...form, puntos: Number(form.puntos) }); setForm(null); cargar(); }
    catch (err) { setError(errMsg(err)); }
  };
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="number" className="input !w-24 text-sm" value={f.temporada} onChange={e => setF(x => ({ ...x, temporada: Number(e.target.value) }))} aria-label="Temporada" />
        <select className="input !w-auto text-sm" value={f.categoria} onChange={e => setF(x => ({ ...x, categoria: Number(e.target.value) }))}>
          {CATEGORIAS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
        <select className="input !w-auto text-sm" value={f.genero} onChange={e => setF(x => ({ ...x, genero: e.target.value }))}>
          {Object.entries(GENEROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {!form && <button className="btn-primary text-sm ml-auto flex items-center gap-1" onClick={() => setForm(VACIO)}><Plus className="w-4 h-4" /> Jugador</button>}
      </div>

      {data?.puntos_por_instancia && (
        <p className="text-xs text-muted-foreground">
          Al finalizar cada torneo anual, cada jugador suma según hasta dónde llegó:{' '}
          {Object.entries(data.puntos_por_instancia).map(([k, v]) => `${k} ${v}`).join(' · ')}.
        </p>
      )}

      {form && (
        <form onSubmit={guardar} className="card grid sm:grid-cols-[1fr_2fr_1fr_auto] gap-2 items-center">
          <input className="input" inputMode="numeric" placeholder="DNI" value={form.dni} disabled={Boolean(form.id)} onChange={e => set('dni', e.target.value)} required />
          <input className="input" placeholder="Nombre y apellido" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
          <input className="input" type="number" min="0" placeholder="Puntos" value={form.puntos} onChange={e => set('puntos', e.target.value)} required />
          <div className="flex gap-1">
            <button className="btn-primary text-sm">Guardar</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground text-left">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Jugador</th><th className="px-3 py-2">DNI</th><th className="px-3 py-2 text-right">Puntos</th><th /></tr>
          </thead>
          <tbody>
            {data?.jugadores?.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sin jugadores en este ranking.</td></tr>
            )}
            {data?.jugadores?.map(j => (
              <tr key={j.id} className="border-t border-border">
                <td className="px-3 py-2">{j.posicion}</td>
                <td className="px-3 py-2 font-medium">{j.nombre}</td>
                <td className="px-3 py-2 text-muted-foreground">{j.dni}</td>
                <td className="px-3 py-2 text-right font-bold text-primary">{j.puntos}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm({ id: j.id, dni: j.dni, nombre: j.nombre, puntos: j.puntos })}><Pencil className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Quitar"
                    onClick={async () => { if (confirm(`¿Quitar a ${j.nombre} del ranking?`)) { await svc.ranking_delete(j.id); cargar(); } }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
