import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Settings, MapPin, Users, CalendarDays, GitBranch, BarChart2, MessageCircle,
  ImagePlus, ExternalLink, RefreshCw, Check, X, Pencil, Send, Smartphone, Download,
} from 'lucide-react';
import TorneoForm from './TorneoForm';
import HorariosEditor from './HorariosEditor';
import InscripcionForm from './InscripcionForm';
import TelefonoEntidad from '../TelefonoEntidad';
import CompartirMensaje from '../CompartirMensaje';
import { TablaZona, PartidoRow, ZonaGrilla, Bracket, RankingJugadores, Cronograma, imprimirFixture } from './FixtureViews';
import { CategoriaTabs } from './CategoriasSelect';
import ReprogramarModal from './ReprogramarModal';
import ResultadoModal from './ResultadoModal';
import { useAuth } from '../../context/AuthContext';
import PlantelModal from './PlantelModal';
import { ResumenRelampago } from './FormatoRelampago';
import { uploadUrl } from '../../services/torneosService';
import {
  ESTADO_TORNEO, ESTADO_PAGO, GENEROS, TIPO_TORNEO, catLabel, money, fechaCorta, nombrePareja, errMsg, RONDA_LABEL, diasTorneo,
  catNombre, catsTexto,
} from '../../utils/torneos';

const SECCIONES = [
  { key: 'datos',         label: 'Datos',          icon: Settings },
  { key: 'canchas',       label: 'Canchas',        icon: MapPin },
  { key: 'inscripciones', label: 'Inscripciones',  icon: Users },
  { key: 'fixture',       label: 'Partidos',       icon: CalendarDays },
  { key: 'llave',         label: 'Llave',          icon: GitBranch },
  { key: 'posiciones',    label: 'Posiciones',     icon: BarChart2 },
  { key: 'comunicacion',  label: 'Comunicación',   icon: MessageCircle },
  { key: 'whatsapp',      label: 'WhatsApp propio', icon: Smartphone },
];

