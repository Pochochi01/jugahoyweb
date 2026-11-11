import { useState, useEffect, useRef } from 'react';
import { UserCheck, AlertTriangle, Sparkles } from 'lucide-react';
import HorariosEditor from './HorariosEditor';
import { CATEGORIAS, catLabel, catNombre, categoriasDe, errMsg } from '../../utils/torneos';

const JUGADOR = { nombre: '', dni: '', whatsapp: '', email: '', categoria: '', genero: '' };
const CAMPOS_BUSCABLES = ['nombre', 'dni', 'whatsapp', 'email'];

/**
 * Formulario de inscripción de una pareja (categoría del torneo en la que juega,
 * datos personales, categoría y género de cada jugador y horarios preferidos).
 * `onSubmit(data)` debe devolver una promesa.
 * `extra` permite agregar campos del organizador (p. ej. "ya pagó").
 *
 * Inscripciones inteligentes:
 *  - Con `svc` (panel del club): al escribir nombre, DNI, email o teléfono se sugieren jugadores
 *    existentes (registro del club y usuarios); al elegir uno se completan todos sus datos, con su
 *    ranking y categoría habitual. El panel puede inscribir sin email / teléfono (administrativo).
 *  - Público: email y teléfono obligatorios.
 *  - El backend autocompleta lo que falte y rechaza duplicados (DNI, email, teléfono): los conflictos
 *    se muestran uno por uno.
 */
