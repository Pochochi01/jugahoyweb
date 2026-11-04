import { useState, useEffect } from 'react';
import { Search, UserCheck } from 'lucide-react';
import HorariosEditor from './HorariosEditor';
import { CATEGORIAS, catLabel, catNombre, categoriasDe, errMsg } from '../../utils/torneos';

const JUGADOR = { nombre: '', dni: '', whatsapp: '', email: '', categoria: '', genero: '' };

/**
 * Formulario de inscripción de una pareja (categoría del torneo en la que juega,
 * datos personales, categoría y género de cada jugador y horarios preferidos).
 * `onSubmit(data)` debe devolver una promesa.
 * `extra` permite agregar campos del organizador (p. ej. "ya pagó").
 * Con `svc` (panel del club) se puede elegir cada jugador del registro del club:
 * se listan TODOS, también los que tienen 0 puntos, con su categoría, puntos y liga.
 */
export default function InscripcionForm({ torneo, onSubmit, submitLabel = 'Inscribir pareja', extra, svc, categoriaInicial }) {
  const cats = categoriasDe(torneo);
  const abiertas = (torneo.categorias || []).filter(c => !c.estado || c.estado === 'pendiente' || svc).map(c => c.categoria_id);
  const opciones = abiertas.length ? abiertas : cats;
  const generoFijo = torneo.genero === 'mixto' ? ['masculino', 'femenino'] : [torneo.genero, torneo.genero];
  const [categoria, setCategoria] = useState(() => (opciones.includes(categoriaInicial) ? categoriaInicial : (opciones.length === 1 ? opciones[0] : '')));
  const [jugadores, setJugadores] = useState(generoFijo.map(g => ({ ...JUGADOR, genero: g })));
  const [horarios, setHorarios] = useState([{ fecha: null, desde: '18:00', hasta: '23:00' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setJ = (i, k, v) => setJugadores(js => js.map((j, x) => (x === i ? { ...j, [k]: v } : j)));
  // Se juega la categoría propia o una superior (número menor), nunca una inferior
  const categoriasValidas = CATEGORIAS.filter(c => c >= (Number(categoria) || Math.min(...cats)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!categoria) return setError('Elegí la categoría en la que juega la pareja.');
    for (const [i, j] of jugadores.entries()) {
      if (!j.nombre.trim() || !j.dni || !j.whatsapp || !j.categoria) return setError(`Completá los datos del jugador ${i + 1}.`);
    }
    if (!horarios.length) return setError('Indicá al menos un horario en el que puedan jugar.');
    setSaving(true);
    try {
      await onSubmit({ categoria_id: Number(categoria), jugadores: jugadores.map(j => ({ ...j, categoria: Number(j.categoria) })), horarios_preferidos: horarios });
    } catch (err) {
      setError(errMsg(err));
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card space-y-2">
        <label className="block">
          <span className="font-semibold text-sm">Categoría en la que juega la pareja *</span>
          <select className="input mt-1" value={categoria} onChange={e => setCategoria(Number(e.target.value) || '')} disabled={opciones.length === 1}>
            {opciones.length > 1 && <option value="">Elegí la categoría</option>}
            {opciones.map(c => <option key={c} value={c}>{catNombre(c)}</option>)}
          </select>
        </label>
        {torneo.liga?.nombre && <p className="text-xs text-muted-foreground">Liga: {torneo.liga.nombre}. Los puntos se suman en esta liga y categoría.</p>}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {jugadores.map((j, i) => (
          <fieldset key={i} className="card space-y-3">
            <legend className="font-semibold text-sm px-1">Jugador {i + 1}</legend>
            {svc && <BuscarJugador svc={svc} torneo={torneo} categoria={categoria} genero={j.genero}
              onElegir={(r) => setJugadores(js => js.map((x, k) => (k === i ? { ...x, nombre: r.nombre, dni: r.dni, whatsapp: r.whatsapp || x.whatsapp, email: r.email || '', categoria: r.categoria_actual && r.categoria_actual >= (Number(categoria) || 1) ? r.categoria_actual : x.categoria } : x)))} />}
            <input className="input" placeholder="Nombre y apellido" value={j.nombre} onChange={e => setJ(i, 'nombre', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="numeric" placeholder="DNI" value={j.dni} onChange={e => setJ(i, 'dni', e.target.value)} />
              <select className="input" value={j.categoria} onChange={e => setJ(i, 'categoria', e.target.value)} aria-label="Categoría del jugador">
                <option value="">Categoría</option>
                {categoriasValidas.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <input className="input" inputMode="tel" placeholder="WhatsApp (ej. 5493811234567)" value={j.whatsapp} onChange={e => setJ(i, 'whatsapp', e.target.value)} />
            <input className="input" type="email" placeholder="Email (opcional)" value={j.email} onChange={e => setJ(i, 'email', e.target.value)} />
            <select className="input" value={j.genero} disabled={torneo.genero !== 'mixto'} onChange={e => setJ(i, 'genero', e.target.value)}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </fieldset>
        ))}
      </div>

      <div className="card space-y-2">
        <div className="font-semibold text-sm">¿Cuándo pueden jugar?</div>
        <p className="text-xs text-muted-foreground">
          Armamos los partidos dentro de estas franjas siempre que haya cancha libre. Cuanto más amplias, más fácil programar.
        </p>
        <HorariosEditor value={horarios} onChange={setHorarios} fechaInicio={torneo.fecha_inicio} fechaFin={torneo.fecha_fin} compact />
      </div>

      {extra}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary w-full md:w-auto">
        {saving ? 'Enviando…' : submitLabel}
      </button>
    </form>
  );
}

/**
 * Buscador de jugadores registrados del club: muestra TODOS (con 0 puntos también),
 * con su categoría actual y sus puntos en la liga + categoría del torneo.
 */
function BuscarJugador({ svc, torneo, categoria, genero, onElegir }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState(null);
  const temporada = Number(String(torneo.fecha_inicio || '').slice(0, 4)) || new Date().getFullYear();
  useEffect(() => {
    if (q.trim().length < 2) { setLista(null); return undefined; }
    const t = setTimeout(() => {
      svc.jugadores({ q: q.trim(), liga_id: torneo.liga_id, categoria_id: categoria || undefined, genero: torneo.genero, temporada, limite: 15 })
        .then(setLista).catch(() => setLista([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, svc, torneo.liga_id, torneo.genero, categoria, temporada]);
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="input !pl-9 text-sm" placeholder="Buscar jugador registrado (nombre o DNI)" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar jugador registrado" />
      </div>
      {lista && (
        <ul className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto text-sm">
          {lista.length === 0 && <li className="px-3 py-2 text-muted-foreground">Sin coincidencias: cargalo a mano abajo.</li>}
          {lista.filter(r => !r.genero || torneo.genero === 'mixto' || r.genero === genero).map(r => (
            <li key={r.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2" onClick={() => { onElegir(r); setQ(''); setLista(null); }}>
                <UserCheck className="w-4 h-4 text-primary shrink-0" />
                <span className="min-w-0 flex-1 truncate">{r.nombre} <span className="text-xs text-muted-foreground">· DNI {r.dni}</span></span>
                <span className="text-xs text-muted-foreground shrink-0">{r.categoria_label || 's/cat.'} · <strong className="text-foreground">{r.puntos} pts</strong>{r.liga ? ` · ${r.liga}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
