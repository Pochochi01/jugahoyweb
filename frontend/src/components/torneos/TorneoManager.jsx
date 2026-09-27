import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Settings, MapPin, Users, CalendarDays, GitBranch, BarChart2, MessageCircle,
  ImagePlus, ExternalLink, RefreshCw, Check, X, Pencil, Send,
} from 'lucide-react';
import TorneoForm from './TorneoForm';
import HorariosEditor from './HorariosEditor';
import InscripcionForm from './InscripcionForm';
import { TablaZona, PartidoRow, Bracket, RankingJugadores } from './FixtureViews';
import { uploadUrl } from '../../services/torneosService';
import {
  ESTADO_TORNEO, ESTADO_PAGO, GENEROS, catLabel, money, fechaCorta, nombrePareja, errMsg, RONDA_LABEL,
} from '../../utils/torneos';

const SECCIONES = [
  { key: 'datos',         label: 'Datos',          icon: Settings },
  { key: 'canchas',       label: 'Canchas',        icon: MapPin },
  { key: 'inscripciones', label: 'Inscripciones',  icon: Users },
  { key: 'fixture',       label: 'Partidos',       icon: CalendarDays },
  { key: 'llave',         label: 'Llave',          icon: GitBranch },
  { key: 'posiciones',    label: 'Posiciones',     icon: BarChart2 },
  { key: 'comunicacion',  label: 'Comunicación',   icon: MessageCircle },
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
  const lista = data.parejas.filter(p => !filtro || p.estado_pago === filtro);

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
              <div className="font-medium">{nombrePareja(p)}</div>
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
  const [incluirPend, setIncluirPend] = useState(false);
  const [editando, setEditando] = useState(null);   // { id, modo: 'resultado' | 'horario' }
  const [slots, setSlots] = useState([]);

  const cargar = useCallback(() => svc.fixture(torneo.id).then(setFx).catch(e => setMsg({ error: errMsg(e) })), [svc, torneo.id]);
  useEffect(() => { cargar(); }, [cargar, torneo.estado]);

  const armarZonas = async () => {
    if (!confirm('Se arman las zonas y se programan todos los partidos (se avisa por WhatsApp). ¿Continuar?')) return;
    setMsg({});
    try {
      const r = await svc.generarZonas(torneo.id, { incluir_pendientes: incluirPend });
      setMsg({ ok: `${r.zonas} zonas con ${r.parejas} parejas.${r.sin_programar ? ` ⚠️ ${r.sin_programar} partidos sin lugar: programalos a mano.` : ''}` });
      onChange(); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const abrirHorario = async (p) => {
    setEditando({ id: p.id, modo: 'horario' });
    try { setSlots(await svc.getSlots(torneo.id)); } catch { setSlots([]); }
  };

  if (!fx) return <Loader />;
  const partidos = [...fx.zonas.flatMap(z => z.partidos), ...fx.llave.flatMap(r => r.partidos)].filter(p => !p.es_bye);
  const sinProgramar = partidos.filter(p => !p.fecha).length;

  return (
    <div className="space-y-4">
      {['borrador', 'inscripcion', 'zonas'].includes(torneo.estado) && (
        <div className="card space-y-2">
          <div className="font-semibold text-sm">{fx.zonas.length ? 'Rearmar zonas' : 'Armar zonas y fixture'}</div>
          <p className="text-xs text-muted-foreground">
            Reparte las parejas pagadas en zonas de {torneo.parejas_por_zona} (agrupando horarios compatibles) y asigna cancha y horario a cada partido
            respetando la disponibilidad de canchas y las preferencias de los jugadores.
          </p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={incluirPend} onChange={e => setIncluirPend(e.target.checked)} /> Incluir parejas con pago pendiente</label>
          <button className="btn-primary text-sm" onClick={armarZonas}>{fx.zonas.length ? 'Rearmar' : 'Armar zonas'}</button>
        </div>
      )}
      <Aviso>{msg.error}</Aviso><Aviso tipo="ok">{msg.ok}</Aviso>
      {sinProgramar > 0 && <Aviso>{sinProgramar} partidos sin cancha/horario asignado.</Aviso>}

      {partidos.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Todavía no hay partidos.</div>}
      {partidos.map(p => (
        <div key={p.id} className="space-y-2">
          <PartidoRow p={p} acciones={
            <div className="flex gap-1 shrink-0 items-center">
              <span className="text-[11px] text-muted-foreground mr-1">{p.zona || RONDA_LABEL[p.ronda]}</span>
              {p.pareja1 && p.pareja2 && (
                <button className="btn-outline text-xs !px-2 !py-1" onClick={() => setEditando({ id: p.id, modo: 'resultado' })}>
                  {p.resultado ? 'Corregir' : 'Resultado'}
                </button>
              )}
              {!p.resultado && (
                <button className="p-1.5 rounded hover:bg-muted" title="Reprogramar" onClick={() => abrirHorario(p)}><Pencil className="w-4 h-4" /></button>
              )}
            </div>
          } />
          {editando?.id === p.id && editando.modo === 'resultado' && (
            <ResultadoForm p={p} onCancel={() => setEditando(null)} onSave={async (d) => {
              const r = await svc.setResultado(torneo.id, p.id, d);
              setEditando(null);
              if (r.llave && !r.llave.error) setMsg({ ok: `Zonas terminadas: se armó la llave de ${r.llave.tam} (${r.llave.byes} byes).` });
              onChange(); cargar();
            }} />
          )}
          {editando?.id === p.id && editando.modo === 'horario' && (
            <HorarioForm p={p} slots={slots} onCancel={() => setEditando(null)} onSave={async (d) => {
              await svc.reprogramar(torneo.id, p.id, d); setEditando(null); cargar();
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

function ResultadoForm({ p, onSave, onCancel }) {
  const inicial = p.resultado?.sets?.length ? p.resultado.sets : [['', ''], ['', '']];
  const [sets, setSets] = useState(inicial.map(s => s.map(String)));
  const [error, setError] = useState('');
  const setS = (i, l, v) => setSets(ss => ss.map((s, j) => (j === i ? s.map((x, k) => (k === l ? v : x)) : s)));
  const guardar = async (payload) => {
    setError('');
    try { await onSave(payload); } catch (e) { setError(errMsg(e)); }
  };
  return (
    <div className="card border-primary/40 space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm">
        {[1, 2].map(l => (
          <div key={l} className="contents">
            <span className="truncate">{p[`pareja${l}`]?.nombre}</span>
            <div className="flex gap-1">
              {sets.map((s, i) => (
                <input key={i} inputMode="numeric" className="input !w-12 text-center !px-1" value={s[l - 1]} onChange={e => setS(i, l - 1, e.target.value)} aria-label={`Set ${i + 1} pareja ${l}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {sets.length < 3 && <button className="text-xs text-primary hover:underline" onClick={() => setSets(s => [...s, ['', '']])}>+ 3er set / súper tie-break</button>}
        {sets.length === 3 && <button className="text-xs text-muted-foreground hover:underline" onClick={() => setSets(s => s.slice(0, 2))}>Quitar 3er set</button>}
        <span className="flex-1" />
        <button className="text-xs text-amber-400 hover:underline" onClick={() => guardar({ walkover_ganador: 1 })}>W.O. gana 1</button>
        <button className="text-xs text-amber-400 hover:underline" onClick={() => guardar({ walkover_ganador: 2 })}>W.O. gana 2</button>
        <button className="btn-primary text-sm flex items-center gap-1" onClick={() => guardar({ sets: sets.map(s => s.map(Number)) })}><Check className="w-4 h-4" /> Guardar</button>
        <button className="p-2 rounded hover:bg-muted" onClick={onCancel} aria-label="Cancelar"><X className="w-4 h-4" /></button>
      </div>
      <Aviso>{error}</Aviso>
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
          <button key={k} onClick={() => setVista(k)} className={`px-3 py-1.5 rounded-lg text-sm ${vista === k ? 'bg-primary text-white' : 'bg-muted'}`}>{l}</button>
        ))}
      </div>
      {vista === 'zonas'
        ? (fx.zonas.length ? <div className="grid lg:grid-cols-2 gap-4">{fx.zonas.map(z => <TablaZona key={z.zona_id} zona={z} />)}</div>
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
