import { useState, useEffect, useMemo } from 'react';
import { X, CalendarClock, History } from 'lucide-react';
import { diasTorneo, fechaCorta, errMsg } from '../../utils/torneos';

const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** Modal base responsive (en móvil sube desde abajo; respeta el modo oscuro). */
export function ModalTorneo({ titulo, icon: Icon, onClose, children, ancho = 'sm:max-w-lg' }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative z-10 w-full ${ancho} bg-card text-foreground border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-primary" />}{titulo}</h3>
          <button className="p-1 rounded hover:bg-muted" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Reprogramar partido: datos actuales → nueva fecha / horario / cancha (o "sin programar"),
 * motivo e historial. Solo ofrece horarios libres de la cancha (franja cedida al torneo y sin
 * otros partidos); el backend vuelve a validar todo. `permisos` deshabilita lo no permitido.
 */
export default function ReprogramarModal({ svc, torneo, partido, partidos = [], permisos = {}, onClose, onGuardado, categoria }) {
  const prevista = Boolean(partido.prevista);   // partido de la llave de referencia (todavía no generada)
  const [slots, setSlots] = useState(null);
  const [hist, setHist] = useState(null);
  const [verHist, setVerHist] = useState(false);
  const [estado, setEstado] = useState('programado');
  const [fecha, setFecha] = useState(partido.fecha || torneo.fecha_inicio);
  const [fieldId, setFieldId] = useState(partido.field_id || '');
  const [hora, setHora] = useState(partido.hora || '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const puede = (k) => permisos[k] !== false;

  useEffect(() => { svc.getSlots(torneo.id).then(setSlots).catch(() => setSlots([])); }, [svc, torneo.id]);
  useEffect(() => {
    if (prevista) { setHist([]); return; }
    svc.historialPartido(torneo.id, partido.id).then(setHist).catch(() => setHist([]));
  }, [svc, torneo.id, partido.id, prevista]);

  // Canchas cedidas al torneo (catálogo) y horarios libres de la cancha/día elegidos
  const canchas = useMemo(() => {
    const m = new Map();
    for (const s of slots || []) if (!m.has(s.field_id)) m.set(s.field_id, s.cancha);
    if (partido.field_id && !m.has(partido.field_id)) m.set(partido.field_id, partido.cancha);
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }));
  }, [slots, partido]);
  const ocupados = useMemo(() => new Set(partidos.filter(p => p.id !== partido.id && p.fecha && p.field_id).map(p => `${p.field_id}|${p.fecha}|${p.hora}`)), [partidos, partido.id]);
  const horas = useMemo(() => (slots || [])
    .filter(s => s.field_id === Number(fieldId) && s.fecha === fecha && !ocupados.has(`${s.field_id}|${s.fecha}|${s.hora}`))
    .map(s => s.hora).sort(), [slots, fieldId, fecha, ocupados]);
  useEffect(() => { if (hora && slots && !horas.includes(hora) && !(fecha === partido.fecha && Number(fieldId) === partido.field_id && hora === partido.hora)) setHora(''); }, [horas]);   // eslint-disable-line react-hooks/exhaustive-deps

  const sinCambios = estado === 'programado' && fecha === partido.fecha && hora === partido.hora && Number(fieldId) === partido.field_id && (!prevista || partido.fijado);
  const guardar = async (e) => {
    e.preventDefault(); setError('');
    if (estado === 'programado' && (!fecha || !hora || !fieldId)) return setError('Elegí día, cancha y horario.');
    if (sinCambios) return setError('No hay cambios: es el mismo día, horario y cancha.');
    const nueva = estado === 'pendiente' ? (prevista ? 'horario automático (simulación)' : 'sin programar') : `${fechaCorta(fecha)} ${hora} hs en ${canchas.find(c => c.id === Number(fieldId))?.nombre || 'la cancha elegida'}`;
    if (!window.confirm(`¿Reprogramar el partido a ${nueva}?`)) return;
    setGuardando(true);
    try {
      const body = estado === 'pendiente'
        ? { estado: 'pendiente', motivo: motivo.trim() || undefined }
        : { field_id: Number(fieldId), fecha, hora, motivo: motivo.trim() || undefined };
      if (prevista) await svc.programarPrevista(torneo.id, categoria, partido.clave, body);
      else await svc.reprogramar(torneo.id, partido.id, body);
      onGuardado(nueva);
    } catch (err) { setError(errMsg(err)); } finally { setGuardando(false); }
  };

  return (
    <ModalTorneo titulo="Reprogramar partido" icon={CalendarClock} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <div className="text-[15px] font-medium leading-snug">{partido.pareja1?.nombre || 'A definir'} <span className="text-xs text-muted-foreground">vs</span> {partido.pareja2?.nombre || 'A definir'}</div>
          <div className="text-xs text-muted-foreground mt-1"><strong className="text-foreground">Actual:</strong> {partido.fecha ? `${fechaCorta(partido.fecha)} · ${partido.hora} hs · ${partido.cancha || 'sin cancha'}` : 'Sin programar'}{prevista && (partido.fijado ? ' (fijado a mano)' : ' (simulado)')}</div>
          {prevista && <div className="text-[11px] text-muted-foreground mt-1">La llave todavía no está generada: el horario queda reservado y se respeta al simular y al generar la llave.</div>}
        </div>

        <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Estado de programación">
          <label className="flex items-center gap-2"><input type="radio" checked={estado === 'programado'} onChange={() => setEstado('programado')} /> Programar</label>
          {(!prevista || partido.fijado) && <label className="flex items-center gap-2"><input type="radio" checked={estado === 'pendiente'} onChange={() => setEstado('pendiente')} /> {prevista ? 'Volver al horario automático' : 'Dejar sin programar'}</label>}
        </div>

        {estado === 'programado' && (
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-xs text-muted-foreground">Nueva fecha
              <select className="input text-sm" value={fecha} disabled={!puede('tournament.match.change_date')} onChange={e => setFecha(e.target.value)}>
                {diasTorneo(torneo.fecha_inicio, torneo.fecha_fin).map(d => <option key={d} value={d}>{fechaCorta(d)}</option>)}
              </select></label>
            <label className="text-xs text-muted-foreground">Nueva cancha
              <select className="input text-sm" value={fieldId} disabled={!puede('tournament.match.change_court')} onChange={e => setFieldId(Number(e.target.value))}>
                <option value="">Elegí</option>
                {canchas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select></label>
            <label className="text-xs text-muted-foreground">Nuevo horario
              <select className="input text-sm" value={hora} disabled={!puede('tournament.match.change_time')} onChange={e => setHora(e.target.value)}>
                <option value="">{slots === null ? 'Cargando…' : horas.length ? 'Elegí' : 'Sin horarios libres'}</option>
                {fecha === partido.fecha && Number(fieldId) === partido.field_id && partido.hora && !horas.includes(partido.hora) && <option value={partido.hora}>{partido.hora} (actual)</option>}
                {horas.map(h => <option key={h} value={h}>{h}</option>)}
              </select></label>
          </div>
        )}
        {estado === 'programado' && <p className="text-[11px] text-muted-foreground">Solo se muestran horarios libres dentro de la franja que la cancha tiene cedida al torneo.</p>}

        <label className="block text-xs text-muted-foreground">Motivo de la reprogramación
          <input className="input text-sm" maxLength={255} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: lluvia, pedido de una pareja" /></label>

        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {!prevista ? <button type="button" className="btn-ghost text-sm mr-auto" onClick={() => setVerHist(v => !v)}><History className="w-4 h-4" /> Historial{hist?.length ? ` (${hist.length})` : ''}</button> : <span className="mr-auto" />}
          <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm" disabled={guardando || sinCambios}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
        {verHist && (
          <ul className="border-t border-border pt-3 space-y-2 text-xs">
            {!hist?.length && <li className="text-muted-foreground">Sin reprogramaciones.</li>}
            {(hist || []).map(h => (
              <li key={h.id} className="rounded-lg bg-muted/50 px-3 py-2">
                <div><strong>{h.usuario || '—'}</strong> · {fechaHora(h.createdAt || h.created_at)}</div>
                <div className="text-muted-foreground">{h.old_fecha ? `${fechaCorta(h.old_fecha)} ${h.old_hora} · ${h.old_cancha || '—'}` : 'Sin programar'} → <span className="text-foreground">{h.new_fecha ? `${fechaCorta(h.new_fecha)} ${h.new_hora} · ${h.new_cancha || '—'}` : 'Sin programar'}</span></div>
                {h.motivo && <div className="italic">“{h.motivo}”</div>}
              </li>
            ))}
          </ul>
        )}
      </form>
    </ModalTorneo>
  );
}

/** "Última modificación realizada por X el día DD/MM/AAAA" */
export function UltimaModificacion({ p }) {
  const u = p?.ultima_modificacion;
  if (!u) return null;
  return <div className="text-[11px] text-muted-foreground">Última modificación realizada por {u.usuario || '—'} el día {new Date(u.fecha).toLocaleDateString('es-AR')}</div>;
}