const Loader = () => <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" /></div>;
const Aviso = ({ tipo = 'error', children }) => children
  ? <div className={`text-sm rounded-lg px-3 py-2 ${tipo === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{children}</div>
  : null;

/**
 * Panel completo de un torneo: datos, canchas/horarios, inscripciones y pagos,
 * partidos y resultados, llave, posiciones y comunicación.
 * @param {object} svc      torneosStaff(client, complexId)
 * @param {number} torneoId
 */
export default function TorneoManager({ svc, torneoId, onBack, admin = true }) {
  const [torneo, setTorneo] = useState(null);
  const [seccion, setSeccion] = useState('datos');
  const [error, setError] = useState('');
  // Cuadro (categoría) sobre el que trabajan Inscripciones / Partidos / Llave / Posiciones
  const [categoria, setCategoria] = useState(null);
  // Permisos granulares (reprogramar / editar plantel): se validan también en el backend
  const [permisos, setPermisos] = useState({});
  useEffect(() => { svc.permisos?.().then(r => setPermisos(r.permisos || {})).catch(() => setPermisos({})); }, [svc]);

  const recargar = useCallback(() => svc.get(torneoId).then(setTorneo).catch(e => setError(errMsg(e))), [svc, torneoId]);
  useEffect(() => { recargar(); }, [recargar]);
  useEffect(() => {
    if (!torneo?.categorias?.length) return;
    if (!torneo.categorias.some(c => c.categoria_id === categoria)) {
      setCategoria((torneo.categorias.find(c => c.estado !== 'pendiente' && c.estado !== 'finalizado') || torneo.categorias[0]).categoria_id);
    }
  }, [torneo, categoria]);

  if (!torneo) return error ? <Aviso>{error}</Aviso> : <Loader />;
  const est = ESTADO_TORNEO[torneo.estado];
  const porCategoria = ['inscripciones', 'fixture', 'llave', 'posiciones'].includes(seccion);

  const cambiarEstado = async (estado, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { setTorneo(await svc.setEstado(torneo.id, estado)); } catch (e) { alert(errMsg(e)); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted" aria-label="Volver"><ArrowLeft className="w-5 h-5" /></button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{torneo.nombre}</h2>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 items-center">
            <span className={est.cls}>{est.label}</span>
            <span className="badge-blue">{TIPO_TORNEO[torneo.tipo]?.label}</span>
            {torneo.formato === 'relampago' && <span className="badge-yellow">Relámpago</span>}
            {torneo.liga && <span className="badge-neutral">{torneo.liga.nombre}</span>}
            <span>{catsTexto(torneo)} · {GENEROS[torneo.genero]}</span>
            <span>{fechaCorta(torneo.fecha_inicio)} → {fechaCorta(torneo.fecha_fin)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/torneos/${torneo.id}`} target="_blank" rel="noreferrer" className="btn-outline text-sm flex items-center gap-1">
            <ExternalLink className="w-4 h-4" /> Página pública
          </a>
          {torneo.estado === 'borrador' && <button className="btn-primary text-sm" onClick={() => cambiarEstado('inscripcion')}>Abrir inscripción</button>}
          {torneo.estado === 'inscripcion' && <button className="btn-outline text-sm" onClick={() => cambiarEstado('borrador')}>Cerrar inscripción</button>}
          {!['finalizado', 'cancelado'].includes(torneo.estado) && (
            <button className="text-sm text-red-400 px-3 hover:underline" onClick={() => cambiarEstado('cancelado', '¿Cancelar el torneo?')}>Cancelar torneo</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {SECCIONES.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSeccion(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors
              ${seccion === key ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {torneo.formato === 'relampago' && ['fixture', 'llave', 'posiciones'].includes(seccion) && <ResumenRelampago torneo={torneo} />}
      {porCategoria && <CategoriaTabs categorias={torneo.categorias} value={categoria} onChange={setCategoria} />}

      {seccion === 'datos'         && <DatosSeccion svc={svc} torneo={torneo} onSaved={setTorneo} />}
      {seccion === 'canchas'       && <CanchasSeccion svc={svc} torneo={torneo} />}
      {seccion === 'inscripciones' && <InscripcionesSeccion key={categoria} svc={svc} torneo={torneo} categoria={categoria} permisos={permisos} />}
      {seccion === 'fixture'       && categoria && <PartidosSeccion key={categoria} svc={svc} torneo={torneo} categoria={categoria} onChange={recargar} permisos={permisos} />}
      {seccion === 'llave'         && categoria && <LlaveSeccion key={categoria} svc={svc} torneo={torneo} categoria={categoria} onChange={recargar} permisos={permisos} />}
      {seccion === 'posiciones'    && categoria && <PosicionesSeccion key={categoria} svc={svc} torneo={torneo} categoria={categoria} admin={admin} />}
      {seccion === 'comunicacion'  && <ComunicacionSeccion svc={svc} torneo={torneo} />}
      {seccion === 'whatsapp'      && <TelefonoEntidad svc={svc.telefono(torneo.id)} quienes="inscriptos" />}
    </div>
  );
}

// ── Datos + imagen del evento ─────────────────────────────────
function DatosSeccion({ svc, torneo, onSaved }) {
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try { onSaved(await svc.subirImagen(torneo.id, file)); } catch (err) { alert(errMsg(err)); } finally { setSubiendo(false); }
  };
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-5">
      <TorneoForm key={torneo.updatedAt} svc={svc} initial={torneo} bloqueado={!['borrador', 'inscripcion'].includes(torneo.estado)}
        onSave={async (d) => onSaved(await svc.update(torneo.id, d))} />
      <div className="card space-y-3 h-fit">
        <div className="font-semibold text-sm">Imagen del evento</div>
        <p className="text-xs text-muted-foreground">Se imprime en el ticket QR de cada jugador.</p>
        {torneo.imagen_evento
          ? <img src={uploadUrl(torneo.imagen_evento)} alt="Imagen del torneo" className="w-full rounded-lg aspect-video object-cover" />
          : <div className="aspect-video rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">Sin imagen</div>}
        <label className="btn-outline text-sm flex items-center justify-center gap-2 cursor-pointer">
          <ImagePlus className="w-4 h-4" /> {subiendo ? 'Subiendo…' : 'Subir imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={subir} />
        </label>
      </div>
    </div>
  );
}

// ── Canchas cedidas + horarios ────────────────────────────────
function CanchasSeccion({ svc, torneo }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({});       // field_id → franjas[]
  const [msg, setMsg] = useState({});

  useEffect(() => {
    svc.getCanchas(torneo.id).then(d => {
      setData(d);
      setSel(Object.fromEntries(d.asignadas.map(a => [a.field_id, a.disponibilidad_horaria])));
    }).catch(e => setMsg({ error: errMsg(e) }));
  }, [svc, torneo.id]);

  if (!data) return msg.error ? <Aviso>{msg.error}</Aviso> : <Loader />;
  const toggle = (f) => setSel(s => {
    const n = { ...s };
    if (n[f.id]) delete n[f.id];
    else n[f.id] = [{ fecha: null, desde: f.hora_apertura || '09:00', hasta: f.hora_cierre || '22:00' }];
    return n;
  });
  const guardar = async () => {
    setMsg({});
    try {
      const d = await svc.setCanchas(torneo.id, Object.entries(sel).map(([field_id, disponibilidad_horaria]) => ({ field_id: Number(field_id), disponibilidad_horaria })));
      setData(d);
      setMsg({ ok: `Guardado. ${d.slots_disponibles} turnos de ${torneo.duracion_partido} min disponibles para el torneo.` });
    } catch (e) { setMsg({ error: errMsg(e) }); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        El complejo tiene <strong className="text-foreground">{data.canchas_complejo}</strong> canchas de pádel.
        Elegí las que cede al torneo y en qué horarios. Las reservas ya tomadas en esas canchas se respetan.
      </p>
      <div className="space-y-3">
        {data.canchas.map(f => (
          <div key={f.id} className={`card space-y-3 ${sel[f.id] ? 'border-primary/50' : ''}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={Boolean(sel[f.id])} onChange={() => toggle(f)} className="w-4 h-4 accent-primary" />
              <span className="font-medium">{f.nombre}{f.identificador ? ` (${f.identificador})` : ''}</span>
              {!f.activa && <span className="badge-red">Inactiva</span>}
              {f.techada && <span className="badge-blue">Techada</span>}
            </label>
            {sel[f.id] && (
              <HorariosEditor value={sel[f.id]} onChange={v => setSel(s => ({ ...s, [f.id]: v }))}
                fechaInicio={torneo.fecha_inicio} fechaFin={torneo.fecha_fin} />
            )}
          </div>
        ))}
      </div>
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
      <button className="btn-primary" onClick={guardar}>Guardar canchas y horarios</button>
    </div>
  );
}

// ── Inscripciones y pagos ─────────────────────────────────────
function InscripcionesSeccion({ svc, torneo, categoria, permisos = {} }) {
  const [data, setData] = useState(null);
  const [plantel, setPlantel] = useState(null);   // pareja en edición
  const [filtro, setFiltro] = useState('');
  const multi = (torneo.categorias || []).length > 1;
  const [alta, setAlta] = useState(false);
  const [pagado, setPagado] = useState(false);

  const cargar = useCallback(() => svc.listParejas(torneo.id, multi && categoria ? { categoria_id: categoria } : {}).then(setData).catch(() => {}), [svc, torneo.id, categoria, multi]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!data) return <Loader />;

  const setPago = async (p, estado_pago, metodo_pago) => {
    const txt = { pagado: 'marcar como PAGADA', cancelado: 'CANCELAR', reembolsado: 'REEMBOLSAR' }[estado_pago];
    if (!confirm(`¿${txt} la inscripción de ${nombrePareja(p)}?${estado_pago === 'reembolsado' && p.mp_payment_id ? '\nSe devolverá el dinero por MercadoPago.' : ''}`)) return;
    try { await svc.setPago(torneo.id, p.id, { estado_pago, metodo_pago }); cargar(); } catch (e) { alert(errMsg(e)); }
  };
  const anual = data.tipo === 'anual';
  const modalPlantel = plantel && <PlantelModal svc={svc} torneo={torneo} pareja={plantel} permisos={permisos} onClose={() => { setPlantel(null); cargar(); }} onCambio={cargar} />;
  const lista = data.parejas.filter(p => !filtro || p.estado_pago === filtro)
    // Anual: ordenadas por puntos de ranking (así quedan los cabezas de serie)
    .sort((a, b) => (anual ? (b.puntos_ranking || 0) - (a.puntos_ranking || 0) : 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Cupo del torneo', data.cupo], [multi ? `Inscriptas ${catNombre(categoria)}` : 'Inscriptas', multi ? data.parejas.filter(p => ['pendiente', 'pagado'].includes(p.estado_pago)).length : data.ocupados], ['Libres (torneo)', data.libres], ['Recaudado', money(data.recaudado)]].map(([l, v]) => (
          <div key={l} className="card py-3"><div className="text-xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>

      {modalPlantel}
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input !w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PAGO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-primary text-sm ml-auto" onClick={() => setAlta(a => !a)}>{alta ? 'Cerrar' : '+ Inscribir pareja'}</button>
      </div>

      {alta && (
        <InscripcionForm torneo={torneo} svc={svc} categoriaInicial={categoria}
          extra={Number(torneo.precio_inscripcion) > 0 && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pagado} onChange={e => setPagado(e.target.checked)} /> Ya pagó (efectivo / transferencia)</label>
          )}
          onSubmit={async (d) => { await svc.createPareja(torneo.id, { ...d, pagado, metodo_pago: 'efectivo' }); setAlta(false); cargar(); }} />
      )}

      <div className="space-y-2">
        {lista.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Sin inscripciones.</div>}
        {lista.map(p => (
          <div key={p.id} className="card py-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {nombrePareja(p)}
                {multi && p.categoria_id && <span className="ml-2 badge-neutral">{catNombre(p.categoria_id)}</span>}
                {anual && <span className="ml-2 text-xs text-primary font-semibold">{p.puntos_ranking || 0} pts ranking</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.jugadores.map(j => `${j.nombre}: ${catLabel(j.categoria)} · DNI ${j.dni} · ${j.whatsapp}`).join('  |  ')}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Horarios: {(p.horarios_preferidos || []).map(h => `${h.fecha ? fechaCorta(h.fecha) : 'todos'} ${h.desde}-${h.hasta}`).join(', ')}
                {p.zona && <> · <span className="text-primary">{p.zona.nombre}</span></>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={ESTADO_PAGO[p.estado_pago].cls}>{ESTADO_PAGO[p.estado_pago].label}{p.metodo_pago ? ` · ${p.metodo_pago}` : ''}</span>
              {p.estado_pago === 'pendiente' && <>
                <button className="btn-outline text-xs !px-2 !py-1" onClick={() => setPago(p, 'pagado', 'efectivo')}>Cobrar efectivo</button>
                <button className="btn-outline text-xs !px-2 !py-1" onClick={() => setPago(p, 'pagado', 'transferencia')}>Transferencia</button>
                <button className="text-xs text-red-400 hover:underline" onClick={() => setPago(p, 'cancelado')}>Cancelar</button>
              </>}
              {p.estado_pago === 'pagado' && !p.zona && (
                <button className="text-xs text-red-400 hover:underline" onClick={() => setPago(p, 'reembolsado')}>Reembolsar</button>
              )}
              {['pendiente', 'pagado'].includes(p.estado_pago) && permisos['tournament.team.edit_players'] !== false && (
                <button className="btn-outline text-xs !px-2 !py-1 flex items-center gap-1" onClick={() => setPlantel(p)}><Users className="w-3.5 h-3.5" /> Editar plantel</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Partidos: armado de zonas, programación y resultados ──────
function PartidosSeccion({ svc, torneo, onChange, categoria, permisos = {} }) {
  const [fx, setFx] = useState(null);
  const [msg, setMsg] = useState({});
  const [reparto, setReparto] = useState(null);
  const [incluirPend, setIncluirPend] = useState(false);
  const [editando, setEditando] = useState(null);   // { id, modo: 'resultado' | 'horario' }

  const cargar = useCallback(() => svc.fixture(torneo.id, categoria).then(setFx).catch(e => setMsg({ error: errMsg(e) })), [svc, torneo.id, categoria]);
  useEffect(() => { cargar(); }, [cargar, torneo.estado]);

  const anual = torneo.tipo === 'anual';
  const estadoCat = fx?.categorias?.find(c => c.categoria_id === fx.categoria_id)?.estado;
  // Paso 1: vista previa de la siembra (no guarda). Paso 2: confirmar con la firma de esa vista.
  const [preview, setPreview] = useState(null);
  const [cargandoPrev, setCargandoPrev] = useState(false);
  const [vistaPartidos, setVistaPartidos] = useState('zonas');   // zonas | dias
  const verPreview = async () => {
    setMsg({}); setCargandoPrev(true);
    try { setPreview(await svc.previewZonas(torneo.id, { incluir_pendientes: incluirPend, categoria_id: categoria })); }
    catch (e) { setPreview(null); setMsg({ error: errMsg(e) }); } finally { setCargandoPrev(false); }
  };
  const armarZonas = async () => {
    setMsg({});
    try {
      const r = await svc.generarZonas(torneo.id, { incluir_pendientes: incluirPend, categoria_id: categoria, firma: preview.firma });
      setReparto(r.reparto); setPreview(null);
      setMsg({ ok: `${r.zonas} zonas con ${r.parejas} parejas por siembra en serpiente.${r.sin_programar ? ` ⚠️ ${r.sin_programar} partidos sin lugar: programalos a mano.` : ''}` });
      onChange(); cargar();
    } catch (e) {
      setMsg({ error: errMsg(e) });
      // Si cambiaron las inscripciones, se recalcula la vista previa
      if (/vista previa/i.test(errMsg(e))) verPreview();
    }
  };
  const [reprogramando, setReprogramando] = useState(null);   // partido en el modal
  const abrirHorario = (p) => setReprogramando(p);
  const guardarResultado = async (p, d) => {
    const r = await svc.setResultado(torneo.id, p.id, d);
    setEditando(null);
    if (r.llave && !r.llave.error) setMsg({ ok: `Zonas terminadas: se armó la llave de ${r.llave.tam} (${r.llave.byes} byes).` });
    onChange(); cargar();
  };
  const borrarResultado = async (p) => {
    if (!confirm('¿Borrar este resultado? En zonas de 4 también se vacían los cruces que dependían de él.')) return;
    try { await svc.borrarResultado(torneo.id, p.id); cargar(); } catch (e) { alert(errMsg(e)); }
  };

  if (!fx) return <Loader />;
  const llave = fx.llave.flatMap(r => r.partidos).filter(p => !p.es_bye);
  const todos = [...fx.zonas.flatMap(z => z.partidos), ...llave];
  const sinProgramar = todos.filter(p => !p.fecha).length;

  // Botones + formularios desplegables de cada partido
  const acciones = (p) => (
    <div className="flex gap-1 shrink-0 items-center">
      {p.pareja1?.id && p.pareja2?.id && (
        <button className="btn-outline text-xs !px-2 !py-1" onClick={() => setEditando({ id: p.id, modo: 'resultado' })}>
          {p.resultado ? 'Corregir' : 'Resultado'}
        </button>
      )}
      {p.resultado && p.ronda === 'zona' && estadoCat === 'zonas' && (
        <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" title="Borrar resultado" onClick={() => borrarResultado(p)}><X className="w-4 h-4" /></button>
      )}
      {!p.resultado && !p.es_bye && permisos['tournament.match.reschedule'] !== false && (
        <button className="btn-ghost text-xs !px-2 !py-1 flex items-center gap-1" title="Reprogramar partido" onClick={() => abrirHorario(p)}><Pencil className="w-4 h-4" /><span className="hidden md:inline">Reprogramar</span></button>
      )}
    </div>
  );
  // La carga de resultado es un modal (ResultadoModal); no hay editores en línea
  const editor = () => null;
  const enCarga = editando?.modo === 'resultado' ? todos.find(x => x.id === editando.id) : null;

  return (
    <div className="space-y-4">
      {enCarga && (
        <ResultadoModal torneo={torneo} p={enCarga} categoriaNombre={(torneo.categorias || []).length > 1 || categoria ? catNombre(categoria) : null}
          onClose={() => setEditando(null)} onSave={(d) => guardarResultado(enCarga, d)} />
      )}
      {['pendiente', 'zonas'].includes(estadoCat) && !['finalizado', 'cancelado'].includes(torneo.estado) && (
        <div className="card space-y-2">
          <div className="font-semibold text-sm flex items-center gap-2">
            {fx.zonas.length ? 'Rearmar zonas' : 'Armar zonas y fixture'}{(torneo.categorias || []).length > 1 && ` de ${catNombre(categoria)}`}
            <span className="badge-blue">{TIPO_TORNEO[torneo.tipo]?.label}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Zonas de {torneo.parejas_por_zona} por <strong>siembra en serpiente</strong>: cada pareja suma los puntos de sus dos jugadores en el ranking de la liga y la categoría.
            Las mejores son cabezas de serie (1→Zona A, 2→Zona B…) y el resto se reparte ida y vuelta (N→1, 1→N…). Empates: más torneos jugados, más partidos ganados, inscripción más antigua.
            {' '}En zonas de 4 se juega 1v3 y 2v4; después ganador P1 vs perdedor P2 y ganador P2 vs perdedor P1. Cada partido se programa respetando canchas y horarios preferidos.
          </p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={incluirPend} onChange={e => setIncluirPend(e.target.checked)} /> Incluir parejas con pago pendiente</label>
          <button className="btn-primary text-sm" onClick={verPreview} disabled={cargandoPrev}>{cargandoPrev ? 'Calculando…' : fx.zonas.length ? 'Ver nueva distribución' : 'Generar zonas'}</button>
        </div>
      )}
      {preview && (
        <PreviewZonas preview={preview} onConfirmar={armarZonas} onRecalcular={verPreview} onCancelar={() => setPreview(null)} rearmar={fx.zonas.length > 0} />
      )}
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
      {reparto && (
        <div className="card text-xs space-y-1">
          <div className="font-semibold text-sm mb-1">Cabezas de serie y reparto (serpiente)</div>
          {reparto.map(z => (
            <div key={z.zona}><span className="font-medium">{z.zona}:</span> {z.parejas.map(p => `${p.cabeza_serie ? '🏆 ' : ''}#${p.siembra ?? p.numero} ${p.nombre || ''} (${p.puntos} pts)`).join(' · ')}</div>
          ))}
        </div>
      )}
      {sinProgramar > 0 && <Aviso>{sinProgramar} partidos sin cancha/horario asignado.</Aviso>}
      {reprogramando && (
        <ReprogramarModal svc={svc} torneo={torneo} partido={reprogramando} partidos={todos} permisos={permisos}
          onClose={() => setReprogramando(null)}
          onGuardado={(nueva) => { setReprogramando(null); setMsg({ ok: `Partido reprogramado: ${nueva}.` }); cargar(); onChange(); }} />
      )}
      {todos.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Todavía no hay partidos.</div>}

      {todos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="tablist" aria-label="Vista de partidos">
            {[['zonas', 'Por zona'], ['dias', 'Por día y horario']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={vistaPartidos === k} onClick={() => setVistaPartidos(k)}
                className={`px-3 py-1.5 rounded-lg text-sm ${vistaPartidos === k ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{l}</button>
            ))}
          </div>
          <button className="btn-outline text-sm ml-auto flex items-center gap-1.5"
            onClick={() => imprimirFixture({ torneo, fx, categoria: (torneo.categorias || []).length > 1 ? catNombre(categoria) : null })}>
            <Download className="w-4 h-4" /> Descargar PDF
          </button>
        </div>
      )}

      {vistaPartidos === 'dias' ? (
        <div className="space-y-2">
          <Cronograma partidos={todos} accionesDe={acciones} />
          {todos.map(p => editando?.id === p.id && <div key={p.id}>{editor(p)}</div>)}
        </div>
      ) : (
        <>
          {/* Zonas: grilla por zona con parejas numeradas y P1…Pn */}
          <div className="grid 2xl:grid-cols-2 gap-4 items-start">
            {fx.zonas.map(z => (
              <div key={z.zona_id} className="space-y-2">
                <ZonaGrilla zona={z} accionesDe={acciones} />
                {z.partidos.map(p => <div key={p.id}>{editor(p)}</div>)}
              </div>
            ))}
          </div>

          {/* Llave */}
          {llave.length > 0 && <h3 className="font-semibold pt-2">Llave</h3>}
          {llave.map(p => (
            <div key={p.id} className="space-y-2">
              <PartidoRow p={p} etiqueta={RONDA_LABEL[p.ronda]} acciones={acciones(p)} />
              {editor(p)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Vista previa de la siembra en serpiente: zonas con posición de ranking, pareja y puntos.
 * Confirmar guarda exactamente esta distribución (si cambió algo, el backend pide recalcular).
 */
function PreviewZonas({ preview, onConfirmar, onRecalcular, onCancelar, rearmar }) {
  const [enviando, setEnviando] = useState(false);
  const confirmar = async () => {
    if (rearmar && !confirm('Se borran las zonas y partidos actuales de esta categoría y se arman con esta distribución. ¿Continuar?')) return;
    setEnviando(true);
    try { await onConfirmar(); } finally { setEnviando(false); }
  };
  return (
    <div className="card space-y-3 border-primary/40">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-semibold text-sm mr-auto">Vista previa · {preview.cantidad_zonas} zonas · {preview.parejas} parejas · Ranking Anual {preview.ranking?.temporada} + serpiente</div>
        <button className="btn-ghost text-sm" onClick={onRecalcular} title="Vuelve a leer el ranking anual y rearma la serpiente"><RefreshCw className="w-4 h-4" /> Recalcular siembra</button>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {preview.zonas.map(z => (
          <div key={z.zona} className="rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2 font-semibold text-sm bg-muted/50">{z.zona}</div>
            <ul className="divide-y divide-border text-sm">
              {z.parejas.map(p => (
                <li key={p.id} className="px-3 py-2 flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground w-7 shrink-0" title="Posición en el ranking">#{p.siembra}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.nombre}</span>
                    {p.jugadores?.length > 0 && <span className="block text-[11px] text-muted-foreground truncate">{p.jugadores.map(j => `${j.nombre} ${j.puntos}`).join(' + ')}</span>}
                    {p.cabeza_serie && <span className="text-[11px] text-primary font-medium">🏆 Cabeza de serie · Seed #{p.siembra}</span>}
                  </span>
                  <span className="font-semibold shrink-0">{p.puntos_totales} pts</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Al confirmar se guardan las zonas, se programan los partidos y se avisa a los jugadores. Si alguien se inscribe o se da de baja antes, se recalcula la distribución.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-sm" onClick={confirmar} disabled={enviando}><Check className="w-4 h-4" /> {enviando ? 'Armando…' : 'Confirmar y armar zonas'}</button>
        <button className="btn-outline text-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Llave ─────────────────────────────────────────────────────
function LlaveSeccion({ svc, torneo, onChange, categoria, permisos = {} }) {
  const { isGeneralAdmin } = useAuth();
  const [borrando, setBorrando] = useState(false);
  const [reprogramando, setReprogramando] = useState(null);   // partido de la llave en el modal
  const [fx, setFx] = useState(null);
  const [msg, setMsg] = useState({});
  const cargar = useCallback(() => svc.fixture(torneo.id, categoria).then(setFx).catch(() => {}), [svc, torneo.id, categoria]);
  useEffect(() => { cargar(); }, [cargar, torneo.estado]);
  // Actualización automática (resultados cargados desde otro dispositivo) mientras se juega
  useEffect(() => {
    if (!['zonas', 'llaves'].includes(torneo.estado)) return undefined;
    const t = setInterval(() => { if (!document.hidden && !reprogramando) cargar(); }, 30000);
    return () => clearInterval(t);
  }, [cargar, torneo.estado, reprogramando]);
  if (!fx) return <Loader />;

  const generar = async (forzar) => {
    if (forzar && !confirm('Faltan resultados de zona. ¿Generar la llave con las posiciones actuales?')) return;
    try {
      const r = await svc.generarLlave(torneo.id, { forzar, categoria_id: categoria });
      setMsg({ ok: `Llave de ${r.tam} con ${r.clasificados} clasificados (${r.byes} byes a los mejores).` });
      onChange(); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const zonasCompletas = fx.zonas.length > 0 && fx.zonas.every(z => z.completa);
  const tc = fx.categorias?.find(c => c.categoria_id === fx.categoria_id);
  const estadoCat = tc?.estado;

  return (
    <div className="space-y-4">
      {['pendiente', 'zonas'].includes(estadoCat) && (
        <InicioLlave svc={svc} torneo={torneo} tc={tc} prevista={fx.llave_prevista} onGuardado={(m) => { setMsg({ ok: m }); cargar(); }} onError={(m) => setMsg({ error: m })} />
      )}
      {estadoCat === 'zonas' && (
        <div className="card flex flex-wrap items-center gap-3">
          <p className="text-sm flex-1">
            {zonasCompletas ? 'Todas las zonas terminaron.' : 'La llave se arma sola al cargar el último resultado de zona.'} Clasifican {torneo.clasifican_por_zona} por zona;
            los cruces son fijos por zona y posición (ver la llave de referencia); si no se completa el cuadro, los primeros de zona reciben BYE.
          </p>
          <button className="btn-primary text-sm" onClick={() => generar(!zonasCompletas)}>Generar llave{zonasCompletas ? '' : ' (forzar)'}</button>
        </div>
      )}
      {isGeneralAdmin && fx.llave.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-red-500/40">
          <p className="text-sm flex-1">
            <strong>Administrador General:</strong> borrar la llave de {fx.categorias?.length > 1 ? `la ${tc?.nombre || 'categoría'}` : 'este torneo'} elimina sus partidos y resultados de fase final.
            Las zonas y sus resultados se conservan y la llave se puede volver a generar.
            {tc?.puntos_asignados && ' No disponible: la categoría ya asignó puntos al ranking anual.'}
          </p>
          <button className="btn-outline text-sm !text-red-400 !border-red-500/50" disabled={borrando || tc?.puntos_asignados} onClick={async () => {
            const jugados = fx.llave.flatMap(r => r.partidos).filter(p => !p.es_bye && p.resultado).length;
            if (!window.confirm(`¿Borrar la llave${fx.categorias?.length > 1 ? ` de ${tc?.nombre}` : ''}?${jugados ? `\n\nSe perderán ${jugados} resultado(s) ya cargado(s).` : ''}\n\nEsta acción no se puede deshacer.`)) return;
            setBorrando(true); setMsg({});
            try {
              const r = await svc.borrarLlave(torneo.id, fx.categoria_id);
              setMsg({ ok: `Llave borrada (${r.partidos_borrados} partido(s)${r.resultados_borrados ? `, ${r.resultados_borrados} resultado(s)` : ''}). Podés volver a generarla.` });
              cargar(); onChange();
            } catch (e) { setMsg({ error: errMsg(e) }); } finally { setBorrando(false); }
          }}>{borrando ? 'Borrando…' : 'Borrar llave'}</button>
        </div>
      )}
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
      <Bracket llave={fx.llave} campeonId={fx.campeon} prevista={fx.llave_prevista}
        onReprogramar={permisos['tournament.match.reschedule'] !== false && !['finalizado', 'cancelado'].includes(torneo.estado) ? setReprogramando : undefined} />
      {reprogramando && (
        <ReprogramarModal svc={svc} torneo={torneo} partido={reprogramando} permisos={permisos} categoria={fx.categoria_id}
          partidos={[...fx.zonas.flatMap(z => z.partidos), ...fx.llave.flatMap(r => r.partidos), ...(fx.llave_prevista?.rondas || []).flatMap(r => r.partidos).filter(p => p.fecha)]}
          onClose={() => setReprogramando(null)}
          onGuardado={(nueva) => { setReprogramando(null); setMsg({ ok: `Partido reprogramado: ${nueva}.` }); cargar(); onChange(); }} />
      )}
    </div>
  );
}

/**
 * Inicio de la llave (por categoría): según la cantidad de parejas se informa en qué ronda
 * empieza (ej. 12 parejas → 4 zonas → cuartos). Se elige día y hora de inicio y, aparte,
 * de semifinales y final (por defecto el ÚLTIMO día del torneo). Al guardar se simulan los
 * horarios de cada partido con la disponibilidad de canchas y las demás categorías.
 */
function InicioLlave({ svc, torneo, tc, prevista, onGuardado, onError }) {
  const [v, setV] = useState({
    fecha: tc?.llave_inicio_fecha || '', hora: tc?.llave_inicio_hora || '',
    semis_fecha: tc?.semis_fecha || '', semis_hora: tc?.semis_hora || '',
    final_fecha: tc?.final_fecha || '', final_hora: tc?.final_hora || '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  const dias = diasTorneo(torneo.fecha_inicio, torneo.fecha_fin);
  const ultimo = dias.at(-1);
  const guardar = async (cambios = v) => {
    for (const [f, h, l] of [['fecha', 'hora', 'inicio'], ['semis_fecha', 'semis_hora', 'semifinales'], ['final_fecha', 'final_hora', 'final']]) {
      if (Boolean(cambios[f]) !== Boolean(cambios[h])) return onError(`Completá día y hora de ${l} (o dejá los dos vacíos).`);
    }
    setGuardando(true);
    try {
      const body = Object.fromEntries(Object.entries(cambios).map(([k, x]) => [k, x || null]));
      await svc.inicioLlave(torneo.id, tc.categoria_id, body);
      onGuardado(cambios.fecha ? `Llave desde el ${fechaCorta(cambios.fecha)} a las ${cambios.hora} hs: se simularon los horarios de cada partido.` : 'Guardado: la llave empieza al terminar la fase de zonas.');
    } catch (e) { onError(errMsg(e)); } finally { setGuardando(false); }
  };
  const fila = (titulo, kf, kh, ayuda) => (
    <div className="grid grid-cols-[7rem_1fr_auto] sm:grid-cols-[9rem_auto_auto_1fr] items-end gap-2">
      <span className="text-sm font-medium pb-2">{titulo}</span>
      <label className="text-xs text-muted-foreground">Día
        <select className="input text-sm !w-auto" value={v[kf]} onChange={e => set(kf, e.target.value)}>
          <option value="">{ayuda}</option>
          {dias.map(d => <option key={d} value={d}>{fechaCorta(d)}</option>)}
        </select></label>
      <label className="text-xs text-muted-foreground">Hora
        <input className="input text-sm !w-auto" type="time" step="900" value={v[kh]} onChange={e => set(kh, e.target.value)} /></label>
    </div>
  );
  return (
    <div className="card space-y-3">
      <div className="font-semibold text-sm">Inicio de la llave</div>
      {prevista && (
        <p className="text-sm text-muted-foreground">
          Con {prevista.zonas} zona(s){prevista.estimada ? ' (estimadas con las parejas inscriptas)' : ''} y {Math.min(torneo.clasifican_por_zona, torneo.parejas_por_zona)} clasificado(s) por zona,
          la llave empieza en <strong className="text-foreground">{RONDA_LABEL[prevista.ronda]}</strong> ({prevista.clasificados} parejas{prevista.byes ? `, ${prevista.byes} BYE` : ''}).
        </p>
      )}
      <div className="space-y-2">
        {fila(`Inicio (${prevista ? RONDA_LABEL[prevista.ronda] : 'llave'})`, 'fecha', 'hora', 'Al terminar las zonas')}
        {(!prevista || prevista.ronda !== 'final') && fila('Semifinales', 'semis_fecha', 'semis_hora', `Último día (${fechaCorta(ultimo)})`)}
        {fila('Final', 'final_fecha', 'final_hora', `Último día (${fechaCorta(ultimo)})`)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-sm" disabled={guardando} onClick={() => guardar()}>{guardando ? 'Simulando…' : 'Guardar y simular horarios'}</button>
        <button className="btn-ghost text-sm" disabled={guardando} onClick={() => { const vacio = { fecha: '', hora: '', semis_fecha: '', semis_hora: '', final_fecha: '', final_hora: '' }; setV(vacio); guardar(vacio); }}>Volver a los valores por defecto</button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Por defecto las semifinales y la final se juegan el último día del torneo. La simulación usa las canchas cedidas al torneo, sus franjas, las reservas y los partidos de todas las categorías.
        Al generar la llave se respetan estos horarios y después cada partido se puede reprogramar.
      </p>
    </div>
  );
}

// ── Posiciones ────────────────────────────────────────────────
function PosicionesSeccion({ svc, torneo, categoria, admin }) {
  const [fx, setFx] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [vista, setVista] = useState('zonas');
  const [editando, setEditando] = useState(null);   // fila del jugador
  const [toast, setToast] = useState(null);
  const avisar = (tipo, msg) => { setToast({ tipo, msg }); setTimeout(() => setToast(null), 3500); };
  const cargarRanking = useCallback(() => svc.ranking(torneo.id, categoria).then(setRanking).catch(() => setRanking([])), [svc, torneo.id, categoria]);
  useEffect(() => {
    svc.fixture(torneo.id, categoria).then(setFx).catch(() => {});
    cargarRanking();
  }, [svc, torneo.id, categoria, cargarRanking]);
  if (!fx) return <Loader />;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[['zonas', 'Por zona (parejas)'], ['jugadores', 'Por jugador']].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)} className={`px-3 py-1.5 rounded-lg text-sm ${vista === k ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{l}</button>
        ))}
      </div>
      {vista === 'zonas'
        ? (fx.zonas.length ? <div className="grid lg:grid-cols-2 gap-4">{fx.zonas.map(z => <TablaZona key={z.zona_id} zona={z} mostrarRanking={torneo.tipo === 'anual'} />)}</div>
          : <p className="text-sm text-muted-foreground">Todavía no hay zonas.</p>)
        : <RankingJugadores filas={ranking} onEditar={admin ? setEditando : undefined} />}
      {editando && (
        <PuntajeModal fila={editando} torneo={torneo} onClose={() => setEditando(null)}
          onGuardar={async (d) => {
            const r = await svc.setPuntaje(torneo.id, editando.jugador_id, d);
            setRanking(r.ranking);   // tabla al día sin recargar la página
            setEditando(null);
            avisar('ok', `Puntaje de ${r.jugador.jugador} actualizado: ${r.jugador.puntos} pts (posición ${r.jugador.posicion}).`);
          }} />
      )}
      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`} role="status">{toast.msg}</div>}
    </div>
  );
}

/**
 * Modal "Modificar puntaje": jugador, categoría, torneo, puntaje actual y nuevo (entero ≥ 0),
 * motivo opcional, confirmación antes de guardar y opción de volver al cálculo automático.
 */
function PuntajeModal({ fila, torneo, onClose, onGuardar }) {
  const [valor, setValor] = useState(String(fila.puntos ?? 0));
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const n = Number(valor);
  const invalido = valor.trim() === '' || !Number.isInteger(n) || n < 0;
  const guardar = async (automatico = false) => {
    setError('');
    if (!automatico && invalido) return setError('Ingresá un número entero mayor o igual a 0.');
    const texto = automatico
      ? `¿Volver al puntaje calculado por los partidos (${fila.puntos_calculados ?? 0} pts) para ${fila.jugador}?`
      : `¿Cambiar el puntaje de ${fila.jugador} de ${fila.puntos ?? 0} a ${n} puntos?`;
    if (!window.confirm(texto)) return;
    setGuardando(true);
    try { await onGuardar({ puntaje: automatico ? null : n, motivo: motivo.trim() || undefined }); }
    catch (e) { setError(errMsg(e)); } finally { setGuardando(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="puntaje-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={e => { e.preventDefault(); guardar(); }} className="relative z-10 w-full sm:max-w-md bg-card text-foreground border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 id="puntaje-titulo" className="font-semibold flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" /> Modificar puntaje</h3>
          <button type="button" className="p-1 rounded hover:bg-muted" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Jugador</dt><dd className="font-medium">{fila.jugador}</dd>
          <dt className="text-muted-foreground">Categoría</dt><dd>{fila.categoria_id ? catNombre(fila.categoria_id) : catsTexto(torneo)}{fila.categoria ? ` · juega ${catLabel(fila.categoria)}` : ''}</dd>
          <dt className="text-muted-foreground">Torneo</dt><dd>{torneo.nombre}</dd>
          <dt className="text-muted-foreground">Puntaje actual</dt>
          <dd><strong>{fila.puntos ?? 0}</strong>{fila.manual && <span className="text-xs text-muted-foreground"> (manual · por partidos: {fila.puntos_calculados ?? 0})</span>}</dd>
        </dl>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Nuevo puntaje</span>
          <input className="input text-lg" type="number" inputMode="numeric" min="0" step="1" value={valor} autoFocus
            onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))} aria-invalid={invalido} />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Motivo (opcional)</span>
          <input className="input" maxLength={255} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: corrección de planilla" />
        </label>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          {fila.manual && <button type="button" className="btn-ghost text-sm mr-auto" disabled={guardando} onClick={() => guardar(true)}>Volver al automático</button>}
          <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm" disabled={guardando || invalido}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Comunicación ──────────────────────────────────────────────
function ComunicacionSeccion({ svc, torneo }) {
  const [canal, setCanal] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [dest, setDest] = useState('todos');
  const [msg, setMsg] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [manual, setManual] = useState(null);   // { titulo, texto, destinatarios } — modo WhatsApp del dispositivo
  useEffect(() => { svc.canal(torneo.id).then(setCanal).catch(() => {}); }, [svc, torneo.id]);
  const esManual = canal?.modo === 'manual';

  const correr = async (fn) => {
    setEnviando(true); setMsg({});
    try { setMsg({ ok: await fn() }); } catch (e) { setMsg({ error: errMsg(e) }); } finally { setEnviando(false); }
  };

  if (esManual) return (
    <div className="space-y-4 max-w-2xl">
      <div className="card text-sm flex items-start gap-2">
        <MessageCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>Los torneos se comunican <strong>desde el WhatsApp de este dispositivo</strong>. El sistema arma los mensajes y vos los enviás: no se usa el número del club ni el chatbot, y no hay avisos automáticos.</span>
      </div>

      <div className="card space-y-2">
        <div className="font-semibold text-sm">Próximos partidos</div>
        <p className="text-xs text-muted-foreground">Genera el aviso del próximo partido de cada pareja para enviarlo jugador por jugador.</p>
        <button className="btn-outline text-sm flex items-center gap-2" disabled={enviando}
          onClick={() => correr(async () => {
            const r = await svc.proximos(torneo.id);
            setManual(r.destinatarios?.length ? { titulo: 'Próximos partidos', destinatarios: r.destinatarios } : null);
            return r.destinatarios?.length ? `${r.destinatarios.length} mensaje(s) listos para ${r.parejas} parejas.` : 'No hay partidos programados con jugadores para avisar.';
          })}>
          <RefreshCw className="w-4 h-4" /> Generar avisos de próximos partidos
        </button>
      </div>

      <div className="card space-y-3">
        <div className="font-semibold text-sm">Mensaje a jugadores</div>
        <select className="input text-sm" value={dest} onChange={e => setDest(e.target.value)}>
          <option value="todos">Todas las parejas inscriptas</option>
          <option value="pagados">Solo con pago confirmado</option>
          <option value="pendientes">Solo con pago pendiente</option>
        </select>
        <textarea className="input min-h-[110px]" maxLength={1000} placeholder="Ej: Por lluvia, los partidos de hoy pasan a las canchas techadas." value={mensaje} onChange={e => setMensaje(e.target.value)} />
        <button className="btn-primary text-sm flex items-center gap-2" disabled={enviando || mensaje.trim().length < 3}
          onClick={() => correr(async () => {
            const r = await svc.difundir(torneo.id, { mensaje, destinatarios: dest });
            setManual({ titulo: torneo.nombre, texto: r.texto, destinatarios: r.destinatarios || [] });
            return `Mensaje generado para ${r.parejas} parejas (${(r.destinatarios || []).length} jugadores con WhatsApp).`;
          })}>
          <Send className="w-4 h-4" /> {enviando ? 'Generando…' : 'Generar mensaje'}
        </button>
      </div>
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>

      {manual && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">{manual.titulo}</div>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setManual(null)}>Cerrar</button>
          </div>
          <CompartirMensaje texto={manual.texto || manual.destinatarios[0]?.texto || ''} editable={Boolean(manual.texto)} titulo={manual.titulo}
            destinatarios={manual.destinatarios} ayuda="Tocá cada jugador para abrir su chat en el WhatsApp de este dispositivo." />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card text-sm flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        Canal: <strong>{canal ? (canal.proveedor === 'baileys' ? 'WhatsApp Web (Baileys)' : 'WhatsApp Business (Meta)') : '…'}</strong>
        {canal && <span className={canal.conectado ? 'badge-green' : 'badge-red'} title={canal.modulo_autorizado === false ? 'Habilitalo en Configuración → WhatsApp → Módulos autorizados' : undefined}>{canal.conectado ? 'Conectado' : canal.modulo_autorizado === false ? 'WhatsApp no habilitado para Torneos' : 'Sin conectar'}</span>}
        <span className="text-xs text-muted-foreground ml-auto">Lo configura el administrador de la plataforma</span>
      </div>

      <div className="card space-y-2">
        <div className="font-semibold text-sm">Avisos automáticos</div>
        <p className="text-xs text-muted-foreground">
          Se envían solos: confirmación de inscripción y de pago (con ticket QR), próximos partidos al armar el fixture o reprogramar,
          resultados, felicitaciones a finalistas y campeones y agradecimiento a los eliminados.
        </p>
        <button className="btn-outline text-sm flex items-center gap-2" disabled={enviando}
          onClick={() => correr(async () => { const r = await svc.proximos(torneo.id); return `Próximo partido enviado a ${r.parejas} parejas (${r.mensajes} mensajes).`; })}>
          <RefreshCw className="w-4 h-4" /> Reenviar próximos partidos
        </button>
      </div>

      <div className="card space-y-3">
        <div className="font-semibold text-sm">Mensaje a jugadores</div>
        <select className="input text-sm" value={dest} onChange={e => setDest(e.target.value)}>
          <option value="todos">Todas las parejas inscriptas</option>
          <option value="pagados">Solo con pago confirmado</option>
          <option value="pendientes">Solo con pago pendiente</option>
        </select>
        <textarea className="input min-h-[110px]" maxLength={1000} placeholder="Ej: Por lluvia, los partidos de hoy pasan a las canchas techadas." value={mensaje} onChange={e => setMensaje(e.target.value)} />
        <button className="btn-primary text-sm flex items-center gap-2" disabled={enviando || mensaje.trim().length < 3}
          onClick={() => correr(async () => {
            const r = await svc.difundir(torneo.id, { mensaje, destinatarios: dest });
            setMensaje('');
            return `Enviado: ${r.enviados} mensajes a ${r.parejas} parejas${r.fallidos ? ` · ${r.fallidos} fallidos (${r.errores.join('; ')})` : ''}.`;
          })}>
          <Send className="w-4 h-4" /> {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
    </div>
  );
}
