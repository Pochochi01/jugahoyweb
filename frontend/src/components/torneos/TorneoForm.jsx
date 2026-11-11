import { useState, useEffect } from 'react';
import { GENEROS, TIPO_TORNEO, errMsg, categoriasDe } from '../../utils/torneos';
import { CategoriasMultiSelect } from './CategoriasSelect';
import FormatoRelampago from './FormatoRelampago';

const INICIAL = {
  deporte: 'padel', tipo: 'unico', tercer_set: 'set', formato: 'tradicional', formato_partidos: null,
  nombre: '', descripcion: '', liga_id: '', categorias: [], genero: 'masculino', fecha_inicio: '', fecha_fin: '',
  cupo_parejas: 16, precio_inscripcion: 0, parejas_por_zona: 3, clasifican_por_zona: 2,
  duracion_partido: 90, descanso_minimo: 60,
};

// Fuera del componente: si se define adentro, React remonta los inputs en cada tecla.
const Campo = ({ label, children }) => (
  <label className="block">
    <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
    {children}
  </label>
);

/**
 * Alta / edición de los datos de un torneo. `bloqueado` = fixture armado.
 * Los torneos son exclusivos de pádel: no hay selector de deporte, se envía
 * siempre deporte='padel' (el backend lo exige igual).
 * Liga obligatoria (una por torneo) y una o varias categorías (cada una arma su cuadro).
 * `svc` (torneosStaff) se usa para cargar las ligas del club.
 */
export default function TorneoForm({ initial, onSave, onCancel, bloqueado = false, svc }) {
  const [f, setF] = useState(() => ({ ...INICIAL, ...initial, deporte: 'padel', liga_id: initial?.liga_id || '', categorias: categoriasDe(initial) }));
  const [ligas, setLigas] = useState(null);
  useEffect(() => { svc?.ligas().then(setLigas).catch(() => setLigas([])); }, [svc]);
  // Categorías que ya tienen fixture no se pueden quitar
  const bloqueadas = (initial?.categorias || []).filter(c => c.estado && c.estado !== 'pendiente').map(c => c.categoria_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const num = (k) => (e) => set(k, e.target.value === '' ? '' : Number(e.target.value));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.liga_id) return setError('Elegí la liga del torneo.');
    if (!f.categorias.length) return setError('Elegí al menos una categoría.');
    setSaving(true); setError('');
    const { liga, ...datos } = f;   // liga (objeto) viene del backend; se envía liga_id
    if (datos.formato !== 'relampago') delete datos.formato_partidos;
    try { await onSave({ ...datos, liga_id: Number(f.liga_id), categorias: f.categorias, deporte: 'padel' }); } catch (err) { setError(errMsg(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Campo label="Liga *">
          <select className="input" value={f.liga_id} disabled={bloqueado || initial?.puntos_asignados} onChange={e => set('liga_id', e.target.value)} required>
            <option value="">{ligas === null ? 'Cargando ligas…' : ligas.length ? 'Elegí la liga' : 'No hay ligas: creá una en "Ligas"'}</option>
            {(ligas || []).filter(l => l.estado === 'activa' || l.id === Number(f.liga_id)).map(l => <option key={l.id} value={l.id}>{l.nombre}{l.estado === 'inactiva' ? ' (inactiva)' : ''}</option>)}
          </select>
        </Campo>
        <Campo label="Categorías *">
          <CategoriasMultiSelect value={f.categorias} onChange={v => set('categorias', v)} bloqueadas={bloqueadas} />
        </Campo>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Campo label="Nombre del torneo"><input className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} required /></Campo>
          <span className="badge-green mb-2.5" title="Los torneos son exclusivos de pádel">Pádel</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Tipo de torneo">
            <select className="input" value={f.tipo} disabled={bloqueado} onChange={e => set('tipo', e.target.value)}>
              {Object.entries(TIPO_TORNEO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Campo>
          <Campo label="Formato de partidos">
            <select className="input" value={f.formato} disabled={bloqueado} onChange={e => set('formato', e.target.value)}>
              <option value="tradicional">Tradicional</option>
              <option value="relampago">Relámpago</option>
            </select>
          </Campo>
        </div>
        {/* Tradicional: 3er set. Relámpago: el formato de cada fase lo define el organizador (sin 3er set ni súper TB preconfigurados) */}
        {f.formato !== 'relampago' && (
          <Campo label="3er set">
            <select className="input" value={f.tercer_set} disabled={bloqueado} onChange={e => set('tercer_set', e.target.value)}>
              <option value="set">Set completo</option>
              <option value="super_tiebreak">Súper tie-break (a 10)</option>
            </select>
          </Campo>
        )}
        {f.formato === 'relampago' && <FormatoRelampago value={f.formato_partidos} onChange={v => set('formato_partidos', v)} />}
        <p className="md:col-span-2 -mt-2 text-[11px] text-muted-foreground">
          {TIPO_TORNEO[f.tipo]?.hint}. {f.tipo === 'anual' && 'Los puntos de cada pareja salen del ranking anual de la liga y la categoría en la que juega (suma de ambos jugadores); al finalizar cada categoría se suman en esa misma liga y categoría.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Género">
            <select className="input" value={f.genero} disabled={bloqueado} onChange={e => set('genero', e.target.value)}>
              {Object.entries(GENEROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Desde"><input type="date" className="input" value={f.fecha_inicio} disabled={bloqueado} onChange={e => set('fecha_inicio', e.target.value)} required /></Campo>
          <Campo label="Hasta"><input type="date" className="input" value={f.fecha_fin} disabled={bloqueado} onChange={e => set('fecha_fin', e.target.value)} required /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Cupo (parejas)"><input type="number" min="2" className="input" value={f.cupo_parejas} onChange={num('cupo_parejas')} /></Campo>
          <Campo label="Inscripción ($ por pareja)"><input type="number" min="0" className="input" value={f.precio_inscripcion} onChange={num('precio_inscripcion')} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Parejas por zona"><input type="number" min="2" max="6" className="input" value={f.parejas_por_zona} disabled={bloqueado} onChange={num('parejas_por_zona')} /></Campo>
          <Campo label="Clasifican por zona"><input type="number" min="1" max="4" className="input" value={f.clasifican_por_zona} disabled={bloqueado} onChange={num('clasifican_por_zona')} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Duración partido (min)"><input type="number" min="30" max="180" step="15" className="input" value={f.duracion_partido} disabled={bloqueado} onChange={num('duracion_partido')} /></Campo>
          <Campo label="Descanso mínimo (min)"><input type="number" min="0" step="15" className="input" value={f.descanso_minimo} onChange={num('descanso_minimo')} /></Campo>
        </div>
      </div>
      <Campo label="Descripción / reglamento"><textarea className="input min-h-[80px]" value={f.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /></Campo>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        {onCancel && <button type="button" className="btn-outline" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
