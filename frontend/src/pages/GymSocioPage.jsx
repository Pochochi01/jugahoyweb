import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { QrCode, Wallet, Receipt, CalendarDays, ClipboardList, Activity, CheckCircle2, AlertTriangle, Dumbbell } from 'lucide-react';
import { gymSocioApi } from '../services/gymService';
import { useCarga, Cargando, Tabla, Linea, money, fechaCorta, errMsg, label, METODOS } from '../components/gym/GymUI';

const TABS = [
  ['qr', 'Mi QR', QrCode], ['cuotas', 'Cuotas', Wallet], ['pagos', 'Pagos', Receipt], ['reservas', 'Clases', CalendarDays],
  ['rutinas', 'Rutinas', ClipboardList], ['evaluaciones', 'Evaluaciones', Activity], ['asistencia', 'Asistencia', CheckCircle2],
];
const diaLargo = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

/** App del socio (link/QR personal, sin login): /gym/socio/:token */
export default function GymSocioPage() {
  const { token } = useParams();
  const api = useMemo(() => gymSocioApi(token), [token]);
  const res = useCarga(() => api.resumen(), [api]);
  const [tab, setTab] = useState('qr');

  if (res.cargando && !res.data) return <div className="min-h-screen bg-background"><Cargando /></div>;
  if (res.error) return (
    <div className="min-h-screen bg-background grid place-items-center p-6 text-center">
      <div className="card max-w-sm space-y-2"><AlertTriangle className="w-8 h-8 mx-auto text-warning" /><p className="font-semibold">No pudimos abrir tu app</p><p className="text-sm text-muted-foreground">{res.error}</p><p className="text-xs text-muted-foreground">Pedile al gimnasio un link nuevo.</p></div>
    </div>
  );
  const d = res.data;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-card border-b border-border px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {d.socio.foto_url ? <img src={d.socio.foto_url} alt="" className="w-12 h-12 rounded-full object-cover" /> : <span className="grid place-items-center w-12 h-12 rounded-full bg-primary/15"><Dumbbell className="w-6 h-6 text-primary" /></span>}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{d.complejo.nombre}</p>
            <h1 className="font-bold truncate">{d.socio.nombre} {d.socio.apellido}</h1>
            {d.habilitado ? <span className="badge-green">Habilitado para ingresar</span> : <span className="badge-red">No habilitado</span>}
          </div>
        </div>
        {!d.habilitado && <ul className="max-w-2xl mx-auto mt-2 text-xs text-danger">{d.motivos.map(m => <li key={m}>• {m}</li>)}</ul>}
      </header>
      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto flex gap-1 overflow-x-auto px-2 py-2">
          {TABS.map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Icon className="w-4 h-4" />{l}</button>
          ))}
        </div>
      </nav>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {tab === 'qr' && (
          <div className="card text-center space-y-2">
            <img src={d.qr} alt="Tu código QR de acceso" className="mx-auto w-64 h-64 rounded-xl bg-white p-2" />
            <p className="text-sm text-muted-foreground">Mostralo en recepción para ingresar.</p>
            <p className="text-lg">Código: <strong className="tracking-widest">{d.socio.codigo}</strong></p>
          </div>
        )}
        {tab === 'cuotas' && <Cuotas d={d} />}
        {tab === 'pagos' && (
          <Tabla filas={d.pagos} vacio="Todavía no registrás pagos." columnas={[
            { k: 'fecha', l: 'Fecha', r: p => fechaCorta(p.fecha) }, { k: 'numero_recibo', l: 'Recibo' }, { k: 'concepto', l: 'Concepto' },
            { k: 'metodo', l: 'Medio', r: p => label(METODOS, p.metodo) }, { k: 'monto', l: 'Monto', r: p => money(p.monto) },
          ]} />
        )}
        {tab === 'reservas' && <Reservas api={api} />}
        {tab === 'rutinas' && <Rutinas api={api} />}
        {tab === 'evaluaciones' && <Evaluaciones api={api} />}
        {tab === 'asistencia' && <Asistencia api={api} />}
      </main>
    </div>
  );
}

