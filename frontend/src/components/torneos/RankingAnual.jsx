import { useState, useEffect, useCallback } from 'react';
import { ListOrdered, SlidersHorizontal, History, Flag, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { CATEGORIAS, catNombre, GENEROS, errMsg } from '../../utils/torneos';

const ANIO = new Date().getFullYear();
const fechaHora = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const TIPO_AJUSTE = { fijar: 'Fijó', sumar: 'Sumó', restar: 'Restó', torneo: 'Torneo', migracion: 'Migración', baja: 'Quitado' };

/**
 * Ranking anual por LIGA + CATEGORÍA + AÑO (+ género del circuito). Nunca mezcla
 * ligas, categorías ni años: cada combinación es un acumulador propio.
 * `admin` (dueño / admin del club) habilita: ajuste manual con auditoría, historial y ligas.
 */
export default function RankingAnual({ svc, admin = true }) {
  const [vista, setVista] = useState('ranking');
  const [ligas, setLigas] = useState(null);
  const cargarLigas = useCallback(() => svc.ligas().then(setLigas).catch(() => setLigas([])), [svc]);
  useEffect(() => { cargarLigas(); }, [cargarLigas]);
  const VISTAS = [['ranking', 'Ranking', ListOrdered], ...(admin ? [['ajuste', 'Ajuste manual', SlidersHorizontal], ['historial', 'Historial', History], ['ligas', 'Ligas', Flag]] : [])];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap gap-1" role="tablist">
        {VISTAS.map(([k, l, Icon]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${vista === k ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>
      {ligas === null ? <p className="text-sm text-muted-foreground">Cargando…</p>
        : !ligas.length && vista !== 'ligas' ? (
          <div className="card text-sm text-center py-8 space-y-2">
            <p>Todavía no hay ligas. Cada torneo y cada ranking pertenecen a una liga.</p>
            {admin && <button className="btn-primary text-sm" onClick={() => setVista('ligas')}>Crear una liga</button>}
          </div>
        ) : (
          <>
            {vista === 'ranking' && <Ranking svc={svc} ligas={ligas} />}
            {vista === 'ajuste' && <Ajuste svc={svc} ligas={ligas} />}
            {vista === 'historial' && <Historial svc={svc} ligas={ligas} />}
            {vista === 'ligas' && <Ligas svc={svc} ligas={ligas} recargar={cargarLigas} />}
          </>
        )}
    </div>
  );
}

/** Filtros compartidos: liga, categoría, año y género. */
function Filtros({ f, setF, ligas, anios = [] }) {
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const lista = [...new Set([...anios, ANIO, ANIO - 1])].sort((a, b) => b - a);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <label className="text-xs text-muted-foreground">Liga
        <select className="input text-sm" value={f.liga_id} onChange={e => set('liga_id', Number(e.target.value))}>
          {ligas.map(l => <option key={l.id} value={l.id}>{l.nombre}{l.estado === 'inactiva' ? ' (inactiva)' : ''}</option>)}
        </select></label>
      <label className="text-xs text-muted-foreground">Categoría
        <select className="input text-sm" value={f.categoria_id} onChange={e => set('categoria_id', Number(e.target.value))}>
          {[...CATEGORIAS].reverse().map(c => <option key={c} value={c}>{catNombre(c)}</option>)}
        </select></label>
      <label className="text-xs text-muted-foreground">Año
        <select className="input text-sm" value={f.temporada} onChange={e => set('temporada', Number(e.target.value))}>
          {lista.map(a => <option key={a} value={a}>{a}</option>)}
        </select></label>
      <label className="text-xs text-muted-foreground">Circuito
        <select className="input text-sm" value={f.genero} onChange={e => set('genero', e.target.value)}>
          {Object.entries(GENEROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
    </div>
  );
}
const filtroInicial = (ligas) => ({ liga_id: ligas.find(l => l.estado === 'activa')?.id || ligas[0]?.id, categoria_id: 7, temporada: ANIO, genero: 'masculino' });

function Ranking({ svc, ligas }) {
  const [f, setF] = useState(() => filtroInicial(ligas));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    svc.ranking_list(f).then(setData).catch(e => { setData(null); setError(errMsg(e)); });
  }, [svc, f]);
  return (
    <div className="space-y-3">
      <Filtros f={f} setF={setF} ligas={ligas} anios={data?.temporadas} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">{data.liga.nombre} · {data.categoria_label} · {GENEROS[f.genero]} · {f.temporada}. Al finalizar cada categoría de un torneo anual de esta liga, cada jugador suma según hasta dónde llegó.</p>
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground text-left"><tr><th className="px-3 py-2 w-16">Posición</th><th className="px-3 py-2">Jugador</th><th className="px-3 py-2 hidden sm:table-cell">DNI</th><th className="px-3 py-2 text-right">Puntos</th></tr></thead>
              <tbody>
                {data.jugadores.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sin puntos en esta liga, categoría y año.</td></tr>}
                {data.jugadores.map(j => (
                  <tr key={j.id} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{j.posicion}</td>
                    <td className="px-3 py-2 font-medium">{j.nombre}</td>
                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{j.dni}</td>
                    <td className="px-3 py-2 text-right font-bold text-primary">{j.puntos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Ajuste({ svc, ligas }) {
  const [f, setF] = useState(() => filtroInicial(ligas));
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [jugador, setJugador] = useState(null);     // { id, nombre, dni, puntos } | { nuevo: true }
  const [form, setForm] = useState({ tipo: 'sumar', puntos: '', motivo: '', dni: '', nombre: '' });
  const [msg, setMsg] = useState({});
  const [guardando, setGuardando] = useState(false);

  const buscar = useCallback(async (texto = q) => {
    try { setResultados(await svc.jugadores({ q: texto.trim(), ...f, limite: 20 })); } catch (e) { setMsg({ error: errMsg(e) }); }
  }, [svc, f, q]);
  // Al cambiar la combinación, refrescar el puntaje actual del jugador elegido
  useEffect(() => {
    if (!jugador?.id) return;
    svc.jugadores({ q: jugador.dni, ...f, limite: 1 }).then(r => r[0] && setJugador(j => ({ ...j, puntos: r[0].puntos }))).catch(() => {});
  }, [svc, f, jugador?.id, jugador?.dni]);

  const actual = jugador?.puntos ?? 0;
  const n = Number(form.puntos) || 0;
  const resultado = form.tipo === 'fijar' ? n : form.tipo === 'restar' ? actual - n : actual + n;
  const guardar = async (e) => {
    e.preventDefault(); setMsg({});
    if (form.motivo.trim().length < 5) return setMsg({ error: 'Registrá el motivo del ajuste (mínimo 5 caracteres).' });
    if (resultado < 0) return setMsg({ error: 'El puntaje no puede quedar negativo.' });
    setGuardando(true);
    try {
      const body = { ...f, tipo: form.tipo, puntos: n, motivo: form.motivo.trim(), ...(jugador?.id ? { jugador_id: jugador.id } : { dni: form.dni, nombre: form.nombre }) };
      const r = await svc.ranking_ajuste(body);
      setMsg({ ok: `Puntaje actualizado: ${r.anterior} → ${r.nuevo}. Quedó registrado en el historial.` });
      setJugador(j => (j?.id ? { ...j, puntos: r.nuevo } : null));
      setForm(x => ({ ...x, puntos: '', motivo: '' }));
    } catch (err) { setMsg({ error: errMsg(err) }); } finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <Filtros f={f} setF={setF} ligas={ligas} />
      <div className="card space-y-2">
        <div className="font-semibold text-sm">1. Jugador</div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); buscar(); }}>
          <input className="input text-sm" placeholder="Nombre o DNI (vacío = todos)" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-outline btn-sm"><Search className="w-4 h-4" /> Buscar</button>
          <button type="button" className="btn-ghost btn-sm whitespace-nowrap" onClick={() => { setJugador({ nuevo: true }); setResultados([]); }}><Plus className="w-4 h-4" /> Jugador nuevo</button>
        </form>
        {resultados.length > 0 && (
          <ul className="border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto text-sm">
            {resultados.map(r => (
              <li key={r.id}><button type="button" className={`w-full text-left px-3 py-2 hover:bg-muted flex justify-between gap-2 ${jugador?.id === r.id ? 'bg-primary/10' : ''}`} onClick={() => setJugador(r)}>
                <span>{r.nombre} <span className="text-xs text-muted-foreground">· DNI {r.dni}</span></span><strong>{r.puntos} pts</strong>
              </button></li>
            ))}
          </ul>
        )}
        {jugador?.nuevo && (
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="input text-sm" inputMode="numeric" placeholder="DNI" value={form.dni} onChange={e => setForm(x => ({ ...x, dni: e.target.value }))} />
            <input className="input text-sm" placeholder="Nombre y apellido" value={form.nombre} onChange={e => setForm(x => ({ ...x, nombre: e.target.value }))} />
          </div>
        )}
      </div>
      {jugador && (
        <form onSubmit={guardar} className="card space-y-3">
          <div className="font-semibold text-sm">2. Ajuste {jugador.nombre ? `de ${jugador.nombre}` : 'del jugador nuevo'}</div>
          <p className="text-sm">Puntaje actual en {ligas.find(l => l.id === f.liga_id)?.nombre} · {catNombre(f.categoria_id)} · {f.temporada}: <strong>{actual}</strong></p>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-xs text-muted-foreground">Acción
              <select className="input text-sm" value={form.tipo} onChange={e => setForm(x => ({ ...x, tipo: e.target.value }))}>
                <option value="sumar">Agregar puntos</option><option value="restar">Restar puntos</option><option value="fijar">Fijar puntaje</option>
              </select></label>
            <label className="text-xs text-muted-foreground">{form.tipo === 'fijar' ? 'Puntaje nuevo' : 'Puntos'}
              <input className="input text-sm" type="number" min="0" step="1" value={form.puntos} onChange={e => setForm(x => ({ ...x, puntos: e.target.value }))} required /></label>
            <div className="text-xs text-muted-foreground">Resultado<div className={`text-lg font-bold ${resultado < 0 ? 'text-red-400' : 'text-foreground'}`}>{actual} → {resultado}</div></div>
          </div>
          <label className="block text-xs text-muted-foreground">Motivo / observación *
            <textarea className="input text-sm min-h-[60px]" maxLength={255} value={form.motivo} onChange={e => setForm(x => ({ ...x, motivo: e.target.value }))} placeholder="Ej.: puntos históricos de la liga, corrección de planilla" required /></label>
          {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
          {msg.ok && <p className="text-sm text-green-400">{msg.ok}</p>}
          <button className="btn-primary text-sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajuste'}</button>
        </form>
      )}
      {!jugador && msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
    </div>
  );
}

function Historial({ svc, ligas }) {
  const [f, setF] = useState({ liga_id: '', categoria_id: '', temporada: '' });
  const [filas, setFilas] = useState(null);
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    svc.ranking_historial(params).then(setFilas).catch(() => setFilas([]));
  }, [svc, f]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <select className="input text-sm" value={f.liga_id} onChange={e => setF(x => ({ ...x, liga_id: e.target.value }))} aria-label="Liga"><option value="">Todas las ligas</option>{ligas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select>
        <select className="input text-sm" value={f.categoria_id} onChange={e => setF(x => ({ ...x, categoria_id: e.target.value }))} aria-label="Categoría"><option value="">Todas</option>{[...CATEGORIAS].reverse().map(c => <option key={c} value={c}>{catNombre(c)}</option>)}</select>
        <input className="input text-sm" type="number" placeholder="Año" value={f.temporada} onChange={e => setF(x => ({ ...x, temporada: e.target.value }))} aria-label="Año" />
      </div>
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground text-left"><tr>{['Fecha', 'Usuario', 'Jugador', 'Liga · Cat.', 'Cambio', 'Motivo'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {filas?.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin cambios registrados.</td></tr>}
            {(filas || []).map(a => (
              <tr key={a.id} className="border-t border-border align-top">
                <td className="px-3 py-2 whitespace-nowrap">{fechaHora(a.created_at)}</td>
                <td className="px-3 py-2">{a.usuario || '—'}</td>
                <td className="px-3 py-2">{a.jugador?.nombre}<div className="text-xs text-muted-foreground">DNI {a.jugador?.dni}</div></td>
                <td className="px-3 py-2">{a.liga?.nombre}<div className="text-xs text-muted-foreground">{catNombre(a.categoria_id)} · {a.genero} · {a.temporada}</div></td>
                <td className="px-3 py-2 whitespace-nowrap"><span className="badge-neutral">{TIPO_AJUSTE[a.tipo] || a.tipo}</span> {a.puntos_anterior} → <strong>{a.puntos_nuevo}</strong></td>
                <td className="px-3 py-2 text-muted-foreground">{a.motivo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ligas({ svc, ligas, recargar }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const guardar = async (e) => {
    e.preventDefault(); setError('');
    try { if (form.id) await svc.updateLiga(form.id, form); else await svc.createLiga(form); setForm(null); recargar(); } catch (err) { setError(errMsg(err)); }
  };
  const eliminar = async (l) => {
    if (!confirm(`¿Eliminar la liga "${l.nombre}"? Si tiene torneos o puntos, se desactiva.`)) return;
    try { const r = await svc.deleteLiga(l.id); if (r.desactivada) alert('La liga tiene torneos o puntos: quedó inactiva.'); recargar(); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Cada torneo pertenece a una liga y cada liga tiene su propio ranking.</p>
        {!form && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setForm({ nombre: '', estado: 'activa' })}><Plus className="w-4 h-4" /> Liga</button>}</div>
      {form && (
        <form onSubmit={guardar} className="card grid sm:grid-cols-[2fr_1fr_auto] gap-2 items-center">
          <input className="input" placeholder="Ej.: Liga Tucumán Norte" value={form.nombre} onChange={e => setForm(x => ({ ...x, nombre: e.target.value }))} maxLength={100} required />
          <select className="input" value={form.estado} onChange={e => setForm(x => ({ ...x, estado: e.target.value }))}><option value="activa">Activa</option><option value="inactiva">Inactiva</option></select>
          <div className="flex gap-1"><button className="btn-primary text-sm">Guardar</button><button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button></div>
        </form>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="card !p-0 divide-y divide-border">
        {ligas.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin ligas.</p>}
        {ligas.map(l => (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2">
            <span className="font-medium flex-1">{l.nombre}</span>
            <span className={l.estado === 'activa' ? 'badge-green' : 'badge-neutral'}>{l.estado === 'activa' ? 'Activa' : 'Inactiva'}</span>
            <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm({ id: l.id, nombre: l.nombre, estado: l.estado })}><Pencil className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Eliminar" onClick={() => eliminar(l)}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
