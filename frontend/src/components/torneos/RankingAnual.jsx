import { useState, useEffect, useCallback, useRef } from 'react';
import { ListOrdered, SlidersHorizontal, History, Flag, Plus, Pencil, Trash2, Search, Settings2, RefreshCw, X, Trophy } from 'lucide-react';
import { CATEGORIAS, catNombre, GENEROS, errMsg, fechaCorta } from '../../utils/torneos';

const ANIO = new Date().getFullYear();
const fechaHora = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const TIPO_AJUSTE = { fijar: 'Fijó', sumar: 'Sumó', restar: 'Restó', torneo: 'Torneo', migracion: 'Migración', baja: 'Quitado', recalculo: 'Recálculo' };
const INSTANCIA_LABEL = { zona: 'Zona', '16avos': '16avos', octavos: 'Octavos', cuartos: 'Cuartos', semifinal: 'Semifinal', final: 'Finalista', campeon: 'Campeón' };
const z0 = (v) => Number(v) || 0;

/**
 * Torneos → Ligas anuales. Ranking por LIGA + CATEGORÍA + TEMPORADA (+ circuito): cada
 * combinación es un acumulador propio (nunca se mezclan ligas, categorías ni años).
 *  - `admin` (admin del club): gestiona ligas.
 *  - `adminGeneral` (Administrador General): modificar puntajes, configurar puntos por instancia,
 *    recalcular y ver la auditoría.
 */
