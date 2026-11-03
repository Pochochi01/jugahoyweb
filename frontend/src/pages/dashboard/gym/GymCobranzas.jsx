import { useState, useMemo } from 'react';
import { Bell, Receipt, AlertTriangle, Plus, Printer, Ban, MessageCircle, Search } from 'lucide-react';
import {
  useGym, puede, Modal, Campo, Tabla, Kpi, BarrasH, EstadoBadge, money, fechaCorta, nombre, hoy, sumarDias,
  useCarga, Cargando, ErrorBox, Vacio, METODOS, label, errMsg,
} from '../../../components/gym/GymUI';
import { whatsappSendUrl } from '../../../utils/compartir';

const SECCIONES = [['alertas', 'Alertas', Bell], ['pagos', 'Pagos', Receipt], ['morosos', 'Morosos', AlertTriangle]];
const digitos = (t) => String(t || '').replace(/\D/g, '');

/** Cobranzas del gym: alertas de vencimiento, pagos con recibo/anulación y morosos. */
export default function GymCobranzas() {
  const { permisos } = useGym();
  const [sec, setSec] = useState('alertas');
  const [cobrar, setCobrar] = useState(false);
  const [rev, setRev] = useState(0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SECCIONES.map(([k, l, I]) => (
          <button key={k} onClick={() => setSec(k)} className={`btn-sm ${sec === k ? 'btn-primary' : 'btn-outline'}`}><I className="w-4 h-4" /> {l}</button>
        ))}
        {puede(permisos, 'cobranzas', 'crear') && <button className="btn-primary btn-sm ml-auto" onClick={() => setCobrar(true)}><Plus className="w-4 h-4" /> Registrar pago</button>}
      </div>
      {sec === 'alertas' && <Alertas key={rev} />}
      {sec === 'pagos' && <Pagos key={rev} />}
      {sec === 'morosos' && <Morosos key={rev} />}
      {cobrar && <NuevoPago onClose={() => setCobrar(false)} onOk={() => { setCobrar(false); setRev(r => r + 1); }} />}
    </div>
  );
}

function LinkWa({ socio, texto }) {
  const tel = digitos(socio?.whatsapp || socio?.telefono);
  if (!tel) return null;
  return <a href={whatsappSendUrl(texto, tel)} className="btn-ghost btn-sm !px-2" title="Avisar por WhatsApp" aria-label="Avisar por WhatsApp"><MessageCircle className="w-4 h-4" /></a>;
}

