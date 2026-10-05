import { useState } from 'react';
import { CATEGORIAS, catLabel, GENEROS, TIPO_TORNEO, DEPORTES_TORNEO, errMsg } from '../../utils/torneos';

const INICIAL = {
  deporte: 'padel', tipo: 'unico', tercer_set: 'set',
  nombre: '', descripcion: '', categoria: 6, genero: 'masculino', fecha_inicio: '', fecha_fin: '',
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

const DEPORTE_TXT = { futbol: 'fútbol', padel: 'pádel', tenis: 'tenis', basquet: 'básquet', voley: 'vóley', squash: 'squash', otro: 'otros deportes' };
export const mensajeSinDeporte = (d) => `El complejo no tiene canchas de ${DEPORTE_TXT[d] || d}, no puede organizar torneos de ${DEPORTE_TXT[d] || d}.`;

/**
 * Alta / edición de los datos de un torneo. `bloqueado` = fixture armado.
 * `deportes` = deportes con canchas habilitadas en el complejo ([{ value, label }]):
 * el desplegable solo ofrece esos. Al editar un torneo cuyo deporte ya no tiene
 * canchas, se muestra igual (marcado) para no cambiarlo sin querer.
 */
export default function TorneoForm({ initial, onSave, onCancel, bloqueado = false, deportes = null }) {
  const disponibles = deportes ? deportes.map(d => d.value) : Object.keys(DEPORTES_TORNEO);
  const [f, setF] = useState(() => ({ ...INICIAL, deporte: disponibles[0] || INICIAL.deporte, ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const num = (k) => (e) => set(k, e.target.value === '' ? '' : Number(e.target.value));

  const sinCanchas = deportes && !disponibles.includes(f.deporte);
  const submit = async (e) => {
    e.preventDefault();
    // Misma regla que el backend: solo deportes con canchas en el complejo
    if (sinCanchas && f.deporte !== initial?.deporte) { setError(mensajeSinDeporte(f.deporte)); return; }
    setSaving(true); setError('');
    try { await onSave(f); } catch (err) { setError(errMsg(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      {deportes && deportes.length === 0 && (
        <div className="alert-error" role="alert">El complejo no tiene canchas habilitadas: cargá o habilitá una en Configuración para organizar torneos.</div>
      )}
      {deportes && deportes.length > 0 && !bloqueado && (
        <p className="hint !mt-0">Deportes disponibles según tus canchas: {deportes.map(d => DEPORTES_TORNEO[d.value] || d.value).join(', ')}.</p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Campo label="Nombre del torneo"><input className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} required /></Campo>
          <Campo label="Deporte">
            <select className="input" value={f.deporte} disabled={bloqueado || (deportes && !deportes.length)}
              onChange={e => { set('deporte', e.target.value); setError(''); }}
              aria-invalid={sinCanchas && f.deporte !== initial?.deporte ? true : undefined}>
              {disponibles.map(k => <option key={k} value={k}>{DEPORTES_TORNEO[k] || k}</option>)}
              {sinCanchas && <option value={f.deporte}>{DEPORTES_TORNEO[f.deporte] || f.deporte} (sin canchas habilitadas)</option>}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Tipo de torneo">
            <select className="input" value={f.tipo} disabled={bloqueado} onChange={e => set('tipo', e.target.value)}>
              {Object.entries(TIPO_TORNEO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Campo>
          <Campo label="3er set">
            <select className="input" value={f.tercer_set} disabled={bloqueado} onChange={e => set('tercer_set', e.target.value)}>
              <option value="set">Set completo</option>
              <option value="super_tiebreak">Súper tie-break (a 10)</option>
            </select>
          </Campo>
        </div>
        <p className="md:col-span-2 -mt-2 text-[11px] text-muted-foreground">
          {TIPO_TORNEO[f.tipo]?.hint}. {f.tipo === 'anual' && 'Los puntos de cada pareja salen del ranking anual (suma de ambos jugadores) y al finalizar se suman los nuevos.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Categoría">
            <select className="input" value={f.categoria} disabled={bloqueado} onChange={num('categoria')}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select>
          </Campo>
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