export default function InscripcionForm({ torneo, onSubmit, submitLabel = 'Inscribir pareja', extra, svc, categoriaInicial }) {
  const cats = categoriasDe(torneo);
  const abiertas = (torneo.categorias || []).filter(c => !c.estado || c.estado === 'pendiente' || svc).map(c => c.categoria_id);
  const opciones = abiertas.length ? abiertas : cats;
  const generoFijo = torneo.genero === 'mixto' ? ['masculino', 'femenino'] : [torneo.genero, torneo.genero];
  const admin = Boolean(svc);
  const [categoria, setCategoria] = useState(() => (opciones.includes(categoriaInicial) ? categoriaInicial : (opciones.length === 1 ? opciones[0] : '')));
  const [jugadores, setJugadores] = useState(generoFijo.map(g => ({ ...JUGADOR, genero: g })));
  const [horarios, setHorarios] = useState([{ fecha: null, desde: '18:00', hasta: '23:00' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictos, setConflictos] = useState([]);
  const [elegidos, setElegidos] = useState({});   // índice → info del jugador elegido (ranking, categoría habitual)

  const setJ = (i, k, v) => { setConflictos([]); setJugadores(js => js.map((j, x) => (x === i ? { ...j, [k]: v } : j))); };
  // Se juega la categoría propia o una superior (número menor), nunca una inferior
  const categoriasValidas = CATEGORIAS.filter(c => c >= (Number(categoria) || Math.min(...cats)));

  const elegir = (i, r) => {
    const catOk = r.categoria && r.categoria >= (Number(categoria) || 1) ? r.categoria : '';
    setJugadores(js => js.map((x, k) => (k === i ? {
      ...x, nombre: r.nombre, dni: r.dni || x.dni, whatsapp: r.whatsapp || x.whatsapp, email: r.email || x.email,
      categoria: catOk || x.categoria, genero: torneo.genero === 'mixto' && r.genero ? r.genero : x.genero,
    } : x)));
    setElegidos(e => ({ ...e, [i]: r }));
    setConflictos([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setConflictos([]);
    if (!categoria) return setError('Elegí la categoría en la que juega la pareja.');
    for (const [i, j] of jugadores.entries()) {
      if (!j.nombre.trim() || !j.dni || !j.categoria) return setError(`Completá nombre, DNI y categoría del jugador ${i + 1}.`);
      if (!admin && (!j.whatsapp || !j.email)) return setError(`Jugador ${i + 1}: completá ${[!j.email && 'email', !j.whatsapp && 'teléfono'].filter(Boolean).join(' y ')} para finalizar la inscripción.`);
    }
    if (!horarios.length) return setError('Indicá al menos un horario en el que puedan jugar.');
    setSaving(true);
    try {
      await onSubmit({ categoria_id: Number(categoria), jugadores: jugadores.map(j => ({ ...j, categoria: Number(j.categoria) })), horarios_preferidos: horarios });
    } catch (err) {
      setError(errMsg(err));
      if (Array.isArray(err?.conflictos) && err.conflictos.length > 1) setConflictos(err.conflictos.map(c => c.mensaje));
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
            {admin && <p className="text-[11px] text-muted-foreground -mt-1">Escribí nombre, DNI, email o teléfono: te sugerimos jugadores ya cargados.</p>}
            <CampoSugerido svc={svc} torneo={torneo} genero={j.genero} campo="nombre" onElegir={r => elegir(i, r)}
              input={(p) => <input className="input" placeholder="Nombre y apellido *" value={j.nombre} onChange={e => setJ(i, 'nombre', e.target.value)} {...p} />} valor={j.nombre} />
            <div className="grid grid-cols-2 gap-2">
              <CampoSugerido svc={svc} torneo={torneo} genero={j.genero} campo="dni" onElegir={r => elegir(i, r)} valor={j.dni}
                input={(p) => <input className="input" inputMode="numeric" placeholder="DNI *" value={j.dni} onChange={e => setJ(i, 'dni', e.target.value)} {...p} />} />
              <select className="input" value={j.categoria} onChange={e => setJ(i, 'categoria', e.target.value)} aria-label="Categoría del jugador">
                <option value="">Categoría *</option>
                {categoriasValidas.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <CampoSugerido svc={svc} torneo={torneo} genero={j.genero} campo="whatsapp" onElegir={r => elegir(i, r)} valor={j.whatsapp}
              input={(p) => <input className="input" inputMode="tel" placeholder={`WhatsApp (ej. 5493811234567)${admin ? '' : ' *'}`} value={j.whatsapp} onChange={e => setJ(i, 'whatsapp', e.target.value)} {...p} />} />
            <CampoSugerido svc={svc} torneo={torneo} genero={j.genero} campo="email" onElegir={r => elegir(i, r)} valor={j.email}
              input={(p) => <input className="input" type="email" placeholder={admin ? 'Email' : 'Email *'} value={j.email} onChange={e => setJ(i, 'email', e.target.value)} {...p} />} />
            <select className="input" value={j.genero} disabled={torneo.genero !== 'mixto'} onChange={e => setJ(i, 'genero', e.target.value)}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
            {elegidos[i] && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Datos completados de {elegidos[i].origen === 'usuario' ? 'un usuario registrado' : 'la base del club'}
                {elegidos[i].ranking != null && ` · ${elegidos[i].ranking} pts ranking`}{elegidos[i].categoria && ` · habitual ${catLabel(elegidos[i].categoria)}`}
              </p>
            )}
            {admin && (!j.email || !j.whatsapp) && j.nombre && j.dni && (
              <p className="text-[11px] text-amber-400">Sin {[!j.email && 'email', !j.whatsapp && 'teléfono'].filter(Boolean).join(' ni ')}: si existe en la base se completa al guardar.</p>
            )}
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
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
          <div className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>
          {conflictos.length > 1 && <ul className="mt-1 ml-6 list-disc text-xs space-y-0.5">{conflictos.slice(1).map((c, k) => <li key={k}>{c}</li>)}</ul>}
        </div>
      )}
      <button type="submit" disabled={saving} className="btn-primary w-full md:w-auto">
        {saving ? 'Enviando…' : submitLabel}
      </button>
    </form>
  );
}

/**
 * Campo con sugerencias (solo panel): consulta /jugadores/buscar mientras se escribe y muestra
 * jugadores existentes con DNI, contacto, ranking y categoría habitual.
 */
function CampoSugerido({ svc, torneo, genero, campo, valor, onElegir, input }) {
  const [lista, setLista] = useState(null);
  const [foco, setFoco] = useState(false);
  const editado = useRef(false);
  useEffect(() => {
    if (!svc || !editado.current) return undefined;
    const q = String(valor || '').trim();
    const minimo = campo === 'nombre' || campo === 'email' ? 2 : 3;
    if (q.length < minimo) { setLista(null); return undefined; }
    const t = setTimeout(() => svc.buscarJugadores(torneo.id, q).then(setLista).catch(() => setLista([])), 250);
    return () => clearTimeout(t);
  }, [svc, torneo.id, valor, campo]);
  if (!svc) return input({});
  const visibles = (lista || []).filter(r => !r.genero || torneo.genero === 'mixto' || r.genero === genero);
  return (
    <div className="relative">
      {input({
        onFocus: () => setFoco(true),
        onBlur: () => setTimeout(() => setFoco(false), 150),
        onInput: () => { editado.current = true; },
        autoComplete: 'off',
        'aria-autocomplete': 'list',
      })}
      {foco && visibles.length > 0 && CAMPOS_BUSCABLES.includes(campo) && (
        <ul className="absolute z-20 left-0 right-0 mt-1 border border-border rounded-lg bg-background shadow-lg divide-y divide-border max-h-56 overflow-y-auto text-sm" role="listbox">
          {visibles.map(r => (
            <li key={`${r.origen}-${r.jugador_id || r.user_id}`}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted flex items-start gap-2"
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onElegir(r); setLista(null); editado.current = false; }}>
                <UserCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.nombre}{r.origen === 'usuario' && <span className="ml-1 badge-neutral !text-[10px]">usuario</span>}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {[r.dni && `DNI ${r.dni}`, r.whatsapp, r.email].filter(Boolean).join(' · ') || 'sin datos de contacto'}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0 text-right">
                  {r.categoria ? catLabel(r.categoria) : 's/cat.'}{r.ranking != null && <><br /><strong className="text-foreground">{r.ranking} pts</strong></>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
