import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, History } from 'lucide-react';
import { ModalTorneo } from './ReprogramarModal';
import { CATEGORIAS, catLabel, catNombre, errMsg } from '../../utils/torneos';

const VACIO = { nombre: '', dni: '', whatsapp: '', email: '', categoria: '', genero: '', fecha_nacimiento: '', posicion: '', observaciones: '' };
const POSICION = { drive: 'Drive', reves: 'Revés' };
const ACCION = { CREATE: 'Alta', UPDATE: 'Modificación', DELETE: 'Baja' };

/**
 * "Editar plantel" de una inscripción (pareja de pádel: 2 jugadores).
 * Agregar / modificar / eliminar con validaciones del backend (DNI único en el torneo,
 * posición única en la pareja, categoría, género, cupo, participación) e historial.
 */
export default function PlantelModal({ svc, torneo, pareja, permisos = {}, onClose, onCambio }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);       // { id? , ...campos }
  const [hist, setHist] = useState(null);
  const [msg, setMsg] = useState({});
  const [guardando, setGuardando] = useState(false);
  const puede = (k) => permisos[k] !== false;
  const cargar = useCallback(() => svc.plantel(torneo.id, pareja.id).then(setData).catch(e => setMsg({ error: errMsg(e) })), [svc, torneo.id, pareja.id]);
  useEffect(() => { cargar(); }, [cargar]);
  const catPareja = pareja.categoria_id || torneo.categoria;
  const generoDefault = torneo.genero === 'femenino' ? 'femenino' : 'masculino';
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async (e) => {
    e.preventDefault(); setMsg({});
    if (!form.nombre.trim() || !form.dni || !form.whatsapp || !form.categoria) return setMsg({ error: 'Completá nombre, DNI, teléfono y categoría.' });
    if (!window.confirm(form.id ? `¿Guardar los cambios de ${form.nombre}?` : `¿Agregar a ${form.nombre} a la pareja?`)) return;
    setGuardando(true);
    const body = { ...form, categoria: Number(form.categoria), posicion: form.posicion || null, fecha_nacimiento: form.fecha_nacimiento || null };
    delete body.id;
    try {
      const r = form.id ? await svc.plantelModificar(torneo.id, pareja.id, form.id, body) : await svc.plantelAgregar(torneo.id, pareja.id, body);
      setData(r); setForm(null); setHist(null); setMsg({ ok: form.id ? 'Jugador actualizado.' : 'Jugador agregado.' }); onCambio?.();
    } catch (err) { setMsg({ error: errMsg(err) }); } finally { setGuardando(false); }
  };
  const eliminar = async (j) => {
    if (!window.confirm(`¿Eliminar a ${j.nombre} de la pareja? Vas a tener que agregar un reemplazo.`)) return;
    setMsg({});
    try { setData(await svc.plantelEliminar(torneo.id, pareja.id, j.id)); setHist(null); setMsg({ ok: `${j.nombre} fue eliminado: agregá el reemplazo.` }); onCambio?.(); }
    catch (err) { setMsg({ error: errMsg(err) }); }
  };
  const verHistorial = async () => {
    if (hist) return setHist(null);
    try { setHist(await svc.plantelHistorial(torneo.id, pareja.id)); } catch (err) { setMsg({ error: errMsg(err) }); }
  };

  return (
    <ModalTorneo titulo="Editar plantel" icon={Users} onClose={onClose} ancho="sm:max-w-2xl">
      {!data ? <p className="text-sm text-muted-foreground">{msg.error || 'Cargando…'}</p> : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Categoría {catNombre(catPareja)} · {data.jugadores.length}/{data.cupo} jugadores{data.participacion ? ` · ${data.partidos_jugados} partido(s) jugado(s): no se pueden eliminar jugadores` : ''}</p>
          <ul className="divide-y divide-border border border-border rounded-xl">
            {data.jugadores.map(j => (
              <li key={j.id} className="px-3 py-2.5 flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-words">{j.nombre}{j.posicion && <span className="ml-2 badge-neutral">{POSICION[j.posicion]}</span>}</div>
                  <div className="text-xs text-muted-foreground">DNI {j.dni} · {catLabel(j.categoria)} · {j.whatsapp}{j.email ? ` · ${j.email}` : ''}</div>
                  {j.observaciones && <div className="text-xs italic text-muted-foreground">{j.observaciones}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {puede('tournament.team.update_player') && <button className="btn-ghost btn-sm" onClick={() => setForm({ ...VACIO, ...j, fecha_nacimiento: j.fecha_nacimiento || '', posicion: j.posicion || '', observaciones: j.observaciones || '', email: j.email || '' })}><Pencil className="w-4 h-4" /> Editar</button>}
                  {puede('tournament.team.remove_player') && !data.participacion && <button className="btn-ghost btn-sm !text-danger" onClick={() => eliminar(j)} aria-label={`Eliminar a ${j.nombre}`}><Trash2 className="w-4 h-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {data.jugadores.length < data.cupo && puede('tournament.team.add_player') && !form && (
              <button className="btn-primary text-sm" onClick={() => setForm({ ...VACIO, genero: generoDefault, categoria: catPareja })}><Plus className="w-4 h-4" /> Agregar jugador</button>
            )}
            <button className="btn-ghost text-sm ml-auto" onClick={verHistorial}><History className="w-4 h-4" /> {hist ? 'Ocultar historial' : 'Historial de cambios'}</button>
          </div>

          {form && (
            <form onSubmit={guardar} className="card space-y-3 border-primary/40">
              <div className="font-semibold text-sm">{form.id ? `Editar a ${form.nombre}` : 'Nuevo jugador'}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground sm:col-span-2">Nombre y apellido *<input className="input text-sm" maxLength={150} value={form.nombre} onChange={e => set('nombre', e.target.value)} /></label>
                <label className="text-xs text-muted-foreground">DNI *<input className="input text-sm" inputMode="numeric" value={form.dni} onChange={e => set('dni', e.target.value)} /></label>
                <label className="text-xs text-muted-foreground">Teléfono / WhatsApp *<input className="input text-sm" inputMode="tel" placeholder="5493811234567" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} /></label>
                <label className="text-xs text-muted-foreground">Email<input className="input text-sm" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></label>
                <label className="text-xs text-muted-foreground">Fecha de nacimiento<input className="input text-sm" type="date" value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} /></label>
                <label className="text-xs text-muted-foreground">Categoría *
                  <select className="input text-sm" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                    {CATEGORIAS.filter(c => c >= catPareja).map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                  </select></label>
                <label className="text-xs text-muted-foreground">Posición
                  <select className="input text-sm" value={form.posicion} onChange={e => set('posicion', e.target.value)}>
                    <option value="">—</option><option value="drive">Drive</option><option value="reves">Revés</option>
                  </select></label>
                <label className="text-xs text-muted-foreground">Género
                  <select className="input text-sm" value={form.genero} disabled={torneo.genero !== 'mixto'} onChange={e => set('genero', e.target.value)}>
                    <option value="masculino">Masculino</option><option value="femenino">Femenino</option>
                  </select></label>
                <label className="text-xs text-muted-foreground sm:col-span-2">Observaciones<input className="input text-sm" maxLength={255} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} /></label>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
                <button className="btn-primary text-sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          )}
          {msg.error && <p className="text-sm text-red-400" role="alert">{msg.error}</p>}
          {msg.ok && <p className="text-sm text-green-400" role="status">{msg.ok}</p>}
          {hist && (
            <ul className="space-y-2 text-xs">
              {!hist.length && <li className="text-muted-foreground">Sin cambios registrados.</li>}
              {hist.map(h => (
                <li key={h.id} className="rounded-lg bg-muted/50 px-3 py-2">
                  <span className="badge-neutral mr-1">{ACCION[h.accion]}</span>
                  <strong>{h.datos_nuevos?.nombre || h.datos_anteriores?.nombre}</strong> · {h.usuario || '—'} · {new Date(h.createdAt || h.created_at).toLocaleString('es-AR')}
                  {h.accion === 'UPDATE' && (
                    <div className="text-muted-foreground mt-0.5">
                      {Object.keys(h.datos_nuevos || {}).filter(k => String(h.datos_nuevos[k] ?? '') !== String(h.datos_anteriores?.[k] ?? '')).map(k => `${k}: ${h.datos_anteriores?.[k] ?? '—'} → ${h.datos_nuevos[k] ?? '—'}`).join(' · ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ModalTorneo>
  );
}
