import { useState, useEffect, useCallback } from 'react';
import { BellRing, CheckCircle, Clock, XCircle, Loader2, Repeat, ChevronDown } from 'lucide-react';
import api from '../services/api';

/**
 * Confirmación de asistencia por WhatsApp (services/recordatorioService del backend).
 *
 *  modo="config"  → Configuración: hora de envío de los recordatorios (configuracion_chatbot).
 *  modo="agenda"  → Agenda: aviso de turnos cancelados por falta de confirmación y
 *                   lista desplegable con su estado (pendiente / confirmado / cancelado).
 */
const ESTADOS = {
  pendiente:  { label: 'Pendiente',  icon: Clock,       cls: 'text-warning bg-warning/12 border-warning/30' },
  confirmado: { label: 'Confirmado', icon: CheckCircle, cls: 'text-success bg-success/12 border-success/30' },
  cancelado:  { label: 'Cancelado',  icon: XCircle,     cls: 'text-danger bg-danger/12 border-danger/30' },
};

export function EstadoConfirmacionBadge({ estado }) {
  const e = ESTADOS[estado];
  if (!e) return null;
  const Icon = e.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${e.cls}`}>
      <Icon className="w-3 h-3" aria-hidden="true" /> {e.label}
    </span>
  );
}

function ConfigHora({ complexId }) {
  const [hora, setHora] = useState('');
  const [activo, setActivo] = useState(false);
  const [estado, setEstado] = useState(null);   // { ok } | { error }
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get(`/turnos/config/${complexId}`).then(c => { setHora(c.hora_recordatorio || '20:00'); setActivo(!!c.hora_recordatorio); }).catch(() => {});
  }, [complexId]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true); setEstado(null);
    try {
      await api.put(`/turnos/config/${complexId}`, { hora_recordatorio: activo ? hora : null });
      setEstado({ ok: activo ? `Listo: los recordatorios salen todos los días a las ${hora} hs.` : 'Recordatorios desactivados.' });
    } catch (err) { setEstado({ error: err?.message || 'No se pudo guardar.' }); }
    finally { setGuardando(false); }
  };

  return (
    <form onSubmit={guardar} className="card space-y-3">
      <h3 className="font-semibold flex items-center gap-2"><BellRing className="w-5 h-5 text-primary" aria-hidden="true" /> Confirmación de asistencia por WhatsApp</h3>
      <p className="text-sm text-muted-foreground">
        Todos los días, a la hora elegida, el chatbot pide confirmar los turnos de las próximas 24 h que se reservaron con más de 24 h de anticipación y los turnos fijos.
        Si el cliente no responde en <strong>3 horas</strong>, el turno se cancela solo, se libera el horario y se le avisa.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="w-4 h-4 accent-[var(--color-primary)]" />
        Enviar recordatorios automáticos
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Hora de envío</span>
          <input type="time" className="input !w-36" value={hora} onChange={e => setHora(e.target.value)} disabled={!activo} required={activo} step={300} />
        </label>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Guardar
        </button>
      </div>
      {estado?.ok && <p className="text-sm text-success" role="status">{estado.ok}</p>}
      {estado?.error && <p className="text-sm text-danger" role="alert">{estado.error}</p>}
    </form>
  );
}

function PanelAgenda({ complexId }) {
  const [data, setData] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(() => api.get(`/turnos/confirmaciones/${complexId}`).then(setData).catch(() => setData(null)), [complexId]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 60_000); return () => clearInterval(t); }, [cargar]);

  const accion = async (id, tipo) => {
    if (tipo === 'cancelar' && !confirm('¿Cancelar el turno por falta de confirmación? Se avisa al cliente por WhatsApp.')) return;
    setOcupado(id);
    try { await api.patch(`/turnos/${id}/${tipo}`); await cargar(); } catch (e) { alert(e?.message || 'No se pudo actualizar.'); }
    finally { setOcupado(null); }
  };

  if (!data || !data.turnos.length) return null;
  const { totales } = data;
  return (
    <section className={`card p-0 overflow-hidden ${totales.cancelado ? 'border-danger/40' : ''}`}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
        <BellRing className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
        <span className="font-semibold text-sm mr-auto">Confirmaciones por WhatsApp</span>
        {totales.cancelado > 0 && (
          <span className="badge-red" title="Cancelados por falta de confirmación (últimos 7 días)">
            {totales.cancelado} cancelado{totales.cancelado !== 1 && 's'} sin confirmar
          </span>
        )}
        <span className="text-xs text-muted-foreground">{totales.pendiente} pendiente{totales.pendiente !== 1 && 's'} · {totales.confirmado} confirmado{totales.confirmado !== 1 && 's'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {abierto && (
        <ul className="divide-y divide-border border-t border-border max-h-80 overflow-y-auto">
          {data.turnos.map(t => (
            <li key={t.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="tabular-nums font-semibold w-28">{t.fecha.slice(8, 10)}/{t.fecha.slice(5, 7)} {t.hora_inicio}</span>
              <span className="min-w-0 flex-1 truncate">
                {t.nombre_cliente} <span className="text-muted-foreground">· {t.cancha}</span>
                {t.turno_fijo && <Repeat className="inline w-3.5 h-3.5 ml-1 text-muted-foreground" aria-label="Turno fijo" />}
              </span>
              <EstadoConfirmacionBadge estado={t.estado_confirmacion} />
              {t.estado_confirmacion === 'pendiente' && (
                <span className="flex gap-1.5">
                  <button className="btn-outline btn-sm" disabled={ocupado === t.id} onClick={() => accion(t.id, 'confirmar')}>Confirmar</button>
                  <button className="btn-ghost btn-sm text-danger" disabled={ocupado === t.id} onClick={() => accion(t.id, 'cancelar')}>Cancelar</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ConfirmacionAsistencia({ complexId, modo = 'agenda' }) {
  if (!complexId) return null;
  return modo === 'config' ? <ConfigHora complexId={complexId} /> : <PanelAgenda complexId={complexId} />;
}