export default function RankingAnual({ svc, admin = true, adminGeneral = false }) {
  const [vista, setVista] = useState('ranking');
  const [ligas, setLigas] = useState(null);
  const cargarLigas = useCallback(() => svc.ligas().then(setLigas).catch(() => setLigas([])), [svc]);
  useEffect(() => { cargarLigas(); }, [cargarLigas]);
  const VISTAS = [
    ['ranking', 'Ranking general', ListOrdered],
    ...(adminGeneral ? [['puntajes', 'Puntajes', Settings2], ['historial', 'Historial', History], ['recalcular', 'Recalcular', RefreshCw], ['ajuste', 'Ajuste manual', SlidersHorizontal]] : []),
    ...(admin ? [['ligas', 'Ligas', Flag]] : []),
  ];
  const necesitaLiga = ['ranking', 'historial', 'ajuste'].includes(vista);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap gap-1" role="tablist">
        {VISTAS.map(([k, l, Icon]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${vista === k ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>
      {ligas === null ? <p className="text-sm text-muted-foreground">Cargando…</p>
        : !ligas.length && necesitaLiga ? (
          <div className="card text-sm text-center py-8 space-y-2">
            <p>Todavía no hay ligas. Cada torneo y cada ranking pertenecen a una liga.</p>
            {admin && <button className="btn-primary text-sm" onClick={() => setVista('ligas')}>Crear una liga</button>}
          </div>
        ) : (
          <>
            {vista === 'ranking' && <Ranking svc={svc} ligas={ligas} adminGeneral={adminGeneral} />}
            {vista === 'puntajes' && <Puntajes svc={svc} />}
            {vista === 'historial' && <Historial svc={svc} ligas={ligas} />}
            {vista === 'recalcular' && <Recalcular svc={svc} />}
            {vista === 'ajuste' && <Ajuste svc={svc} ligas={ligas} />}
            {vista === 'ligas' && <Ligas svc={svc} ligas={ligas} recargar={cargarLigas} />}
          </>
        )}
    </div>
  );
}

/** Filtros compartidos: liga, categoría, temporada y circuito. */
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
      <label className="text-xs text-muted-foreground">Temporada
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

/** Modal base (respeta modo oscuro; en móvil sube desde abajo). */
function Modal({ titulo, onClose, children, ancho = 'sm:max-w-md' }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative z-10 w-full ${ancho} bg-card text-foreground border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <h3 className="font-semibold">{titulo}</h3>
          <button className="p-1 rounded hover:bg-muted" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Ranking general ─────────────────────────────────────────────────────────
function Ranking({ svc, ligas, adminGeneral }) {
  const [f, setF] = useState(() => filtroInicial(ligas));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editar, setEditar] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [toast, setToast] = useState('');
  const cargar = useCallback(() => {
    setError('');
    return svc.ranking_list(f).then(setData).catch(e => { setData(null); setError(errMsg(e)); });
  }, [svc, f]);
  useEffect(() => { cargar(); }, [cargar]);
  const ok = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  return (
    <div className="space-y-3">
      <Filtros f={f} setF={setF} ligas={ligas} anios={data?.temporadas} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">{data.liga.nombre} · {data.categoria_label} · {GENEROS[f.genero]} · Temporada {f.temporada}. Aparecen todos los jugadores de la categoría; quien nunca jugó figura con 0.</p>
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2">#</th><th className="px-3 py-2">Jugador</th>
                  <th className="px-2 py-2 hidden lg:table-cell">Categoría</th><th className="px-2 py-2 hidden xl:table-cell">Club</th>
                  <th className="px-2 py-2 text-right">Puntos</th>
                  <th className="px-2 py-2 text-center hidden sm:table-cell" title="Torneos jugados">TJ</th>
                  <th className="px-2 py-2 text-center hidden sm:table-cell" title="Campeonatos ganados">🏆</th>
                  <th className="px-2 py-2 text-center hidden md:table-cell" title="Finales disputadas">F</th>
                  <th className="px-2 py-2 text-center hidden md:table-cell" title="Semifinales disputadas">SF</th>
                  <th className="px-2 py-2 hidden lg:table-cell">Último torneo</th>
                  {adminGeneral && <th className="px-2 py-2 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {data.jugadores.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">No hay jugadores registrados en esta categoría.</td></tr>}
                {data.jugadores.map(j => (
                  <tr key={j.jugador_id} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{j.posicion}</td>
                    <td className="px-3 py-2"><div className="font-medium">{j.nombre}</div><div className="text-xs text-muted-foreground">DNI {j.dni}</div></td>
                    <td className="px-2 py-2 hidden lg:table-cell">{j.categoria}</td>
                    <td className="px-2 py-2 hidden xl:table-cell text-muted-foreground">{j.club || '—'}</td>
                    <td className="px-2 py-2 text-right font-bold text-primary whitespace-nowrap">{z0(j.puntos)}
                      {z0(j.ajuste_manual) !== 0 && <span className="block text-[10px] font-normal text-muted-foreground" title="Puntos de torneos + ajuste manual">{z0(j.puntos_torneos)} {j.ajuste_manual > 0 ? '+' : '−'} {Math.abs(j.ajuste_manual)} manual</span>}
                    </td>
                    <td className="px-2 py-2 text-center hidden sm:table-cell">{z0(j.torneos_jugados)}</td>
                    <td className="px-2 py-2 text-center hidden sm:table-cell">{z0(j.campeonatos)}</td>
                    <td className="px-2 py-2 text-center hidden md:table-cell">{z0(j.finales)}</td>
                    <td className="px-2 py-2 text-center hidden md:table-cell">{z0(j.semifinales)}</td>
                    <td className="px-2 py-2 hidden lg:table-cell text-xs text-muted-foreground">{j.ultimo_torneo ? <>{j.ultimo_torneo.nombre}<br />{fechaCorta(j.ultimo_torneo.fecha)}</> : '—'}</td>
                    {adminGeneral && (
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button className="p-1.5 rounded hover:bg-muted" title="Modificar puntaje" aria-label={`Modificar puntaje de ${j.nombre}`} onClick={() => setEditar(j)}><Pencil className="w-4 h-4" /></button>
                        <button className="p-1.5 rounded hover:bg-muted" title="Historial" aria-label={`Historial de ${j.nombre}`} onClick={() => setHistorial(j)}><History className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editar && <ModificarPuntaje svc={svc} jugador={editar} f={f} liga={data?.liga} onClose={() => setEditar(null)}
        onGuardado={(r) => { setEditar(null); cargar(); ok(`Puntaje de ${editar.nombre}: ${r.anterior} → ${r.nuevo}.`); }} />}
      {historial && <HistorialJugador svc={svc} jugador={historial} f={f} onClose={() => setHistorial(null)} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white bg-green-600" role="status">{toast}</div>}
    </div>
  );
}

/** Modificar puntaje: sumar / restar / fijar, con motivo obligatorio y confirmación. */
function ModificarPuntaje({ svc, jugador, f, liga, onClose, onGuardado }) {
  const [tipo, setTipo] = useState('sumar');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const actual = z0(jugador.puntos);
  const n = Number(valor);
  const valido = valor !== '' && Number.isInteger(n) && n >= 0;
  const nuevo = tipo === 'fijar' ? n : tipo === 'restar' ? actual - n : actual + n;
  const guardar = async (e) => {
    e.preventDefault(); setError('');
    if (!valido) return setError('Ingresá un número entero mayor o igual a 0.');
    if (nuevo < 0) return setError('El puntaje no puede quedar negativo.');
    if (motivo.trim().length < 5) return setError('El motivo es obligatorio (mínimo 5 caracteres).');
    if (!window.confirm(`¿Cambiar el puntaje de ${jugador.nombre} de ${actual} a ${nuevo}?`)) return;
    setGuardando(true);
    try { onGuardado(await svc.ranking_ajuste({ ...f, jugador_id: jugador.jugador_id, tipo, puntos: n, motivo: motivo.trim() })); }
    catch (err) { setError(errMsg(err)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo="Modificar puntaje" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Jugador</dt><dd className="font-medium">{jugador.nombre}</dd>
          <dt className="text-muted-foreground">Categoría</dt><dd>{catNombre(f.categoria_id)} · {GENEROS[f.genero]}</dd>
          <dt className="text-muted-foreground">Liga</dt><dd>{liga?.nombre} · {f.temporada}</dd>
          <dt className="text-muted-foreground">Puntos actuales</dt><dd><strong>{actual}</strong> <span className="text-xs text-muted-foreground">({z0(jugador.puntos_torneos)} de torneos{z0(jugador.ajuste_manual) ? `, ${jugador.ajuste_manual > 0 ? '+' : ''}${jugador.ajuste_manual} manual` : ''})</span></dd>
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Acción
            <select className="input text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="sumar">Sumar puntos</option><option value="restar">Restar puntos</option><option value="fijar">Establecer puntaje</option>
            </select></label>
          <label className="text-xs text-muted-foreground">{tipo === 'fijar' ? 'Nuevo puntaje' : 'Puntos'}
            <input className="input text-sm" type="number" inputMode="numeric" min="0" step="1" value={valor} autoFocus onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))} /></label>
        </div>
        <p className="text-sm">Nuevo puntaje: <strong className={nuevo < 0 ? 'text-red-400' : ''}>{valido ? nuevo : '—'}</strong></p>
        <label className="block text-xs text-muted-foreground">Motivo *
          <textarea className="input text-sm min-h-[60px]" maxLength={255} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: corrección de planilla, puntos históricos" /></label>
        <p className="text-[11px] text-muted-foreground">El cambio queda en el historial y se conserva aunque se recalcule el ranking.</p>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Historial de cambios de puntos de un jugador (ficha). */
function HistorialJugador({ svc, jugador, f, onClose }) {
  const [filas, setFilas] = useState(null);
  useEffect(() => { svc.ranking_historial({ jugador_id: jugador.jugador_id, liga_id: f.liga_id }).then(setFilas).catch(() => setFilas([])); }, [svc, jugador.jugador_id, f.liga_id]);
  return (
    <Modal titulo={`Historial · ${jugador.nombre}`} onClose={onClose} ancho="sm:max-w-2xl">
      {!filas ? <p className="text-sm text-muted-foreground">Cargando…</p> : <TablaHistorial filas={filas} />}
    </Modal>
  );
}

function TablaHistorial({ filas }) {
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="text-xs text-muted-foreground text-left"><tr>{['Fecha', 'Usuario', 'Jugador', 'Liga · Cat.', 'Cambio', 'Motivo'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>
          {filas.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin cambios registrados.</td></tr>}
          {filas.map(a => (
            <tr key={a.id} className="border-t border-border align-top">
              <td className="px-3 py-2 whitespace-nowrap">{fechaHora(a.createdAt || a.created_at)}</td>
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
        <input className="input text-sm" type="number" placeholder="Temporada" value={f.temporada} onChange={e => setF(x => ({ ...x, temporada: e.target.value }))} aria-label="Temporada" />
      </div>
      {filas && <TablaHistorial filas={filas} />}
    </div>
  );
}

// ── Configuración de puntajes ───────────────────────────────────────────────
function Puntajes({ svc }) {
  const [temporadas, setTemporadas] = useState(null);
  const [anio, setAnio] = useState(ANIO);
  const [cfg, setCfg] = useState(null);
  const [editando, setEditando] = useState(null);   // { categoria_id, puntos }
  const [msg, setMsg] = useState({});
  const cargarTemporadas = useCallback(() => svc.ranking_temporadas().then(setTemporadas).catch(() => setTemporadas([])), [svc]);
  const cargar = useCallback(() => svc.ranking_config(anio).then(setCfg).catch(e => setMsg({ error: errMsg(e) })), [svc, anio]);
  useEffect(() => { cargarTemporadas(); }, [cargarTemporadas]);
  useEffect(() => { cargar(); }, [cargar]);
  const temp = cfg?.temporada;
  const cerrada = temp?.estado === 'cerrada';

  const guardar = async () => {
    const malos = Object.entries(editando.puntos).filter(([, v]) => v === '' || !Number.isInteger(Number(v)) || Number(v) < 0);
    if (malos.length) return setMsg({ error: `Valores inválidos en: ${malos.map(([k]) => INSTANCIA_LABEL[k]).join(', ')} (enteros mayores o iguales a 0).` });
    if (!window.confirm(`¿Guardar los puntajes de ${catNombre(editando.categoria_id)} para la temporada ${anio}? Se usan en los próximos cálculos; para aplicarlos a torneos ya jugados usá "Recalcular".`)) return;
    try {
      setCfg(await svc.ranking_guardarConfig(anio, editando.categoria_id, Object.fromEntries(Object.entries(editando.puntos).map(([k, v]) => [k, Number(v)]))));
      setMsg({ ok: `Puntajes de ${catNombre(editando.categoria_id)} guardados.` }); setEditando(null);
    } catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const nuevaTemporada = async () => {
    const a = window.prompt('Año de la nueva temporada:', String((temporadas?.[0]?.anio || ANIO) + 1));
    if (!a) return;
    try { await svc.ranking_crearTemporada({ anio: Number(a) }); await cargarTemporadas(); setAnio(Number(a)); setMsg({ ok: `Temporada ${a} creada (copia la configuración de la anterior).` }); }
    catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const alternarEstado = async () => {
    const estado = cerrada ? 'activa' : 'cerrada';
    if (!window.confirm(`¿${cerrada ? 'Reabrir' : 'Cerrar'} la temporada ${anio}?${cerrada ? '' : ' Una temporada cerrada no admite cambios de configuración.'}`)) return;
    try { await svc.ranking_actualizarTemporada(temp.id, { estado }); cargar(); cargarTemporadas(); } catch (e) { setMsg({ error: errMsg(e) }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">Temporada
          <select className="input text-sm !w-auto" value={anio} onChange={e => { setAnio(Number(e.target.value)); setEditando(null); }}>
            {(temporadas || []).map(t => <option key={t.id} value={t.anio}>{t.nombre}{t.estado === 'cerrada' ? ' (cerrada)' : ''}</option>)}
          </select></label>
        <button className="btn-outline btn-sm" onClick={nuevaTemporada}><Plus className="w-4 h-4" /> Temporada</button>
        {temp && <button className="btn-ghost btn-sm" onClick={alternarEstado}>{cerrada ? 'Reabrir temporada' : 'Cerrar temporada'}</button>}
      </div>
      <p className="text-xs text-muted-foreground">Puntos que suma cada jugador según la instancia máxima que alcanzó su pareja. Cada temporada y cada categoría tienen valores propios.</p>
      {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-green-400">{msg.ok}</p>}
      {cfg && (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Categoría</th>{cfg.instancias.map(i => <th key={i} className="px-2 py-2 text-center">{INSTANCIA_LABEL[i]}</th>)}<th className="px-2 py-2" /></tr></thead>
            <tbody>
              {cfg.categorias.map(c => {
                const ed = editando?.categoria_id === c.categoria_id;
                return (
                  <tr key={c.categoria_id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{c.nombre}</td>
                    {cfg.instancias.map(i => (
                      <td key={i} className="px-2 py-1.5 text-center">
                        {ed
                          ? <input className="input text-sm !w-20 text-center !px-1" type="number" min="0" step="1" inputMode="numeric" aria-label={`${INSTANCIA_LABEL[i]} ${c.nombre}`}
                              value={editando.puntos[i]} onChange={e => setEditando(x => ({ ...x, puntos: { ...x.puntos, [i]: e.target.value.replace(/[^\d]/g, '') } }))} />
                          : c.puntos[i]}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {ed ? (
                        <><button className="btn-primary btn-sm" onClick={guardar}>Guardar</button> <button className="btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button></>
                      ) : (
                        <button className="btn-ghost btn-sm" disabled={cerrada} onClick={() => setEditando({ categoria_id: c.categoria_id, puntos: { ...c.puntos } })}><Pencil className="w-4 h-4" /> Editar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">"16avos" se aplica cuando la llave tiene 32 lugares; hoy el cuadro admite hasta 16 parejas.</p>
    </div>
  );
}

// ── Recálculo global ────────────────────────────────────────────────────────
function Recalcular({ svc }) {
  const [temporada, setTemporada] = useState(String(ANIO));
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const iniciar = async () => {
    if (!window.confirm(`Se recalculan los puntos de todos los torneos anuales finalizados${temporada ? ` de ${temporada}` : ''} con la configuración vigente. Los ajustes manuales se conservan. ¿Continuar?`)) return;
    setError('');
    try {
      const r = await svc.ranking_recalcular(temporada ? { temporada: Number(temporada) } : {});
      setJob({ id: r.id, estado: 'en_curso', porcentaje: 0, procesados: 0, total: 0 });
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const e = await svc.ranking_estadoRecalculo(r.id);
          setJob(e);
          if (e.estado !== 'en_curso') clearInterval(timer.current);
        } catch (err) { setError(errMsg(err)); clearInterval(timer.current); }
      }, 700);
    } catch (e) { setError(errMsg(e)); }
  };
  const enCurso = job?.estado === 'en_curso';
  return (
    <div className="card space-y-3 max-w-xl">
      <h3 className="font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4 text-primary" /> Recalcular rankings</h3>
      <p className="text-sm text-muted-foreground">Vuelve a leer los torneos anuales finalizados, aplica los puntajes configurados para cada temporada y categoría y actualiza el ranking. Cada cambio queda en el historial. Corre en segundo plano: el sistema sigue funcionando.</p>
      <label className="text-xs text-muted-foreground">Temporada
        <select className="input text-sm" value={temporada} onChange={e => setTemporada(e.target.value)} disabled={enCurso}>
          <option value="">Todas</option>{[ANIO + 1, ANIO, ANIO - 1, ANIO - 2].map(a => <option key={a} value={a}>{a}</option>)}
        </select></label>
      <button className="btn-primary text-sm" onClick={iniciar} disabled={enCurso}>{enCurso ? 'Recalculando…' : 'Recalcular ranking'}</button>
      {job && (
        <div className="space-y-1" aria-live="polite">
          <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${job.porcentaje || 0}%` }} /></div>
          <p className="text-xs text-muted-foreground">
            {job.estado === 'en_curso' ? `Procesando ${job.procesados}/${job.total} torneos…`
              : `${job.estado === 'completado' ? 'Listo' : 'Terminado con errores'}: ${job.procesados}/${job.total} torneos · ${job.combinaciones || 0} rankings revisados · ${job.cambios || 0} con cambios.`}
          </p>
          {job.errores?.length > 0 && <ul className="text-xs text-red-400 list-disc pl-4">{job.errores.map(e => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ── Ajuste manual (incluye alta de jugadores con puntos históricos) ─────────
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
    if (!window.confirm(`¿Guardar el ajuste? ${actual} → ${resultado}`)) return;
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

// ── Ligas ───────────────────────────────────────────────────────────────────
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
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground flex items-center gap-1.5"><Trophy className="w-4 h-4" /> Cada torneo pertenece a una liga y cada liga tiene su propio ranking.</p>
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
