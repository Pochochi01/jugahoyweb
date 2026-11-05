import { useState, useEffect, useCallback } from 'react';
import { Send, CheckCheck, MousePointerClick, XCircle, Smartphone, Percent, RotateCcw, Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { errMsg } from '../../utils/torneos';

/**
 * Administración > Notificaciones: métricas, historial filtrable (torneo, jugador, estado, tipo)
 * y reenvío. Las notificaciones las generan los jobs automáticos de torneos (push a la PWA).
 */
export const TIPO_NOTIF = {
  recordatorio_partido: 'Recordatorio de partido', recordatorio_pago: 'Recordatorio de pago',
  resultado_ganador: 'Ganó el partido', resultado_perdedor: 'Perdió el partido',
  clasificado_zona: 'Clasificó de zona', avanza_llave: 'Avanza en la llave',
  eliminado_semifinal: 'Eliminado en semifinal', finalista: 'Finalista', campeon: 'Campeón', subcampeon: 'Subcampeón',
  torneo_finalizado: 'Torneo finalizado', manual: 'Manual',
};
const ESTADO_NOTIF = {
  pendiente: ['Pendiente', 'badge-yellow'], procesando: ['Enviando', 'badge-yellow'], enviado: ['Enviada', 'badge-blue'],
  entregado: ['Entregada', 'badge-green'], abierto: ['Abierta', 'badge-green'], fallido: ['Fallida', 'badge-red'], omitido: ['Omitida', ''],
};
const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Kpi({ icon: Icon, label, valor, sub }) {
  return (
    <div className="card !p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function NotificacionesPanel({ svc }) {
  const [torneos, setTorneos] = useState([]);
  const [f, setF] = useState({ torneo_id: '', jugador: '', estado: '', tipo: '' });
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [met, setMet] = useState(null);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [reenviando, setReenviando] = useState(null);

  useEffect(() => { svc.list().then(d => setTorneos(d.torneos || [])).catch(() => {}); }, [svc]);
  const filtros = useCallback(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v)), [f]);
  const cargar = useCallback(() => {
    setError('');
    svc.notifMetricas(f.torneo_id ? { torneo_id: f.torneo_id } : {}).then(setMet).catch(e => setError(errMsg(e)));
    svc.notificaciones({ ...filtros(), page, limit: 25 }).then(setLista).catch(e => setError(errMsg(e)));
  }, [svc, f, page, filtros]);
  useEffect(() => { cargar(); }, [cargar]);
  // Búsqueda por jugador con espera (no consulta en cada tecla)
  useEffect(() => { const t = setTimeout(() => { setF(o => ({ ...o, jugador: buscar.trim() })); setPage(1); }, 400); return () => clearTimeout(t); }, [buscar]);
  const set = (k, v) => { setF(o => ({ ...o, [k]: v })); setPage(1); };

  const reenviar = async (n) => {
    setReenviando(n.id); setAviso('');
    try {
      const r = await svc.notifReenviar(n.id);
      setAviso(r.estado === 'omitido' ? `No se reenvió a ${n.nombre || n.dni}: ${r.motivo}.` : `Reenvío encolado para ${n.nombre || n.dni}.`);
      cargar();
    } catch (e) { setError(errMsg(e)); } finally { setReenviando(null); }
  };
  const paginas = lista ? Math.ceil(lista.total / lista.limit) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Avisos automáticos a los jugadores que tienen la app de JugaHoy instalada: recordatorios de partido (3 h antes) y de pago,
        resultados, clasificaciones, finales y cierre del torneo.
        {met && !met.disponible && <span className="text-amber-400"> Las notificaciones push no están configuradas en el servidor.</span>}
      </p>

      {met ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
          <Kpi icon={Send} label="Enviadas" valor={met.enviadas} sub={`${met.pendientes} en cola · ${met.omitidas} omitidas`} />
          <Kpi icon={CheckCheck} label="Entregadas" valor={met.entregadas} />
          <Kpi icon={MousePointerClick} label="Abiertas" valor={met.abiertas} />
          <Kpi icon={Percent} label="CTR" valor={`${met.ctr}%`} sub="abiertas / entregadas" />
          <Kpi icon={XCircle} label="Tasa de entrega" valor={`${met.tasa_entrega}%`} sub={`${met.fallidas} fallidas`} />
          <Kpi icon={Smartphone} label="Jugadores con la app" valor={met.usuarios_pwa} sub={met.proveedor === 'fcm' ? 'vía Firebase' : 'vía Web Push'} />
        </div>
      ) : <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>}

      <div className="card !p-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="text-xs text-muted-foreground">Torneo
          <select className="input text-sm" value={f.torneo_id} onChange={e => set('torneo_id', e.target.value)}>
            <option value="">Todos</option>
            {torneos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select></label>
        <label className="text-xs text-muted-foreground">Jugador (nombre o DNI)
          <span className="relative block"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="input text-sm !pl-8" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar…" /></span></label>
        <label className="text-xs text-muted-foreground">Estado
          <select className="input text-sm" value={f.estado} onChange={e => set('estado', e.target.value)}>
            <option value="">Todos</option>
            <option value="enviado,entregado,abierto">Enviadas</option>
            <option value="entregado,abierto">Entregadas</option>
            <option value="abierto">Abiertas</option>
            <option value="fallido">Fallidas</option>
            <option value="omitido">Omitidas</option>
            <option value="pendiente,procesando">En cola</option>
          </select></label>
        <label className="text-xs text-muted-foreground">Tipo
          <select className="input text-sm" value={f.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TIPO_NOTIF).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}
      {aviso && <div className="text-sm text-emerald-400" role="status">{aviso}</div>}

      {!lista ? <div className="h-40 rounded-xl bg-muted animate-pulse" />
        : !lista.items.length ? (
          <div className="card text-center py-10 text-sm text-muted-foreground"><Inbox className="w-8 h-8 mx-auto mb-2" />No hay notificaciones con estos filtros.</div>
        ) : (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr className="border-b border-border text-left">
                <th className="px-3 py-2">Fecha</th><th className="px-2">Jugador</th><th className="px-2">Notificación</th><th className="px-2">Estado</th><th className="px-3 text-right">Acción</th>
              </tr></thead>
              <tbody>{lista.items.map(n => {
                const [lbl, cls] = ESTADO_NOTIF[n.estado] || [n.estado, ''];
                return (
                  <tr key={n.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{fechaHora(n.fecha_envio || n.createdAt)}{n.reenvio_de && <div className="text-[10px] text-muted-foreground">reenvío</div>}</td>
                    <td className="px-2 py-2"><div className="font-medium">{n.nombre || '—'}</div><div className="text-xs text-muted-foreground">DNI {n.dni}</div></td>
                    <td className="px-2 py-2 min-w-[14rem]"><div className="font-medium">{n.titulo}</div><div className="text-xs text-muted-foreground">{TIPO_NOTIF[n.tipo] || n.tipo}{n.torneo_id && torneos.find(t => t.id === n.torneo_id) ? ` · ${torneos.find(t => t.id === n.torneo_id).nombre}` : ''}</div></td>
                    <td className="px-2 py-2">
                      <span className={`badge ${cls}`}>{lbl}</span>
                      {n.abierto_at && <div className="text-[10px] text-muted-foreground">abierta {fechaHora(n.abierto_at)}</div>}
                      {n.motivo && ['fallido', 'omitido', 'pendiente'].includes(n.estado) && <div className="text-[10px] text-muted-foreground max-w-[14rem]">{n.motivo}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!['pendiente', 'procesando'].includes(n.estado) && (
                        <button className="btn-ghost text-xs" disabled={reenviando === n.id} onClick={() => reenviar(n)}><RotateCcw className="w-3.5 h-3.5" /> {reenviando === n.id ? 'Reenviando…' : 'Reenviar'}</button>
                      )}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span>{page} / {paginas} · {lista.total} notificaciones</span>
          <button className="btn-ghost" disabled={page >= paginas} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