function Cuotas({ d }) {
  return (
    <div className="space-y-3">
      <div className="card space-y-1">
        <p className="text-xs text-muted-foreground">Plan vigente</p>
        {d.vigente ? <p className="font-semibold">{d.vigente.plan?.nombre} · vence {fechaCorta(d.vigente.fecha_fin)}</p> : <p className="text-sm text-danger">No tenés un plan vigente.</p>}
        <p className="text-sm">{d.cuenta.saldo > 0 ? <span className="text-danger">Saldo a pagar: {money(d.cuenta.saldo)}</span> : <span className="text-success">Estás al día</span>}</p>
        <p className="text-xs text-muted-foreground">Apto médico: {d.apto_vigente ? `vigente hasta ${fechaCorta(d.apto?.fecha_vencimiento)}` : 'vencido o sin cargar'}</p>
      </div>
      <Tabla filas={d.membresias} vacio="Sin membresías." columnas={[
        { k: 'plan', l: 'Plan', r: m => m.plan?.nombre }, { k: 'periodo', l: 'Período', r: m => `${fechaCorta(m.fecha_inicio)} a ${fechaCorta(m.fecha_fin)}` },
        { k: 'total', l: 'Total', r: m => money(m.total) }, { k: 'estado', l: 'Estado' },
      ]} />
    </div>
  );
}

