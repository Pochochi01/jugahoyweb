import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Settings, MapPin, Users, CalendarDays, GitBranch, BarChart2, MessageCircle,
  ImagePlus, ExternalLink, RefreshCw, Check, X, Pencil, Send, Smartphone,
} from 'lucide-react';
import TorneoForm from './TorneoForm';
import HorariosEditor from './HorariosEditor';
import InscripcionForm from './InscripcionForm';
import TelefonoEntidad from '../TelefonoEntidad';
import { TablaZona, PartidoRow, ZonaGrilla, Bracket, RankingJugadores } from './FixtureViews';
import { uploadUrl } from '../../services/torneosService';
import {
  ESTADO_TORNEO, ESTADO_PAGO, GENEROS, TIPO_TORNEO, catLabel, money, fechaCorta, nombrePareja, errMsg, RONDA_LABEL,
  errorResultado, DEPORTES_TORNEO,
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
export default function TorneoManager({ svc, torneoId, onBack }) {
  const [torneo, setTorneo] = useState(null);
  const [seccion, setSeccion] = useState('datos');
  const [error, setError] = useState('');

  const recargar = useCallback(() => svc.get(torneoId).then(setTorneo).catch(e => setError(errMsg(e))), [svc, torneoId]);
  useEffect(() => { recargar(); }, [recargar]);

  if (!torneo) return error ? <Aviso>{error}</Aviso> : <Loader />;
  const est = ESTADO_TORNEO[torneo.estado];

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
            <span>{catLabel(torneo.categoria)} {GENEROS[torneo.genero]}</span>
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

      {seccion === 'datos'         && <DatosSeccion svc={svc} torneo={torneo} onSaved={setTorneo} />}
      {seccion === 'canchas'       && <CanchasSeccion svc={svc} torneo={torneo} />}
      {seccion === 'inscripciones' && <InscripcionesSeccion svc={svc} torneo={torneo} />}
      {seccion === 'fixture'       && <PartidosSeccion svc={svc} torneo={torneo} onChange={recargar} />}
      {seccion === 'llave'         && <LlaveSeccion svc={svc} torneo={torneo} onChange={recargar} />}
      {seccion === 'posiciones'    && <PosicionesSeccion svc={svc} torneo={torneo} />}
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
      <TorneoForm key={torneo.updatedAt} initial={torneo} bloqueado={!['borrador', 'inscripcion'].includes(torneo.estado)}
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
        El complejo tiene <strong className="text-foreground">{data.canchas_complejo}</strong> canchas de {(DEPORTES_TORNEO[torneo.deporte] || 'pádel').toLowerCase()}.
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
function InscripcionesSeccion({ svc, torneo }) {
  const [data, setData] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [alta, setAlta] = useState(false);
  const [pagado, setPagado] = useState(false);

  const cargar = useCallback(() => svc.listParejas(torneo.id).then(setData).catch(() => {}), [svc, torneo.id]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!data) return <Loader />;

  const setPago = async (p, estado_pago, metodo_pago) => {
    const txt = { pagado: 'marcar como PAGADA', cancelado: 'CANCELAR', reembolsado: 'REEMBOLSAR' }[estado_pago];
    if (!confirm(`¿${txt} la inscripción de ${nombrePareja(p)}?${estado_pago === 'reembolsado' && p.mp_payment_id ? '\nSe devolverá el dinero por MercadoPago.' : ''}`)) return;
    try { await svc.setPago(torneo.id, p.id, { estado_pago, metodo_pago }); cargar(); } catch (e) { alert(errMsg(e)); }
  };
  const anual = data.tipo === 'anual';
  const lista = data.parejas.filter(p => !filtro || p.estado_pago === filtro)
    // Anual: ordenadas por puntos de ranking (así quedan los cabezas de serie)
    .sort((a, b) => (anual ? (b.puntos_ranking || 0) - (a.puntos_ranking || 0) : 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Cupo', data.cupo], ['Inscriptas', data.ocupados], ['Libres', data.libres], ['Recaudado', money(data.recaudado)]].map(([l, v]) => (
          <div key={l} className="card py-3"><div className="text-xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select className="input !w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PAGO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-primary text-sm ml-auto" onClick={() => setAlta(a => !a)}>{alta ? 'Cerrar' : '+ Inscribir pareja'}</button>
      </div>

      {alta && (
        <InscripcionForm torneo={torneo}
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Partidos: armado de zonas, programación y resultados ──────
function PartidosSeccion({ svc, torneo, onChange }) {
  const [fx, setFx] = useState(null);
  const [msg, setMsg] = useState({});
  const [reparto, setReparto] = useState(null);
  const [incluirPend, setIncluirPend] = useState(false);
  const [editando, setEditando] = useState(null);   // { id, modo: 'resultado' | 'horario' }
  const [slots, setSlots] = useState([]);

  const cargar = useCallback(() => svc.fixture(torneo.id).then(setFx).catch(e => setMsg({ error: errMsg(e) })), [svc, torneo.id]);
  useEffect(() => { cargar(); }, [cargar, torneo.estado]);

  const anual = torneo.tipo === 'anual';
  const armarZonas = async () => {
    const txt = anual
      ? 'Se ordenan las parejas por ranking anual: los primeros son cabezas de serie (1→A, 2→B…) y el resto se reparte en serpentina.'
      : 'Las parejas se sortean al azar entre las zonas.';
    if (!confirm(`${txt}\nLuego se programan todos los partidos y se avisa por WhatsApp. ¿Continuar?`)) return;
    setMsg({});
    try {
      const r = await svc.generarZonas(torneo.id, { incluir_pendientes: incluirPend });
      setReparto(r.reparto);
      setMsg({ ok: `${r.zonas} zonas con ${r.parejas} parejas (${anual ? 'por ranking' : 'por sorteo'}).${r.sin_programar ? ` ⚠️ ${r.sin_programar} partidos sin lugar: programalos a mano.` : ''}` });
      onChange(); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const abrirHorario = async (p) => {
    setEditando({ id: p.id, modo: 'horario' });
    try { setSlots(await svc.getSlots(torneo.id)); } catch { setSlots([]); }
  };
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
      {p.resultado && p.ronda === 'zona' && torneo.estado === 'zonas' && (
        <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" title="Borrar resultado" onClick={() => borrarResultado(p)}><X className="w-4 h-4" /></button>
      )}
      {!p.resultado && (
        <button className="p-1.5 rounded hover:bg-muted" title="Reprogramar" onClick={() => abrirHorario(p)}><Pencil className="w-4 h-4" /></button>
      )}
    </div>
  );
  const editor = (p) => editando?.id === p.id && (
    editando.modo === 'resultado'
      ? <ResultadoForm p={p} tercerSet={torneo.tercer_set} onCancel={() => setEditando(null)} onSave={(d) => guardarResultado(p, d)} />
      : <HorarioForm p={p} slots={slots} onCancel={() => setEditando(null)} onSave={async (d) => { await svc.reprogramar(torneo.id, p.id, d); setEditando(null); cargar(); }} />
  );

  return (
    <div className="space-y-4">
      {['borrador', 'inscripcion', 'zonas'].includes(torneo.estado) && (
        <div className="card space-y-2">
          <div className="font-semibold text-sm flex items-center gap-2">
            {fx.zonas.length ? 'Rearmar zonas' : 'Armar zonas y fixture'}
            <span className="badge-blue">{TIPO_TORNEO[torneo.tipo]?.label}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {anual
              ? <>Zonas de {torneo.parejas_por_zona} por <strong>ranking anual</strong>: la pareja suma los puntos de sus dos jugadores. Los primeros son cabezas de serie (1→Zona A, 2→Zona B…) y el resto se reparte en serpentina (ida y vuelta).</>
              : <>Zonas de {torneo.parejas_por_zona} por <strong>sorteo</strong>.</>}
            {' '}En zonas de 4 se juega 1v3 y 2v4; después ganador P1 vs perdedor P2 y ganador P2 vs perdedor P1. Cada partido se programa respetando canchas y horarios preferidos.
          </p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={incluirPend} onChange={e => setIncluirPend(e.target.checked)} /> Incluir parejas con pago pendiente</label>
          <button className="btn-primary text-sm" onClick={armarZonas}>{fx.zonas.length ? 'Rearmar' : 'Armar zonas'}</button>
        </div>
      )}
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
      {reparto && (
        <div className="card text-xs space-y-1">
          <div className="font-semibold text-sm mb-1">{anual ? 'Cabezas de serie y reparto' : 'Resultado del sorteo'}</div>
          {reparto.map(z => (
            <div key={z.zona}><span className="font-medium">{z.zona}:</span> {z.parejas.map(p => `#${p.numero}${anual ? ` (${p.puntos} pts)` : ''}`).join(' · ')}</div>
          ))}
        </div>
      )}
      {sinProgramar > 0 && <Aviso>{sinProgramar} partidos sin cancha/horario asignado.</Aviso>}
      {todos.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Todavía no hay partidos.</div>}

      {/* Zonas: grilla por zona con parejas numeradas y P1…Pn */}
      <div className="grid xl:grid-cols-2 gap-4 items-start">
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
    </div>
  );
}

/**
 * Carga de resultado con validación en vivo (misma regla que el backend):
 * sets 0–7 · 6-0…6-4 · 7-5 · 7-6 → aparece el tie-break (a 7, dif. 2).
 * 3er set: set completo o súper tie-break a 10, según el torneo.
 */
function ResultadoForm({ p, tercerSet = 'set', onSave, onCancel }) {
  const r = p.resultado;
  const [sets, setSets] = useState(r?.sets?.length ? r.sets.map(s => s.map(String)) : [['', ''], ['', '']]);
  const [tbs, setTbs] = useState(r?.sets?.length ? r.sets.map((_, i) => (r.tie_breaks?.[i] || ['', '']).map(String)) : [['', ''], ['', '']]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const num = (v) => (v === '' ? NaN : Number(v));
  const setsN = sets.map(s => s.map(num));
  const esTb = (i) => !(i === 2 && tercerSet === 'super_tiebreak') && Math.max(...setsN[i]) === 7 && Math.min(...setsN[i]) === 6;
  const tbsN = tbs.map((t, i) => (esTb(i) ? t.map(num) : null));
  const completos = setsN.every(s => s.every(Number.isInteger));
  const errorVivo = completos ? errorResultado(setsN, tbsN, tercerSet) : null;

  const setS = (i, l, v) => setSets(ss => ss.map((s, j) => (j === i ? s.map((x, k) => (k === l ? v.replace(/\D/g, '').slice(0, 2) : x)) : s)));
  const setT = (i, l, v) => setTbs(ts => ts.map((t, j) => (j === i ? t.map((x, k) => (k === l ? v.replace(/\D/g, '').slice(0, 2) : x)) : t)));
  const agregar3 = () => { setSets(s => [...s, ['', '']]); setTbs(t => [...t, ['', '']]); };
  const quitar3 = () => { setSets(s => s.slice(0, 2)); setTbs(t => t.slice(0, 2)); };

  const guardar = async (payload) => {
    setError(''); setEnviando(true);
    try { await onSave(payload); } catch (e) { setError(errMsg(e)); } finally { setEnviando(false); }
  };
  const enviar = () => {
    if (!completos) return setError('Completá todos los sets.');
    if (errorVivo) return setError(errorVivo);
    guardar({ sets: setsN, tie_breaks: tbsN });
  };
  const etiquetaSet = (i) => (i === 2 && tercerSet === 'super_tiebreak' ? 'STB' : `Set ${i + 1}`);

  return (
    <div className="card border-primary/40 space-y-3">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th />
              {sets.map((_, i) => <th key={i} className="px-1 font-medium">{etiquetaSet(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {[1, 2].map(l => (
              <tr key={l}>
                <td className="pr-3 py-1 max-w-[180px] truncate">{p[`pareja${l}`]?.nombre}</td>
                {sets.map((s, i) => (
                  <td key={i} className="px-1 py-1 align-top">
                    <input inputMode="numeric" className="input !w-12 text-center !px-1" value={s[l - 1]}
                      onChange={e => setS(i, l - 1, e.target.value)} aria-label={`${etiquetaSet(i)} pareja ${l}`} />
                    {esTb(i) && (
                      <input inputMode="numeric" className="input !w-12 text-center !px-1 mt-1 !text-xs border-amber-500/50" placeholder="TB"
                        value={tbs[i][l - 1]} onChange={e => setT(i, l - 1, e.target.value)} aria-label={`Tie-break set ${i + 1} pareja ${l}`} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Sets de 0 a 7: 6-0…6-4, 7-5 o 7-6 (en 7-6 cargá el tie-break: a 7 con 2 de diferencia, ej. 7-5, 8-6, 12-10).
        {tercerSet === 'super_tiebreak' && ' El 3º es súper tie-break a 10 (ej. 10-8, 11-9).'}
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        {sets.length < 3 && <button className="text-xs text-primary hover:underline" onClick={agregar3}>+ 3er {tercerSet === 'super_tiebreak' ? 'súper tie-break' : 'set'}</button>}
        {sets.length === 3 && <button className="text-xs text-muted-foreground hover:underline" onClick={quitar3}>Quitar 3º</button>}
        <span className="flex-1" />
        <button className="text-xs text-amber-400 hover:underline" disabled={enviando} onClick={() => guardar({ walkover_ganador: 1 })}>W.O. gana 1</button>
        <button className="text-xs text-amber-400 hover:underline" disabled={enviando} onClick={() => guardar({ walkover_ganador: 2 })}>W.O. gana 2</button>
        <button className="btn-primary text-sm flex items-center gap-1" disabled={enviando || Boolean(errorVivo)} onClick={enviar}><Check className="w-4 h-4" /> Guardar</button>
        <button className="p-2 rounded hover:bg-muted" onClick={onCancel} aria-label="Cancelar"><X className="w-4 h-4" /></button>
      </div>
      <Aviso>{error || errorVivo}</Aviso>
    </div>
  );
}

function HorarioForm({ p, slots, onSave, onCancel }) {
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="card border-primary/40 flex flex-wrap gap-2 items-center">
      <select className="input !w-auto text-sm flex-1" value={valor} onChange={e => setValor(e.target.value)}>
        <option value="">Elegí cancha y horario libre…</option>
        {slots.map(s => {
          const k = `${s.field_id}|${s.fecha}|${s.hora}`;
          return <option key={k} value={k}>{fechaCorta(s.fecha)} {s.hora} — {s.cancha}</option>;
        })}
      </select>
      <button className="btn-primary text-sm" disabled={!valor} onClick={async () => {
        const [field_id, fecha, hora] = valor.split('|');
        setError('');
        try { await onSave({ field_id: Number(field_id), fecha, hora }); } catch (e) { setError(errMsg(e)); }
      }}>Reprogramar y avisar</button>
      <button className="p-2 rounded hover:bg-muted" onClick={onCancel} aria-label="Cancelar"><X className="w-4 h-4" /></button>
      {error && <div className="w-full"><Aviso>{error}</Aviso></div>}
    </div>
  );
}

// ── Llave ─────────────────────────────────────────────────────
function LlaveSeccion({ svc, torneo, onChange }) {
  const [fx, setFx] = useState(null);
  const [msg, setMsg] = useState({});
  const cargar = useCallback(() => svc.fixture(torneo.id).then(setFx).catch(() => {}), [svc, torneo.id]);
  useEffect(() => { cargar(); }, [cargar, torneo.estado]);
  if (!fx) return <Loader />;

  const generar = async (forzar) => {
    if (forzar && !confirm('Faltan resultados de zona. ¿Generar la llave con las posiciones actuales?')) return;
    try {
      const r = await svc.generarLlave(torneo.id, { forzar });
      setMsg({ ok: `Llave de ${r.tam} con ${r.clasificados} clasificados (${r.byes} byes a los mejores).` });
      onChange(); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const zonasCompletas = fx.zonas.length > 0 && fx.zonas.every(z => z.completa);

  return (
    <div className="space-y-4">
      {torneo.estado === 'zonas' && (
        <div className="card flex flex-wrap items-center gap-3">
          <p className="text-sm flex-1">
            {zonasCompletas ? 'Todas las zonas terminaron.' : 'La llave se arma sola al cargar el último resultado de zona.'} Clasifican {torneo.clasifican_por_zona} por zona;
            si no se completa el cuadro, los mejores reciben BYE.
          </p>
          <button className="btn-primary text-sm" onClick={() => generar(!zonasCompletas)}>Generar llave{zonasCompletas ? '' : ' (forzar)'}</button>
        </div>
      )}
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
      <Bracket llave={fx.llave} campeonId={fx.campeon} />
    </div>
  );
}

// ── Posiciones ────────────────────────────────────────────────
function PosicionesSeccion({ svc, torneo }) {
  const [fx, setFx] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [vista, setVista] = useState('zonas');
  useEffect(() => {
    svc.fixture(torneo.id).then(setFx).catch(() => {});
    svc.ranking(torneo.id).then(setRanking).catch(() => setRanking([]));
  }, [svc, torneo.id]);
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
        : <RankingJugadores filas={ranking} />}
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
  useEffect(() => { svc.canal(torneo.id).then(setCanal).catch(() => {}); }, [svc, torneo.id]);

  const correr = async (fn) => {
    setEnviando(true); setMsg({});
    try { setMsg({ ok: await fn() }); } catch (e) { setMsg({ error: errMsg(e) }); } finally { setEnviando(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card text-sm flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        Canal: <strong>{canal ? (canal.proveedor === 'baileys' ? 'WhatsApp Web (Baileys)' : 'WhatsApp Business (Meta)') : '…'}</strong>
        {canal && <span className={canal.conectado ? 'badge-green' : 'badge-red'}>{canal.conectado ? 'Conectado' : 'Sin conectar'}</span>}
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
