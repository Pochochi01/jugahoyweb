import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Trophy, CalendarDays, Users, CreditCard, Download, MapPin } from 'lucide-react';
import { torneosPublic, uploadUrl } from '../../services/torneosService';
import InscripcionForm from '../../components/torneos/InscripcionForm';
import { TablaZona, ZonaGrilla, Bracket, RankingJugadores } from '../../components/torneos/FixtureViews';
import {
  ESTADO_TORNEO, ESTADO_PAGO, GENEROS, TIPO_TORNEO, catLabel, money, fechaCorta, setsTxt, RONDA_LABEL, errMsg,
} from '../../utils/torneos';

const Wrap = ({ children }) => <div className="min-h-screen bg-background"><div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">{children}</div></div>;
const Loader = () => <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;

async function irAPagar(parejaId) {
  const r = await torneosPublic.pagar(parejaId);
  window.location.href = r.init_point || r.sandbox_init_point;
}

// ── /torneos ──────────────────────────────────────────────────
export function TorneosListPage() {
  const [torneos, setTorneos] = useState(null);
  useEffect(() => { torneosPublic.list().then(setTorneos).catch(() => setTorneos([])); }, []);
  if (!torneos) return <Loader />;
  return (
    <Wrap>
      <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="w-6 h-6 text-primary" /> Torneos</h1>
      {torneos.length === 0 && <div className="card text-center text-muted-foreground py-10">No hay torneos publicados.</div>}
      <div className="grid md:grid-cols-2 gap-3">
        {torneos.map(t => (
          <Link key={t.id} to={`/torneos/${t.id}`} className="card hover:border-primary/50 transition-colors space-y-1">
            <div className="flex justify-between gap-2"><span className="font-semibold">{t.nombre}</span><span className={ESTADO_TORNEO[t.estado].cls}>{ESTADO_TORNEO[t.estado].label}</span></div>
            <div className="text-sm text-muted-foreground">{t.club?.nombre} · {t.club?.ciudad}</div>
            <div className="text-xs">{catLabel(t.categoria)} {GENEROS[t.genero]} · {fechaCorta(t.fecha_inicio)} → {fechaCorta(t.fecha_fin)}</div>
          </Link>
        ))}
      </div>
    </Wrap>
  );
}

// ── /torneos/:id  (y /torneos/:id/pago al volver de MercadoPago) ──
export function TorneoPublicPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [torneo, setTorneo] = useState(null);
  const [fx, setFx] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [tab, setTab] = useState(params.get('pareja') ? 'mi' : 'info');
  const [error, setError] = useState('');

  useEffect(() => {
    torneosPublic.get(id).then(setTorneo).catch(e => setError(errMsg(e)));
    torneosPublic.fixture(id).then(setFx).catch(() => {});
    torneosPublic.ranking(id).then(setRanking).catch(() => {});
  }, [id]);

  if (error) return <Wrap><div className="card text-red-400">{error}</div></Wrap>;
  if (!torneo) return <Loader />;

  const tabs = [
    ['info', 'Torneo', Trophy],
    ...(torneo.estado === 'inscripcion' ? [['inscripcion', 'Inscribirme', Users]] : []),
    ['mi', 'Mis partidos', CreditCard],
    ['fixture', 'Fixture', CalendarDays],
    ['llave', 'Llave', Trophy],
    ['posiciones', 'Posiciones', Users],
  ];

  return (
    <Wrap>
      <PagoRetorno torneoId={id} />
      <div className="card !p-0 overflow-hidden">
        {torneo.imagen_evento && <img src={uploadUrl(torneo.imagen_evento)} alt="" className="w-full max-h-64 object-cover" />}
        <div className="p-5 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold mr-2">{torneo.nombre}</h1>
            <span className={ESTADO_TORNEO[torneo.estado].cls}>{ESTADO_TORNEO[torneo.estado].label}</span>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-4 h-4" /> {torneo.club?.nombre} · {torneo.club?.direccion}</div>
          <div className="text-sm">{catLabel(torneo.categoria)} {GENEROS[torneo.genero]} · {fechaCorta(torneo.fecha_inicio)} → {fechaCorta(torneo.fecha_fin)}</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="card"><div className="text-xs text-muted-foreground">Inscripción por pareja</div><div className="text-xl font-bold">{Number(torneo.precio_inscripcion) > 0 ? money(torneo.precio_inscripcion) : 'Sin cargo'}</div></div>
          <div className="card"><div className="text-xs text-muted-foreground">Cupos libres</div><div className="text-xl font-bold">{torneo.cupos_libres} / {torneo.cupo_parejas}</div></div>
          <div className="card"><div className="text-xs text-muted-foreground">Formato · {TIPO_TORNEO[torneo.tipo]?.label}</div><div className="text-sm">Zonas de {torneo.parejas_por_zona} ({TIPO_TORNEO[torneo.tipo]?.hint.toLowerCase()}), clasifican {torneo.clasifican_por_zona} a la llave{torneo.tercer_set === 'super_tiebreak' ? ' · 3er set: súper tie-break' : ''}</div></div>
          {torneo.descripcion && <div className="card md:col-span-3 text-sm whitespace-pre-line">{torneo.descripcion}</div>}
        </div>
      )}
      {tab === 'inscripcion' && <Inscripcion torneo={torneo} />}
      {tab === 'mi' && <MisPartidos torneoId={id} />}
      {tab === 'fixture' && (fx?.zonas?.length
        ? <div className="grid lg:grid-cols-2 gap-4 items-start">{fx.zonas.map(z => <ZonaGrilla key={z.zona_id} zona={z} />)}</div>
        : <p className="text-sm text-muted-foreground">El fixture se publica al cerrar la inscripción.</p>)}
      {tab === 'llave' && <Bracket llave={fx?.llave} campeonId={fx?.campeon} />}
      {tab === 'posiciones' && (
        <div className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-4">{fx?.zonas?.map(z => <TablaZona key={z.zona_id} zona={z} mostrarRanking={torneo.tipo === 'anual'} />)}</div>
          <h3 className="font-semibold">Ranking por jugador</h3>
          <RankingJugadores filas={ranking} />
        </div>
      )}
    </Wrap>
  );
}

