import { useState, useEffect, useCallback } from 'react';
import { Ban, UserCheck, Loader2 } from 'lucide-react';
import api from '../services/api';
import { complexService } from '../services/complexService';

const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/**
 * Lista GLOBAL de incumplidos por inasistencias (vale en todos los complejos).
 * Filtro por complejo de origen. "Habilitar" lo saca de la lista en todos los
 * complejos (el admin del complejo solo puede habilitar los originados en el suyo).
 * @param {number} [props.complexIdInicial]  complejo preseleccionado en el filtro
 */
export default function IncumplidosGlobal({ complexIdInicial = '' }) {
  const [lista, setLista] = useState(null);
  const [complejos, setComplejos] = useState([]);
  const [filtro, setFiltro] = useState(complexIdInicial ? String(complexIdInicial) : '');
  const [ocupado, setOcupado] = useState(null);
  const [msg, setMsg] = useState(null);

  const cargar = useCallback(() => api.get('/incumplidos', { params: filtro ? { complex_id: filtro } : {} })
    .then(setLista).catch(() => setLista([])), [filtro]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { complexService.getAll().then(setComplejos).catch(() => {}); }, []);

  const habilitar = async (inc) => {
    if (!confirm(`¿Habilitar a ${inc.nombre || 'este jugador'} en todos los complejos?`)) return;
    setOcupado(inc.id); setMsg(null);
    try { const r = await api.patch(`/incumplidos/${inc.id}`); setMsg({ ok: r.message }); cargar(); }
    catch (e) { setMsg({ error: e?.message || 'No se pudo habilitar.' }); } finally { setOcupado(null); }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold flex items-center gap-2 mr-auto">
          <Ban className="w-5 h-5 text-danger" /> Incumplidos (todos los complejos)
          {lista?.length > 0 && <span className="badge-red">{lista.length}</span>}
        </h3>
        <label className="text-xs text-muted-foreground flex items-center gap-2">Originados en
          <select className="input !w-auto !py-1.5 text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos los complejos</option>
            {complejos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      </div>
      {msg?.ok && <p className="text-sm text-success" role="status">{msg.ok}</p>}
      {msg?.error && <p className="text-sm text-danger" role="alert">{msg.error}</p>}
      {!lista ? <div className="skeleton h-16" /> : lista.length === 0 ? (
        <div className="card text-sm text-muted-foreground py-6 text-center">No hay jugadores bloqueados por inasistencias.</div>
      ) : (
        <div className="card p-0 divide-y divide-border">
          {lista.map(inc => (
            <div key={inc.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{inc.nombre || 'Sin nombre'}</div>
                <div className="text-xs text-muted-foreground">
                  {inc.telefono}{inc.user_id ? ` · cuenta #${inc.user_id}` : ''} · origen: {inc.complejo_origen?.nombre || `#${inc.complejo_origen?.id}`} · {fecha(inc.fecha_ultima_inasistencia)}
                </div>
              </div>
              {inc.puede_habilitar ? (
                <button onClick={() => habilitar(inc)} disabled={ocupado === inc.id} className="btn-outline btn-sm">
                  {ocupado === inc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4 text-success" />} Habilitar
                </button>
              ) : <span className="text-xs text-muted-foreground">Lo habilita su complejo de origen</span>}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Un jugador en esta lista no puede reservar en complejos sin Mercado Pago (debe pedir el turno a la cancha); en complejos con Mercado Pago solo reserva pagando online.
        Sale de la lista al habilitarlo, o solo tras 30 días sin faltas y 2 turnos asistidos.
      </p>
    </section>
  );
}
