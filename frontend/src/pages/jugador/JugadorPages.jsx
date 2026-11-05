/**
 * Portal de Jugador — 100% solo lectura. Login por DNI (clave inicial = DNI, cambio obligatorio).
 * Ve solo los torneos donde juega y los de sus mismas ligas (el backend responde 403 al resto).
 * Reutiliza las vistas públicas del fixture sin ninguna acción de edición.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bell, BellOff, Trophy, User, Medal, ListOrdered, CalendarDays, LogOut, ShieldAlert, KeyRound, ChevronRight, ChevronLeft, MapPin, Swords, History, Layers } from 'lucide-react';
import { jugador, jugadorAuth, jugadorPush } from '../../services/playerPortalService';
import InstallPWA from '../../components/pwa/InstallPWA';
import { TablaZona, ZonaGrilla, Bracket, RankingJugadores, Cronograma } from '../../components/torneos/FixtureViews';
import { CategoriaTabs } from '../../components/torneos/CategoriasSelect';
import { ESTADO_TORNEO, GENEROS, fechaCorta, errMsg } from '../../utils/torneos';

// ── Estados genéricos ─────────────────────────────────────────
const Sk = ({ className = '' }) => <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
function Esqueleto({ filas = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      <Sk className="h-7 w-48" />
      {Array.from({ length: filas }, (_, i) => <Sk key={i} className="h-20 w-full" />)}
    </div>
  );
}
const Vacio = ({ icon: Icon = Trophy, titulo, texto }) => (
  <div className="card text-center py-10 space-y-2">
    <Icon className="w-8 h-8 mx-auto text-muted-foreground" />
    <div className="font-medium">{titulo}</div>
    {texto && <p className="text-sm text-muted-foreground">{texto}</p>}
  </div>
);
function ErrorVista({ error, onReintentar }) {
  if (error?.status === 403) {
    return (
      <div className="card text-center py-10 space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-400" />
        <div className="font-semibold">Acceso denegado</div>
        <p className="text-sm text-muted-foreground">{error.message || 'Solo podés ver los torneos y ligas donde participás.'}</p>
        <Link to="/jugador/torneos" className="btn-outline text-sm inline-flex">Ir a Mis Torneos</Link>
      </div>
    );
  }
  return (
    <div className="card text-center py-10 space-y-3" role="alert">
      <div className="font-semibold">No pudimos cargar la información</div>
      <p className="text-sm text-muted-foreground">{errMsg(error)}</p>
      {onReintentar && <button className="btn-outline text-sm" onClick={onReintentar}>Reintentar</button>}
    </div>
  );
}

/** Carga con estados: { data, error, cargando, recargar } */
function useCarga(fn, deps) {
  const [st, setSt] = useState({ data: null, error: null, cargando: true });
  const cargar = useCallback(() => {
    setSt(s => ({ ...s, cargando: true, error: null }));
    fn().then(data => setSt({ data, error: null, cargando: false })).catch(error => setSt({ data: null, error, cargando: false }));
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  return { ...st, recargar: cargar };
}
function Estado({ c, filas, children }) {
  if (c.cargando && !c.data) return <Esqueleto filas={filas} />;
  if (c.error) return <ErrorVista error={c.error} onReintentar={c.recargar} />;
  return children(c.data);
}

// ── Layout con menú ───────────────────────────────────────────
const MENU = [
  ['/jugador/dashboard', 'Mi Perfil', User],
  ['/jugador/torneos', 'Mis Torneos', Trophy],
  ['/jugador/ligas', 'Mis Ligas', Layers],
  ['/jugador/resultados', 'Resultados', Swords],
  ['/jugador/posiciones', 'Posiciones', ListOrdered],
];
function Layout({ children }) {
  const navigate = useNavigate();
  useEffect(() => { if (!jugadorAuth.logueado()) navigate('/jugador/login', { replace: true }); }, [navigate]);
  useEffect(() => { jugadorPush.renovar(); }, []);   // token FCM rotado / último uso del dispositivo
  const salir = () => { jugadorAuth.salir(); navigate('/jugador/login'); };
  const link = ({ isActive }) => `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`;
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/jugador/dashboard" className="font-bold flex items-center gap-2 shrink-0"><Medal className="w-5 h-5 text-primary" /> Portal de Jugador</Link>
          <nav className="hidden md:flex gap-1 ml-4" aria-label="Menú del jugador">
            {MENU.map(([to, l, Icon]) => <NavLink key={to} to={to} className={link}><Icon className="w-4 h-4" />{l}</NavLink>)}
          </nav>
          <button onClick={salir} className="ml-auto btn-ghost text-sm" aria-label="Cerrar sesión"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">Salir</span></button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">{children}</main>
      <InstallPWA className="max-md:!bottom-20" />
      {/* Menú inferior en móvil */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border grid grid-cols-5" aria-label="Menú del jugador" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {MENU.map(([to, l, Icon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
            <Icon className="w-5 h-5" />{l}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const EstadoBadge = ({ estado }) => <span className={`badge ${ESTADO_TORNEO[estado]?.cls || ''}`}>{ESTADO_TORNEO[estado]?.label || estado}</span>;
function TorneoCard({ t, tab }) {
  return (
    <Link to={`/jugador/torneo/${t.id}${tab ? `?tab=${tab}` : ''}`} className="card flex items-center gap-3 hover:border-primary/60 transition-colors">
      <Trophy className="w-8 h-8 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{t.nombre}</div>
        <div className="text-xs text-muted-foreground truncate">{t.liga?.nombre} · {t.categorias.map(c => c.nombre).join(' · ')} {GENEROS[t.genero]}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><CalendarDays className="w-3 h-3" /> {fechaCorta(t.fecha_inicio)} → {fechaCorta(t.fecha_fin)}{t.club && <> · <MapPin className="w-3 h-3" /> {t.club.nombre}</>}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <EstadoBadge estado={t.estado} />
        {!t.participa && <span className="text-[10px] text-muted-foreground">Misma liga</span>}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function Paginador({ page, limit, total, onPage }) {
  const paginas = Math.ceil(total / limit);
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-sm">
      <button className="btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span>{page} / {paginas}</span>
      <button className="btn-ghost" disabled={page >= paginas} onClick={() => onPage(page + 1)} aria-label="Página siguiente"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

// ── Credenciales ──────────────────────────────────────────────
const Centro = ({ children }) => <div className="min-h-screen bg-background flex items-center justify-center p-4">{children}</div>;

export function JugadorLogin() {
  const navigate = useNavigate();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [olvido, setOlvido] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r = await jugadorAuth.login(dni, password);
      localStorage.setItem('jug_token', r.token);
      navigate(r.must_change_password ? '/jugador/cambiar-clave' : '/jugador/dashboard');
    } catch (err) { setError(errMsg(err)); } finally { setLoading(false); }
  };
  const recuperar = async () => {
    if (!dni) return setError('Ingresá tu DNI para recuperar el acceso.');
    setError('');
    try { setOlvido((await jugadorAuth.olvide(dni)).message); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <Centro>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 font-bold text-lg"><Medal className="w-5 h-5 text-primary" /> Portal de Jugador</div>
        <p className="text-sm text-muted-foreground">Consultá tus torneos, ligas, zonas, llaves y resultados. La primera vez tu contraseña es tu DNI.</p>
        <input className="input" inputMode="numeric" placeholder="DNI" autoComplete="username" value={dni} onChange={e => setDni(e.target.value.replace(/\D/g, ''))} required />
        <input className="input" type="password" placeholder="Contraseña" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        {olvido && <p className="text-sm text-emerald-400">{olvido}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
        <button type="button" className="btn-ghost w-full text-sm" onClick={recuperar}>Olvidé mi contraseña</button>
        <InstallPWA variante="boton" />
      </form>
      <InstallPWA />
    </Centro>
  );
}

function FormClave({ titulo, conActual, onGuardar }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (nueva.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (nueva !== repetir) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try { setOk(await onGuardar(actual, nueva)); } catch (err) { setError(errMsg(err)); } finally { setLoading(false); }
  };
  return (
    <Centro>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 font-bold text-lg"><KeyRound className="w-5 h-5 text-primary" /> {titulo}</div>
        {conActual && <p className="text-sm text-muted-foreground">Por seguridad, elegí una contraseña nueva distinta de tu DNI.</p>}
        {conActual && <input className="input" type="password" placeholder="Contraseña actual (tu DNI)" autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} required />}
        <input className="input" type="password" placeholder="Nueva contraseña (mín. 6)" autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} required />
        <input className="input" type="password" placeholder="Repetir nueva contraseña" autoComplete="new-password" value={repetir} onChange={e => setRepetir(e.target.value)} required />
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        {ok && <p className="text-sm text-emerald-400">{ok}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Centro>
  );
}

export function JugadorCambiarClave() {
  const navigate = useNavigate();
  useEffect(() => { if (!jugadorAuth.logueado()) navigate('/jugador/login', { replace: true }); }, [navigate]);
  return <FormClave titulo="Cambiá tu contraseña" conActual onGuardar={async (a, n) => {
    const r = await jugadorAuth.cambiarClave(a, n);
    localStorage.setItem('jug_token', r.token);
    navigate('/jugador/dashboard');
    return '';
  }} />;
}

export function JugadorRecuperar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  if (!token) return <Centro><Vacio icon={KeyRound} titulo="Enlace inválido" texto="Pedí un nuevo enlace desde el ingreso del portal." /></Centro>;
  return <FormClave titulo="Nueva contraseña" onGuardar={async (_, n) => {
    const r = await jugadorAuth.restablecer(token, n);
    setTimeout(() => navigate('/jugador/login'), 1500);
    return r.message;
  }} />;
}

// ── Notificaciones push ───────────────────────────────────────
const PREFS = [
  ['recordatorio_partidos', 'Recordatorio de partidos (3 h antes)'],
  ['recordatorio_pagos', 'Pagos de inscripción pendientes'],
  ['resultado_partidos', 'Resultados de mis partidos'],
  ['clasificaciones', 'Clasificaciones (zona y llave)'],
  ['finales', 'Semifinal, final y cierre del torneo'],
  ['promociones', 'Novedades y promociones'],
];
function AvisosPush() {
  const [activo, setActivo] = useState(null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [verPrefs, setVerPrefs] = useState(false);
  useEffect(() => { jugadorPush.activo().then(setActivo).catch(() => setActivo(false)); }, []);
  useEffect(() => { if (verPrefs && !prefs) jugadorPush.preferencias().then(setPrefs).catch(e => setMsg(errMsg(e))); }, [verPrefs, prefs]);
  if (!jugadorPush.soportado() || activo === null) return null;
  const instalada = jugadorPush.instalada();
  const bloqueadas = jugadorPush.permiso() === 'denied';
  const cambiar = async () => {
    setOcupado(true); setMsg('');
    try {
      if (activo) { await jugadorPush.desactivar(); setActivo(false); setMsg('Notificaciones desactivadas en este dispositivo.'); }
      else { await jugadorPush.activar(); setActivo(true); setMsg('Listo: te avisamos de horarios, resultados y novedades de tus torneos.'); }
    } catch (e) { setMsg(errMsg(e)); } finally { setOcupado(false); }
  };
  const togglePref = async (k) => {
    const previo = prefs;
    setPrefs({ ...prefs, [k]: !prefs[k] });
    try { setPrefs(await jugadorPush.guardarPreferencias({ [k]: !previo[k] })); } catch (e) { setPrefs(previo); setMsg(errMsg(e)); }
  };
  return (
    <div className="card space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {activo ? <Bell className="w-6 h-6 text-primary shrink-0" /> : <BellOff className="w-6 h-6 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{activo ? 'Notificaciones activadas' : 'Activá las notificaciones'}</div>
          <p className="text-sm text-muted-foreground">{msg || (!instalada && !activo
            ? 'Las notificaciones llegan a la app instalada: instalá JugaHoy y abrila desde el ícono para activarlas.'
            : 'Recibí en este dispositivo los avisos de tus partidos, aunque la app esté cerrada.')}</p>
        </div>
        <div className="flex gap-2">
          {activo && <button className="btn-ghost text-sm" onClick={() => setVerPrefs(v => !v)} aria-expanded={verPrefs}>Preferencias</button>}
          <button className={activo ? 'btn-ghost text-sm' : 'btn-primary text-sm'} disabled={ocupado || bloqueadas || (!instalada && !activo)} onClick={cambiar}>
            {bloqueadas ? 'Bloqueadas en el navegador' : ocupado ? 'Un momento…' : activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>
      {activo && verPrefs && (
        <div className="border-t border-border pt-3 grid sm:grid-cols-2 gap-2">
          {!prefs ? <Sk className="h-16 sm:col-span-2" /> : PREFS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs[k]} onChange={() => togglePref(k)} /> {l}</label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mi Perfil (dashboard) ─────────────────────────────────────
export function JugadorDashboard() {
  const c = useCarga(() => jugador.dashboard(), []);
  return (
    <Layout>
      <Estado c={c} filas={3}>{(d) => (
        <>
          <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-bold shrink-0">{(d.jugador.nombre || '?').slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold truncate">{d.jugador.nombre || 'Jugador'}</h1>
              <div className="text-sm text-muted-foreground">DNI {d.jugador.dni}{d.jugador.categoria && <> · Categoría <strong className="text-foreground">{d.jugador.categoria}</strong></>}{d.jugador.genero && <> · {GENEROS[d.jugador.genero]}</>}</div>
              <div className="text-sm text-muted-foreground">{d.jugador.clubes.map(cl => cl.nombre).join(' · ') || 'Sin club'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 px-4 py-2"><div className="text-xl font-bold">{d.resumen.torneos_jugados}</div><div className="text-[11px] text-muted-foreground">Torneos</div></div>
              <div className="rounded-lg bg-muted/50 px-4 py-2"><div className="text-xl font-bold">{d.resumen.ligas}</div><div className="text-[11px] text-muted-foreground">Ligas</div></div>
            </div>
          </div>

          <AvisosPush />

          <section className="space-y-2">
            <h2 className="font-semibold flex items-center gap-2"><Medal className="w-4 h-4 text-primary" /> Mi ranking</h2>
            {d.ranking.length ? (
              <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="text-left px-4 py-2">Liga</th><th className="text-left px-2">Categoría</th><th className="px-2">Temporada</th><th className="px-2">Puntos</th><th className="px-4">Posición</th></tr></thead>
                  <tbody>{d.ranking.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{r.liga || '—'}</td><td className="px-2">{r.categoria} {GENEROS[r.genero] || ''}</td>
                      <td className="px-2 text-center">{r.temporada}</td><td className="px-2 text-center font-semibold">{r.puntos}</td><td className="px-4 text-center font-bold text-primary">#{r.posicion}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <Vacio icon={Medal} titulo="Todavía no sumaste puntos de ranking" texto="Aparecen al cerrarse las fechas de tus ligas." />}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between"><h2 className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Mis Torneos en curso</h2><Link to="/jugador/torneos" className="text-sm text-primary">Ver todos</Link></div>
            {d.proximos.length ? <div className="space-y-2">{d.proximos.map(t => <TorneoCard key={t.id} t={t} />)}</div>
              : <Vacio titulo="No tenés torneos en curso" texto="Tus torneos anteriores están en Mis Torneos." />}
          </section>
        </>
      )}</Estado>
    </Layout>
  );
}

// ── Mis Torneos / Resultados / Posiciones (lista paginada) ────
function ListaTorneos({ titulo, icon: Icon, tab, ayuda }) {
  const [page, setPage] = useState(1);
  const [todos, setTodos] = useState(false);
  const c = useCarga(() => jugador.torneos({ page, limit: 10, ...(todos && { todos: '1' }) }), [page, todos]);
  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><Icon className="w-5 h-5 text-primary" /> {titulo}</h1>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={todos} onChange={e => { setTodos(e.target.checked); setPage(1); }} /> Incluir otras fechas de mis ligas</label>
      </div>
      {ayuda && <p className="text-sm text-muted-foreground">{ayuda}</p>}
      <Estado c={c} filas={4}>{(d) => d.items.length ? (
        <>
          <div className="space-y-2">{d.items.map(t => <TorneoCard key={t.id} t={t} tab={tab} />)}</div>
          <Paginador page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
        </>
      ) : <Vacio titulo="No hay torneos para mostrar" texto="Cuando te inscriban en un torneo va a aparecer acá." />}</Estado>
    </Layout>
  );
}
export const JugadorTorneos = () => <ListaTorneos titulo="Mis Torneos" icon={Trophy} />;
export const JugadorResultados = () => <ListaTorneos titulo="Resultados" icon={Swords} tab="resultados" ayuda="Elegí un torneo para ver sus resultados." />;
export const JugadorPosiciones = () => <ListaTorneos titulo="Posiciones" icon={ListOrdered} tab="posiciones" ayuda="Elegí un torneo para ver las posiciones." />;

// ── Torneo (solo lectura) ─────────────────────────────────────
const TABS = [['info', 'Info'], ['zonas', 'Zonas'], ['llaves', 'Llaves'], ['resultados', 'Resultados'], ['posiciones', 'Posiciones']];
export function JugadorTorneo() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'info';
  const [categoria, setCategoria] = useState(null);
  const [soloMios, setSoloMios] = useState(false);
  const c = useCarga(() => jugador.torneo(id, categoria ? { categoria_id: categoria } : {}), [id, categoria]);
  const rk = useCarga(() => (tab === 'posiciones' && c.data ? jugador.posiciones(id, { categoria_id: c.data.categoria_id }) : Promise.resolve(null)), [id, tab, c.data?.categoria_id]);
  const setTab = (k) => setParams(p => { p.set('tab', k); return p; }, { replace: true });
  // Tiempo real: mientras el torneo se juega, se refresca cada 30 s (sin perder lo que se ve)
  const enJuego = ['zonas', 'llaves'].includes(c.data?.torneo?.estado);
  const { recargar } = c;
  useEffect(() => {
    if (!enJuego) return undefined;
    const t = setInterval(() => { if (!document.hidden) recargar(); }, 30000);
    return () => clearInterval(t);
  }, [enJuego, recargar]);
  return (
    <Layout>
      <Link to="/jugador/torneos" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Mis Torneos</Link>
      <Estado c={c} filas={4}>{(d) => {
        const t = d.torneo;
        const partidos = [...d.zonas.flatMap(z => z.partidos), ...d.llave.flatMap(r => r.partidos)].filter(p => !p.es_bye);
        const mios = d.mi_pareja_id ? partidos.filter(p => p.pareja1?.id === d.mi_pareja_id || p.pareja2?.id === d.mi_pareja_id) : [];
        return (
          <>
            <div className="card space-y-1">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{t.nombre}</h1><EstadoBadge estado={t.estado} /></div>
              <div className="text-sm text-muted-foreground">{t.liga && <Link to={`/jugador/liga/${t.liga.id}`} className="text-primary">{t.liga.nombre}</Link>} · {t.categorias.map(x => x.nombre).join(' · ')} {GENEROS[t.genero]}</div>
              <div className="text-sm text-muted-foreground">{fechaCorta(t.fecha_inicio)} → {fechaCorta(t.fecha_fin)}{t.club && ` · ${t.club.nombre}`}</div>
              {!t.participa && <div className="text-xs text-muted-foreground">No jugás este torneo: lo ves por ser de tu misma liga.</div>}
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
              {TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>{l}</button>
              ))}
            </div>
            {tab !== 'info' && d.categorias?.length > 1 && <CategoriaTabs categorias={d.categorias} value={d.categoria_id} onChange={setCategoria} />}
            {c.cargando && <Sk className="h-1 w-full" />}

            {tab === 'info' && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="card"><div className="text-xs text-muted-foreground">Formato</div><div className="text-sm">Zonas de {t.parejas_por_zona}, clasifican {t.clasifican_por_zona}</div></div>
                  <div className="card"><div className="text-xs text-muted-foreground">Zonas</div><div className="text-xl font-bold">{d.zonas.length}</div></div>
                  <div className="card"><div className="text-xs text-muted-foreground">Partidos</div><div className="text-xl font-bold">{partidos.length}</div></div>
                </div>
                {t.descripcion && <div className="card text-sm whitespace-pre-line">{t.descripcion}</div>}
                {d.mi_pareja_id && (
                  <section className="space-y-2">
                    <h2 className="font-semibold">Mis partidos</h2>
                    {mios.length ? <Cronograma partidos={mios} /> : <Vacio icon={CalendarDays} titulo="Todavía no tenés partidos programados" />}
                  </section>
                )}
              </div>
            )}
            {tab === 'zonas' && (d.zonas.length
              ? <div className="grid xl:grid-cols-2 gap-4 items-start">{d.zonas.map(z => <ZonaGrilla key={z.zona_id} zona={z} />)}</div>
              : <Vacio icon={Layers} titulo="Las zonas todavía no están armadas" texto="Se publican al cerrar la inscripción." />)}
            {tab === 'llaves' && <Bracket llave={d.llave} campeonId={d.campeon} prevista={d.llave_prevista} />}
            {tab === 'resultados' && (
              <div className="space-y-3">
                {d.mi_pareja_id && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={soloMios} onChange={e => setSoloMios(e.target.checked)} /> Solo mis partidos</label>}
                <Cronograma partidos={soloMios ? mios : partidos} />
              </div>
            )}
            {tab === 'posiciones' && (
              <div className="space-y-5">
                {d.zonas.length > 0 && <div className="grid lg:grid-cols-2 gap-4">{d.zonas.map(z => <TablaZona key={z.zona_id} zona={z} mostrarRanking={t.tipo === 'anual'} />)}</div>}
                <h3 className="font-semibold">Ranking por jugador</h3>
                {rk.cargando ? <Esqueleto filas={2} /> : rk.error ? <ErrorVista error={rk.error} onReintentar={rk.recargar} /> : <RankingJugadores filas={rk.data} />}
              </div>
            )}
          </>
        );
      }}</Estado>
    </Layout>
  );
}

// ── Ligas ─────────────────────────────────────────────────────
export function JugadorLigas() {
  const c = useCarga(() => jugador.dashboard(), []);
  return (
    <Layout>
      <h1 className="text-xl font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-primary" /> Mis Ligas</h1>
      <Estado c={c} filas={2}>{(d) => d.ligas.length ? (
        <div className="space-y-2">{d.ligas.map(l => (
          <Link key={l.id} to={`/jugador/liga/${l.id}`} className="card flex items-center gap-3 hover:border-primary/60 transition-colors">
            <Layers className="w-7 h-7 text-primary" /><span className="font-semibold flex-1">{l.nombre}</span><ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}</div>
      ) : <Vacio icon={Layers} titulo="Todavía no participás en ninguna liga" />}</Estado>
    </Layout>
  );
}

export function JugadorLiga() {
  const { id } = useParams();
  const [temporada, setTemporada] = useState('');
  const [page, setPage] = useState(1);
  const c = useCarga(() => jugador.liga(id), [id]);
  const h = useCarga(() => jugador.historial(id, { page, limit: 10, ...(temporada && { temporada }) }), [id, page, temporada]);
  return (
    <Layout>
      <Link to="/jugador/ligas" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Mis Ligas</Link>
      <Estado c={c} filas={3}>{(d) => {
        const enCurso = d.fechas.filter(t => !['finalizado', 'cancelado'].includes(t.estado));
        return (
          <>
            <div className="card">
              <h1 className="text-xl font-bold">{d.liga.nombre}</h1>
              {d.liga.club && <div className="text-sm text-muted-foreground">{d.liga.club.nombre}{d.liga.club.ciudad && ` · ${d.liga.club.ciudad}`}</div>}
            </div>
            <section className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Fechas en curso</h2>
              {enCurso.length ? <div className="space-y-2">{enCurso.map(t => <TorneoCard key={t.id} t={t} />)}</div> : <Vacio titulo="No hay fechas en curso" />}
            </section>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Historial de fechas</h2>
                <label className="text-sm text-muted-foreground flex items-center gap-2">Temporada
                  <select className="input text-sm !w-auto" value={temporada} onChange={e => { setTemporada(e.target.value); setPage(1); }}>
                    <option value="">Todas</option>
                    {d.temporadas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select></label>
              </div>
              <Estado c={h} filas={2}>{(hd) => hd.items.length ? (
                <>
                  <div className="space-y-2">{hd.items.map(t => <TorneoCard key={t.id} t={t} tab="resultados" />)}</div>
                  <Paginador page={hd.page} limit={hd.limit} total={hd.total} onPage={setPage} />
                </>
              ) : <Vacio icon={History} titulo="Sin fechas finalizadas" texto={temporada ? `No hay fechas cerradas en ${temporada}.` : 'Cuando termine una fecha aparece acá.'} />}</Estado>
            </section>
          </>
        );
      }}</Estado>
    </Layout>
  );
}