function Inscripcion({ torneo }) {
  const [hecho, setHecho] = useState(null);
  if (torneo.cupos_libres <= 0) return <div className="card text-center py-8">No quedan cupos.</div>;
  if (hecho) {
    return (
      <div className="card space-y-3 text-center py-8">
        <div className="text-lg font-semibold">¡Inscripción recibida!</div>
        <p className="text-sm text-muted-foreground">Te enviamos la confirmación por WhatsApp.</p>
        {hecho.requiere_pago
          ? <button className="btn-primary" onClick={() => irAPagar(hecho.pareja_id).catch(e => alert(errMsg(e)))}>Pagar {money(hecho.monto)} con MercadoPago</button>
          : <p className="text-green-400">Tu lugar está confirmado. El ticket QR llegó a tu WhatsApp.</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {torneo.franjas_juego?.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Se juega en: {torneo.franjas_juego.map(f => `${f.fecha ? fechaCorta(f.fecha) : 'todos los días'} ${f.desde}-${f.hasta}`).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
        </p>
      )}
      <InscripcionForm torneo={torneo} onSubmit={async (d) => setHecho(await torneosPublic.inscribir(torneo.id, d))} />
    </div>
  );
}

function MisPartidos({ torneoId }) {
  const [dni, setDni] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const buscar = async (e) => {
    e?.preventDefault(); setError('');
    try { setData(await torneosPublic.miPareja(torneoId, dni)); } catch (err) { setData(null); setError(errMsg(err)); }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={buscar} className="card flex gap-2 max-w-md">
        <input className="input" inputMode="numeric" placeholder="Tu DNI" value={dni} onChange={e => setDni(e.target.value)} />
        <button className="btn-primary">Buscar</button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && (
        <div className="space-y-3">
          <div className="card flex flex-wrap items-center gap-3">
            <div className="flex-1"><div className="font-semibold">{data.pareja.nombre}</div>
              <span className={ESTADO_PAGO[data.pareja.estado_pago].cls}>{ESTADO_PAGO[data.pareja.estado_pago].label}</span></div>
            {data.pareja.estado_pago === 'pendiente' && (
              <button className="btn-primary text-sm" onClick={() => irAPagar(data.pareja.id).catch(e => alert(errMsg(e)))}>Pagar inscripción</button>
            )}
            {data.ticket_codigo && <Link className="btn-outline text-sm" to={`/torneos/ticket/${data.ticket_codigo}`}>Ver mi ticket QR</Link>}
          </div>
          {data.partidos.length === 0 && <p className="text-sm text-muted-foreground">Todavía no tenés partidos programados.</p>}
          {data.partidos.map(p => (
            <div key={p.id} className="card py-3 flex flex-wrap gap-3 text-sm">
              <span className="w-24 text-muted-foreground">{p.zona || RONDA_LABEL[p.ronda]}</span>
              <span className="flex-1">vs <strong>{p.rival}</strong></span>
              <span className="text-muted-foreground">{p.fecha ? `${fechaCorta(p.fecha)} ${p.hora} hs · ${p.cancha}` : 'A programar'}</span>
              {p.resultado && <span className={p.resultado.gano ? 'text-green-400' : 'text-red-400'}>
                {p.resultado.gano ? 'Ganado' : 'Perdido'} {setsTxt(p.resultado.local ? p.resultado.sets : p.resultado.sets.map(([a, b]) => [b, a]))}
              </span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Al volver de MercadoPago (/torneos/:id/pago?estado&pareja&payment_id) reconcilia el pago. */
function PagoRetorno({ torneoId }) {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState(null);
  const paymentId = params.get('payment_id') || params.get('collection_id');
  const parejaId = params.get('pareja');
  useEffect(() => {
    if (!paymentId || !parejaId) return;
    torneosPublic.syncPago({ payment_id: paymentId, pareja_id: parejaId })
      .then(r => setEstado(r.estado_pago)).catch(() => setEstado('error'));
  }, [paymentId, parejaId, torneoId]);
  if (!params.get('estado')) return null;
  const txt = estado === 'pagado' ? '✅ ¡Pago confirmado! Te enviamos el ticket QR por WhatsApp.'
    : params.get('estado') === 'error' || estado === 'error' ? '❌ El pago no se pudo completar. Podés reintentar desde "Mis partidos".'
    : '⏳ Estamos confirmando tu pago…';
  return <div className="card text-sm">{txt}</div>;
}

// ── /torneos/ticket/:codigo ───────────────────────────────────
export function TorneoTicketPage() {
  const { codigo } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const ticketRef = useRef(null);
  useEffect(() => { torneosPublic.ticket(codigo).then(setT).catch(e => setError(errMsg(e))); }, [codigo]);

  // Compone imagen del evento + QR + datos en un PNG descargable
  const descargar = async () => {
    const W = 720, H = 1180;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = (src) => new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    g.fillStyle = 'rgb(var(--subtle))'; g.fillRect(0, 0, W, H);
    const ev = t.imagen_evento && await img(uploadUrl(t.imagen_evento));
    if (ev) { const h = W * 9 / 16; g.drawImage(ev, 0, 0, W, h); }
    g.fillStyle = '#fff'; g.font = 'bold 36px sans-serif'; g.fillText(t.torneo.nombre, 40, 460);
    g.font = '24px sans-serif'; g.fillText(`${t.jugador} · ${t.pareja}`, 40, 505);
    g.fillStyle = '#aab'; g.fillText(`${t.torneo.categoria}ª ${t.torneo.genero} · ${t.torneo.club?.nombre}`, 40, 545);
    const qr = await img(t.qr);
    g.fillStyle = '#fff'; g.fillRect(160, 590, 400, 400);
    if (qr) g.drawImage(qr, 170, 600, 380, 380);
    g.fillStyle = '#aab'; g.font = '18px monospace'; g.fillText(t.codigo, 40, 1060);
    const a = document.createElement('a'); a.download = `ticket-${t.codigo.slice(0, 8)}.png`; a.href = c.toDataURL('image/png'); a.click();
  };

  if (error) return <Wrap><div className="card text-red-400">{error}</div></Wrap>;
  if (!t) return <Loader />;
  return (
    <Wrap>
      <div ref={ticketRef} className="card !p-0 overflow-hidden max-w-sm mx-auto">
        {t.imagen_evento
          ? <img src={uploadUrl(t.imagen_evento)} alt="Imagen del torneo" className="w-full aspect-video object-cover" />
          : <div className="aspect-video bg-primary/20 flex items-center justify-center"><Trophy className="w-12 h-12 text-primary" /></div>}
        <div className="p-5 space-y-3 text-center">
          <div className="font-bold text-lg">{t.torneo.nombre}</div>
          <div className="text-sm">{t.jugador}</div>
          <div className="text-xs text-muted-foreground">{t.pareja} · {catLabel(t.torneo.categoria)} {GENEROS[t.torneo.genero]}</div>
          <img src={t.qr} alt="Código QR del ticket" className="w-56 h-56 mx-auto bg-white p-2 rounded-lg" />
          <div className="text-xs text-muted-foreground">{t.torneo.club?.nombre} · {fechaCorta(t.torneo.fecha_inicio)} → {fechaCorta(t.torneo.fecha_fin)}</div>
          {t.usado_at && <div className="badge-yellow inline-block">Ingreso registrado</div>}
        </div>
      </div>
      <div className="text-center">
        <button onClick={descargar} className="btn-primary inline-flex items-center gap-2"><Download className="w-4 h-4" /> Descargar ticket</button>
      </div>
    </Wrap>
  );
}