function Reservas({ api }) {
  const disp = useCarga(() => api.disponibilidad(), [api]);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const accion = async (fn, id, ok) => {
    setOcupado(id); setMsg(null);
    try { const r = await fn(); setMsg({ ok: typeof ok === 'function' ? ok(r) : ok }); disp.recargar(); } catch (e) { setMsg({ err: errMsg(e) }); } finally { setOcupado(null); }
  };
  if (disp.cargando && !disp.data) return <Cargando />;
  const porDia = (disp.data || []).reduce((m, c) => ({ ...m, [c.fecha]: [...(m[c.fecha] || []), c] }), {});
  return (
    <div className="space-y-4">
      {msg?.ok && <p className="alert-success text-sm">{msg.ok}</p>}
      {msg?.err && <p className="alert-error text-sm">{msg.err}</p>}
      {!Object.keys(porDia).length && <p className="card text-sm text-muted-foreground text-center">No hay clases en los próximos 14 días.</p>}
      {Object.entries(porDia).map(([fecha, clases]) => (
        <section key={fecha} className="space-y-2">
          <h2 className="text-sm font-semibold capitalize">{diaLargo(fecha)}</h2>
          {clases.map(c => {
            const mia = c.mi_reserva && ['reservada', 'espera'].includes(c.mi_reserva.estado) ? c.mi_reserva : null;
            return (
              <div key={c.id} className="card !p-3 flex items-center gap-3" style={{ borderLeft: `4px solid ${c.actividad?.color || 'rgb(var(--primary))'}` }}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.hora_inicio} · {c.actividad?.nombre}</p>
                  <p className="text-xs text-muted-foreground">{c.duracion_min} min{c.profesor ? ` · ${c.profesor.nombre} ${c.profesor.apellido}` : ''}{c.sucursal ? ` · ${c.sucursal.nombre}` : ''} · {c.libres > 0 ? `${c.libres} lugar(es)` : 'completa'}</p>
                </div>
                {mia ? (
                  <div className="text-right space-y-1">
                    <span className={mia.estado === 'espera' ? 'badge-yellow' : 'badge-green'}>{mia.estado === 'espera' ? 'En espera' : 'Reservada'}</span>
                    <button className="block btn-ghost btn-sm" disabled={ocupado === c.id} onClick={() => accion(() => api.cancelar(mia.id), c.id, 'Reserva cancelada.')}>Cancelar</button>
                  </div>
                ) : (
                  <button className="btn-primary btn-sm" disabled={ocupado === c.id} onClick={() => accion(() => api.reservar(c.id), c.id, r => (r.en_espera ? 'Clase completa: quedaste en lista de espera.' : '¡Lugar reservado!'))}>
                    {c.libres > 0 ? 'Reservar' : 'Lista de espera'}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function Rutinas({ api }) {
  const rs = useCarga(() => api.rutinas(), [api]);
  const [txt, setTxt] = useState({});
  if (rs.cargando && !rs.data) return <Cargando />;
  if (!rs.data?.length) return <p className="card text-sm text-muted-foreground text-center">Todavía no tenés rutinas asignadas.</p>;
  const comentar = async (id) => { try { await api.comentarRutina(id, txt[id]); setTxt(t => ({ ...t, [id]: '' })); rs.recargar(); } catch { /* el input queda con el texto */ } };
  return rs.data.map(r => {
    const dias = [...new Set(r.ejercicios.map(e => e.dia))];
    return (
      <div key={r.id} className="card space-y-3">
        <div><h2 className="font-semibold">{r.nombre}</h2><p className="text-xs text-muted-foreground">{r.objetivo}{r.profesor ? ` · Prof. ${r.profesor.nombre} ${r.profesor.apellido}` : ''} · v{r.version_actual}</p></div>
        {dias.map(dia => (
          <div key={dia}>
            <h3 className="text-sm font-medium mb-1">{dia}</h3>
            <ul className="divide-y divide-border text-sm">
              {r.ejercicios.filter(e => e.dia === dia).map(e => (
                <li key={e.id} className="py-1.5 flex justify-between gap-2">
                  <span>{e.nombre}{e.notas && <span className="block text-xs text-muted-foreground">{e.notas}</span>}</span>
                  <span className="text-right text-xs text-muted-foreground shrink-0">{[e.series && `${e.series}×${e.repeticiones || ''}`, e.peso, e.descanso_seg && `${e.descanso_seg}s`].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {r.comentarios.map(c => <p key={c.id} className="text-xs rounded bg-muted px-2 py-1"><strong>{c.autor}:</strong> {c.texto}</p>)}
        <div className="flex gap-2">
          <input className="input text-sm" placeholder="Comentario para tu profe…" value={txt[r.id] || ''} onChange={e => setTxt(t => ({ ...t, [r.id]: e.target.value }))} maxLength={2000} />
          <button className="btn-outline btn-sm" disabled={(txt[r.id] || '').trim().length < 2} onClick={() => comentar(r.id)}>Enviar</button>
        </div>
      </div>
    );
  });
}

function Evaluaciones({ api }) {
  const ev = useCarga(() => api.evaluaciones(), [api]);
  if (ev.cargando && !ev.data) return <Cargando />;
  const filas = ev.data || [];
  return (
    <div className="space-y-3">
      <div className="card"><h2 className="text-sm font-semibold mb-2">Evolución del peso</h2><Linea puntos={filas.map(e => ({ x: e.fecha, y: e.peso }))} formato={v => `${v} kg`} /></div>
      <Tabla filas={[...filas].reverse()} vacio="Sin evaluaciones." columnas={[
        { k: 'fecha', l: 'Fecha', r: e => fechaCorta(e.fecha) }, { k: 'peso', l: 'Peso', r: e => (e.peso ? `${e.peso} kg` : '—') },
        { k: 'imc', l: 'IMC' }, { k: 'grasa_pct', l: 'Grasa', r: e => (e.grasa_pct ? `${e.grasa_pct}%` : '—') }, { k: 'cintura', l: 'Cintura', r: e => (e.cintura ? `${e.cintura} cm` : '—') },
      ]} />
    </div>
  );
}

function Asistencia({ api }) {
  const as = useCarga(() => api.asistencia(), [api]);
  if (as.cargando && !as.data) return <Cargando />;
  return (
    <Tabla filas={as.data || []} vacio="Sin asistencias en los últimos 90 días." columnas={[
      { k: 'fecha', l: 'Fecha', r: a => fechaCorta(a.fecha) }, { k: 'hora', l: 'Hora' },
      { k: 'actividad', l: 'Actividad', r: a => a.actividad?.nombre || (a.origen === 'acceso' ? 'Ingreso' : '—') },
    ]} />
  );
}