function ListaMemb({ titulo, items, texto }) {
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold text-sm">{titulo} <span className="badge-neutral ml-1">{items.length}</span></h3>
      {!items.length ? <p className="text-xs text-muted-foreground">Nadie.</p> : (
        <ul className="divide-y divide-border">
          {items.map(m => (
            <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{nombre(m.socio)}</div>
                <div className="text-xs text-muted-foreground">{m.plan?.nombre} · vence {fechaCorta(m.fecha_fin)}</div>
              </div>
              <LinkWa socio={m.socio} texto={texto(m)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Alertas() {
  const { api } = useGym();
  const { data, error, cargando } = useCarga(() => api.alertas(), [api]);
  if (cargando) return <Cargando />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  const t = (m, cuando) => `Hola ${m.socio?.nombre || ''}! Te recordamos que tu plan ${m.plan?.nombre || ''} ${cuando}. ¡Te esperamos para renovarlo!`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Vence hoy" valor={data.vence_hoy.length} icon={Bell} />
        <Kpi label="Vence mañana" valor={data.vence_manana.length} icon={Bell} />
        <Kpi label="Vencidos sin renovar" valor={data.vencidos.length} icon={AlertTriangle} />
        <Kpi label="Morosos" valor={data.morosos.length} sub={money(data.morosos.reduce((s, m) => s + m.saldo, 0))} icon={AlertTriangle} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <ListaMemb titulo="Vence hoy" items={data.vence_hoy} texto={m => t(m, 'vence hoy')} />
        <ListaMemb titulo="Vence mañana" items={data.vence_manana} texto={m => t(m, 'vence mañana')} />
        <ListaMemb titulo="Vencidos" items={data.vencidos} texto={m => t(m, `venció el ${fechaCorta(m.fecha_fin)}`)} />
      </div>
    </div>
  );
}

function Pagos() {
  const { api, permisos, avisar } = useGym();
  const [f, setF] = useState({ desde: sumarDias(hoy(), -30), hasta: hoy(), metodo: '' });
  const { data, error, cargando, recargar } = useCarga(() => api.pagos({ ...f, metodo: f.metodo || undefined }), [api, f.desde, f.hasta, f.metodo]);
  const [recibo, setRecibo] = useState(null);
  const anular = async (p) => {
    const motivo = window.prompt(`Motivo para anular el recibo ${p.numero_recibo}:`);
    if (motivo === null) return;
    try { await api.anularPago(p.id, motivo); avisar('ok', 'Pago anulado.'); recargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const verRecibo = async (id) => { try { setRecibo(await api.recibo(id)); } catch (e) { avisar('err', errMsg(e)); } };
  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Campo label="Desde" tipo="date" value={f.desde} onChange={v => setF(x => ({ ...x, desde: v }))} />
        <Campo label="Hasta" tipo="date" value={f.hasta} onChange={v => setF(x => ({ ...x, hasta: v }))} />
        <Campo label="Medio" tipo="select" value={f.metodo} onChange={v => setF(x => ({ ...x, metodo: v }))} opciones={[['', 'Todos'], ...METODOS]} />
      </div>
      {cargando ? <Cargando /> : error ? <ErrorBox>{error}</ErrorBox> : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Kpi label="Total cobrado" valor={money(data.total)} sub={`${data.pagos.filter(p => !p.anulado).length} pago(s)`} icon={Receipt} />
            <div className="card"><BarrasH items={Object.entries(data.por_metodo).map(([k, v]) => ({ label: label(METODOS, k), valor: v }))} formato={money} /></div>
          </div>
          <Tabla filas={data.pagos} vacio="Sin pagos en el período." columnas={[
            { k: 'fecha', l: 'Fecha', r: p => fechaCorta(p.fecha) },
            { k: 'numero_recibo', l: 'Recibo' },
            { k: 'socio', l: 'Socio', r: p => nombre(p.socio) },
            { k: 'concepto', l: 'Concepto', cls: 'max-w-[16rem] truncate' },
            { k: 'metodo', l: 'Medio', r: p => label(METODOS, p.metodo) },
            { k: 'monto', l: 'Monto', r: p => <span className={p.anulado ? 'line-through text-muted-foreground' : 'font-semibold'}>{money(p.monto)}</span> },
            { k: 'acc', l: '', r: p => (
              <span className="inline-flex gap-1">
                <button className="btn-ghost btn-sm !px-2" onClick={() => verRecibo(p.id)} aria-label="Ver recibo"><Printer className="w-4 h-4" /></button>
                {!p.anulado && puede(permisos, 'cobranzas', 'aprobar') && <button className="btn-ghost btn-sm !px-2 text-danger" onClick={() => anular(p)} aria-label="Anular"><Ban className="w-4 h-4" /></button>}
              </span>
            ) },
          ]} />
        </>
      )}
      {recibo && <Recibo r={recibo} onClose={() => setRecibo(null)} />}
    </div>
  );
}

function Recibo({ r, onClose }) {
  const p = r.pago;
  return (
    <Modal titulo={`Recibo ${p.numero_recibo}`} onClose={onClose}>
      <div className="space-y-3 text-sm" id="gym-recibo">
        <div><div className="font-bold text-base">{r.complejo?.nombre}</div><div className="text-muted-foreground text-xs">{r.complejo?.direccion}</div></div>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Recibo</span><span>{p.numero_recibo}</span>
          <span className="text-muted-foreground">Fecha</span><span>{fechaCorta(p.fecha)}</span>
          <span className="text-muted-foreground">Socio</span><span>{nombre(p.socio)} · DNI {p.socio?.dni}</span>
          <span className="text-muted-foreground">Concepto</span><span>{p.concepto}</span>
          <span className="text-muted-foreground">Medio</span><span>{label(METODOS, p.metodo)}</span>
          <span className="text-muted-foreground">Importe</span><span className="font-bold text-lg">{money(p.monto)}</span>
        </div>
        {p.anulado && <p className="badge-red">ANULADO</p>}
        <button className="btn-primary btn-sm" onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimir</button>
      </div>
    </Modal>
  );
}

function Morosos() {
  const { api } = useGym();
  const { data, error, cargando } = useCarga(() => api.morosos(), [api]);
  if (cargando) return <Cargando />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  const total = data.reduce((s, m) => s + m.saldo, 0);
  return (
    <div className="space-y-4">
      <Kpi label="Total adeudado" valor={money(total)} sub={`${data.length} socio(s)`} icon={AlertTriangle} />
      <Tabla filas={data} vacio="No hay socios con deuda." columnas={[
        { k: 'socio', l: 'Socio', r: m => nombre(m) },
        { k: 'dni', l: 'DNI' },
        { k: 'estado', l: 'Estado', r: m => <EstadoBadge estado={m.estado} /> },
        { k: 'ultimo_vencimiento', l: 'Último vencimiento', r: m => fechaCorta(m.ultimo_vencimiento) },
        { k: 'saldo', l: 'Deuda', r: m => <span className="font-semibold text-danger">{money(m.saldo)}</span> },
        { k: 'wa', l: '', r: m => <LinkWa socio={m} texto={`Hola ${m.nombre}! Tenés un saldo pendiente de ${money(m.saldo)} en el gimnasio. Podés regularizarlo en recepción.`} /> },
      ]} />
    </div>
  );
}

/** Buscador de socio reutilizable (q → api.socios). */
export function BuscarSocio({ onElegir }) {
  const { api } = useGym();
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const buscar = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    try { setRes((await api.socios({ q, limite: 10 })).socios); } catch { setRes([]); }
  };
  return (
    <div className="space-y-2">
      <form onSubmit={buscar} className="flex gap-2">
        <input className="input text-sm" placeholder="Nombre, DNI o código" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar socio" />
        <button className="btn-outline btn-sm" type="submit" aria-label="Buscar"><Search className="w-4 h-4" /></button>
      </form>
      {res.length > 0 && (
        <ul className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
          {res.map(s => (
            <li key={s.id}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => { onElegir(s); setRes([]); setQ(''); }}>
              {nombre(s)} <span className="text-xs text-muted-foreground">· DNI {s.dni}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NuevoPago({ onClose, onOk }) {
  const { api, avisar } = useGym();
  const [socio, setSocio] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [f, setF] = useState({ monto: '', metodo: 'efectivo', concepto: '', membresia_id: '' });
  const [guardando, setGuardando] = useState(false);
  const elegir = async (s) => {
    setSocio(s);
    try {
      const fi = await api.socio(s.id);
      setFicha(fi);
      const m = fi.vigente || fi.membresias[0];
      setF(x => ({ ...x, monto: fi.cuenta.saldo > 0 ? String(fi.cuenta.saldo) : x.monto, membresia_id: m ? String(m.id) : '' }));
    } catch (e) { avisar('err', errMsg(e)); }
  };
  const membs = useMemo(() => (ficha?.membresias || []).filter(m => m.estado !== 'cancelada'), [ficha]);
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const r = await api.pagar(socio.id, { monto: Number(f.monto), metodo: f.metodo, concepto: f.concepto || undefined, membresia_id: f.membresia_id ? Number(f.membresia_id) : undefined });
      avisar('ok', `Pago ${r.pago.numero_recibo} registrado${r.en_caja ? '' : ' (sin caja abierta)'}.`);
      onOk();
    } catch (err) { avisar('err', errMsg(err)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo="Registrar pago" onClose={onClose}>
      {!socio ? <BuscarSocio onElegir={elegir} /> : (
        <form onSubmit={guardar} className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{nombre(socio)}</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setSocio(null); setFicha(null); }}>Cambiar</button>
          </div>
          {ficha && <p className="text-xs text-muted-foreground">Saldo: <strong className={ficha.cuenta.saldo > 0 ? 'text-danger' : ''}>{money(ficha.cuenta.saldo)}</strong></p>}
          {membs.length > 0 && <Campo label="Imputar a" tipo="select" value={f.membresia_id} onChange={v => setF(x => ({ ...x, membresia_id: v }))}
            opciones={[['', 'Pago a cuenta'], ...membs.map(m => [String(m.id), `${m.plan?.nombre} · ${fechaCorta(m.fecha_inicio)} a ${fechaCorta(m.fecha_fin)} · ${money(m.total)}`])]} />}
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Monto" tipo="number" min="1" step="0.01" req value={f.monto} onChange={v => setF(x => ({ ...x, monto: v }))} />
            <Campo label="Medio" tipo="select" value={f.metodo} onChange={v => setF(x => ({ ...x, metodo: v }))} opciones={METODOS} />
          </div>
          <Campo label="Concepto (opcional)" value={f.concepto} maxLength={200} onChange={v => setF(x => ({ ...x, concepto: v }))} />
          <button className="btn-primary w-full" disabled={guardando}>Registrar pago</button>
        </form>
      )}
      {!socio && <Vacio>Buscá el socio para cobrarle.</Vacio>}
    </Modal>
  );
}
