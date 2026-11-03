import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Pencil, Ban, Users, CalendarDays, BarChart2, UserPlus, X } from 'lucide-react';
import {
  useGym, puede, Modal, Campo, Tabla, Columnas, EstadoBadge, fechaCorta, nombre, hoy, sumarDias,
  useCarga, Cargando, ErrorBox, Vacio, DIAS, errMsg,
} from '../../../components/gym/GymUI';
import { BuscarSocio } from './GymCobranzas';

const ESTADO_CLASE = { disponible: ['Disponible', 'badge-green'], completa: ['Completa', 'badge-yellow'], cancelada: ['Cancelada', 'badge-red'], finalizada: ['Finalizada', 'badge-neutral'] };
const ESTADO_RES = { reservada: ['Reservada', 'badge-blue'], espera: ['En espera', 'badge-yellow'], cancelada: ['Cancelada', 'badge-neutral'], asistio: ['Asistió', 'badge-green'], ausente: ['Ausente', 'badge-red'] };
/** Lunes de la semana de `iso`. */
const lunesDe = (iso) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return sumarDias(iso, d === 0 ? -6 : 1 - d); };

export default function GymClases() {
  const [sec, setSec] = useState('agenda');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={`btn-sm ${sec === 'agenda' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSec('agenda')}><CalendarDays className="w-4 h-4" /> Agenda</button>
        <button className={`btn-sm ${sec === 'asistencia' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSec('asistencia')}><BarChart2 className="w-4 h-4" /> Asistencia</button>
      </div>
      {sec === 'agenda' ? <Agenda /> : <Asistencia />}
    </div>
  );
}

function useOpciones() {
  const { api } = useGym();
  const acts = useCarga(() => api.actividades.list({ activa: true }), [api]);
  const profs = useCarga(() => api.profesores.list({ activo: true }), [api]);
  return { actividades: acts.data || [], profesores: profs.data || [] };
}

function Agenda() {
  const { api, permisos, sucursales } = useGym();
  const [lunes, setLunes] = useState(lunesDe(hoy()));
  const [f, setF] = useState({ actividad_id: '', profesor_id: '', sucursal_id: '' });
  const { actividades, profesores } = useOpciones();
  const params = { desde: lunes, hasta: sumarDias(lunes, 6), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
  const { data, error, cargando, recargar } = useCarga(() => api.clases(params), [api, lunes, f.actividad_id, f.profesor_id, f.sucursal_id]);
  const [form, setForm] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <button className="btn-outline btn-sm !px-2" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium px-2">{fechaCorta(lunes)} – {fechaCorta(sumarDias(lunes, 6))}</span>
          <button className="btn-outline btn-sm !px-2" onClick={() => setLunes(sumarDias(lunes, 7))} aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <Campo className="min-w-[8rem]" label="Actividad" tipo="select" value={f.actividad_id} onChange={v => setF(x => ({ ...x, actividad_id: v }))} opciones={[['', 'Todas'], ...actividades.map(a => [String(a.id), a.nombre])]} />
        <Campo className="min-w-[8rem]" label="Profesor" tipo="select" value={f.profesor_id} onChange={v => setF(x => ({ ...x, profesor_id: v }))} opciones={[['', 'Todos'], ...profesores.map(p => [String(p.id), `${p.nombre} ${p.apellido}`])]} />
        {sucursales?.length > 0 && <Campo className="min-w-[8rem]" label="Sucursal" tipo="select" value={f.sucursal_id} onChange={v => setF(x => ({ ...x, sucursal_id: v }))} opciones={[['', 'Todas'], ...sucursales.map(s => [String(s.id), s.nombre])]} />}
        {puede(permisos, 'clases', 'crear') && <button className="btn-primary btn-sm ml-auto" onClick={() => setForm({ fecha: hoy(), hora_inicio: '09:00', duracion_min: 60, cupo: 20, repetir_semanas: 0 })}><Plus className="w-4 h-4" /> Nueva clase</button>}
      </div>
      {cargando && !data ? <Cargando /> : error ? <ErrorBox>{error}</ErrorBox> : (
        <div className="grid gap-2 lg:grid-cols-7">
          {dias.map(d => {
            const delDia = data.filter(c => c.fecha === d);
            const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
            return (
              <div key={d} className={`rounded-xl border border-border p-2 space-y-2 ${d === hoy() ? 'bg-primary/5 border-primary/40' : ''}`}>
                <div className="text-xs font-semibold text-muted-foreground">{DIAS[dow]} {d.slice(8)}/{d.slice(5, 7)}</div>
                {!delDia.length && <p className="text-[11px] text-muted-foreground hidden lg:block">—</p>}
                {delDia.map(c => (
                  <button key={c.id} onClick={() => setDetalle(c)} className="w-full text-left rounded-lg border border-border bg-card p-2 text-xs hover:border-primary/50 space-y-1"
                    style={{ borderLeft: `4px solid ${c.actividad?.color || 'rgb(var(--primary))'}` }}>
                    <div className="font-semibold truncate">{c.hora_inicio} · {c.actividad?.nombre}</div>
                    <div className="text-muted-foreground truncate">{c.profesor ? `${c.profesor.nombre} ${c.profesor.apellido}` : 'Sin profesor'}</div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{c.reservadas}/{c.cupo}{c.espera ? ` +${c.espera}` : ''}</span>
                      <EstadoBadge estado={c.estado} mapa={ESTADO_CLASE} />
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {form && <FormClase inicial={form} actividades={actividades} profesores={profesores} onClose={() => setForm(null)} onOk={() => { setForm(null); recargar(); }} />}
      {detalle && <DetalleClase clase={detalle} onClose={() => { setDetalle(null); recargar(); }} onEditar={() => { setForm(detalle); setDetalle(null); }} />}
    </div>
  );
}

function FormClase({ inicial, actividades, profesores, onClose, onOk }) {
  const { api, sucursales, avisar } = useGym();
  const editar = Boolean(inicial.id);
  const [f, setF] = useState({ ...inicial, actividad_id: inicial.actividad_id ? String(inicial.actividad_id) : '', profesor_id: inicial.profesor_id ? String(inicial.profesor_id) : '', sucursal_id: inicial.sucursal_id ? String(inicial.sucursal_id) : '' });
  const set = (k) => (v) => setF(x => ({ ...x, [k]: v }));
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const body = {
      actividad_id: Number(f.actividad_id), profesor_id: f.profesor_id ? Number(f.profesor_id) : null, sucursal_id: f.sucursal_id ? Number(f.sucursal_id) : null,
      fecha: f.fecha, hora_inicio: f.hora_inicio, duracion_min: Number(f.duracion_min), cupo: Number(f.cupo), notas: f.notas || null,
    };
    try {
      if (editar) { await api.actualizarClase(inicial.id, body); avisar('ok', 'Clase actualizada.'); }
      else {
        const r = await api.crearClase({ ...body, repetir_semanas: Number(f.repetir_semanas) || 0 });
        avisar('ok', `${r.creadas.length} clase(s) creada(s)${r.omitidas.length ? ` · omitidas por superposición: ${r.omitidas.map(fechaCorta).join(', ')}` : ''}.`);
      }
      onOk();
    } catch (err) { avisar('err', errMsg(err)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo={editar ? 'Editar clase' : 'Nueva clase'} onClose={onClose}>
      <form onSubmit={guardar} className="grid grid-cols-2 gap-3">
        <Campo className="col-span-2" label="Actividad" req tipo="select" value={f.actividad_id} onChange={set('actividad_id')} opciones={[['', 'Elegí…'], ...actividades.map(a => [String(a.id), a.nombre])]} />
        <Campo className="col-span-2" label="Profesor" tipo="select" value={f.profesor_id} onChange={set('profesor_id')} opciones={[['', 'Sin asignar'], ...profesores.map(p => [String(p.id), `${p.nombre} ${p.apellido}`])]} />
        {sucursales?.length > 0 && <Campo className="col-span-2" label="Sucursal" tipo="select" value={f.sucursal_id} onChange={set('sucursal_id')} opciones={[['', 'Sin sucursal'], ...sucursales.map(s => [String(s.id), s.nombre])]} />}
        <Campo label="Fecha" req tipo="date" value={f.fecha} onChange={set('fecha')} />
        <Campo label="Hora" req tipo="time" value={f.hora_inicio} onChange={set('hora_inicio')} />
        <Campo label="Duración (min)" req tipo="number" min="10" value={f.duracion_min} onChange={set('duracion_min')} />
        <Campo label="Cupos" req tipo="number" min="1" value={f.cupo} onChange={set('cupo')} />
        {!editar && <Campo className="col-span-2" label="Repetir las próximas semanas (0-26)" tipo="number" min="0" max="26" value={f.repetir_semanas} onChange={set('repetir_semanas')} />}
        <Campo className="col-span-2" label="Notas" value={f.notas} maxLength={255} onChange={set('notas')} />
        <button className="btn-primary col-span-2" disabled={guardando}>{editar ? 'Guardar' : 'Crear clase'}</button>
      </form>
    </Modal>
  );
}

function DetalleClase({ clase, onClose, onEditar }) {
  const { api, permisos, avisar } = useGym();
  const { data, error, cargando, recargar } = useCarga(() => api.reservasClase(clase.id), [api, clase.id]);
  const [presentes, setPresentes] = useState(null);
  const activa = !['cancelada', 'finalizada'].includes(clase.estado);
  const lista = useMemo(() => (data || []).filter(r => r.estado !== 'cancelada'), [data]);
  const marcados = presentes ?? new Set(lista.filter(r => r.estado === 'asistio').map(r => r.socio_id));

  const agregar = async (s) => {
    try { const r = await api.reservar(clase.id, s.id); avisar('ok', r.en_espera ? `${s.nombre} quedó en lista de espera.` : `${s.nombre} reservado.`); recargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const cancelarRes = async (r) => {
    try { const x = await api.cancelarReserva(r.id); avisar('ok', x.promovido ? 'Reserva cancelada: el primero en espera pasó a reservado.' : 'Reserva cancelada.'); recargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const guardarAsistencia = async () => {
    const elegibles = lista.filter(r => ['reservada', 'asistio', 'ausente'].includes(r.estado)).map(r => r.socio_id);
    try {
      await api.tomarAsistencia(clase.id, { presentes: [...marcados], ausentes: elegibles.filter(id => !marcados.has(id)) });
      avisar('ok', 'Asistencia guardada.'); setPresentes(null); recargar();
    } catch (e) { avisar('err', errMsg(e)); }
  };
  const cancelarClase = async () => {
    if (!window.confirm('¿Cancelar la clase? Se cancelan todas sus reservas.')) return;
    try { await api.cancelarClase(clase.id); avisar('ok', 'Clase cancelada.'); onClose(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const toggle = (id) => setPresentes(() => { const s = new Set(marcados); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <Modal titulo={`${clase.actividad?.nombre} · ${fechaCorta(clase.fecha)} ${clase.hora_inicio}`} onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <EstadoBadge estado={clase.estado} mapa={ESTADO_CLASE} />
          <span className="text-muted-foreground">{clase.duracion_min} min · {clase.profesor ? `${clase.profesor.nombre} ${clase.profesor.apellido}` : 'sin profesor'}{clase.sucursal ? ` · ${clase.sucursal.nombre}` : ''}</span>
          <span className="ml-auto flex gap-1">
            {activa && puede(permisos, 'clases', 'editar') && <button className="btn-outline btn-sm" onClick={onEditar}><Pencil className="w-4 h-4" /> Editar</button>}
            {activa && puede(permisos, 'clases', 'eliminar') && <button className="btn-outline btn-sm text-danger" onClick={cancelarClase}><Ban className="w-4 h-4" /> Cancelar</button>}
          </span>
        </div>
        {clase.notas && <p className="text-xs text-muted-foreground">{clase.notas}</p>}
        {activa && puede(permisos, 'reservas', 'crear') && (
          <div><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Agregar socio</div><BuscarSocio onElegir={agregar} /></div>
        )}
        {cargando ? <Cargando /> : error ? <ErrorBox>{error}</ErrorBox> : !lista.length ? <Vacio>Sin reservas.</Vacio> : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {lista.map(r => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                {puede(permisos, 'asistencia', 'crear') && r.estado !== 'espera' && (
                  <input type="checkbox" aria-label={`Presente: ${nombre(r.socio)}`} checked={marcados.has(r.socio_id)} onChange={() => toggle(r.socio_id)} />
                )}
                <span className="flex-1 min-w-0 truncate">{nombre(r.socio)}</span>
                <EstadoBadge estado={r.estado} mapa={ESTADO_RES} />
                {['reservada', 'espera'].includes(r.estado) && puede(permisos, 'reservas', 'eliminar') && (
                  <button className="btn-ghost btn-sm !px-2" onClick={() => cancelarRes(r)} aria-label="Cancelar reserva"><X className="w-4 h-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        {clase.estado !== 'cancelada' && puede(permisos, 'asistencia', 'crear') && lista.some(r => r.estado !== 'espera') && (
          <button className="btn-primary w-full" onClick={guardarAsistencia}>Guardar asistencia</button>
        )}
      </div>
    </Modal>
  );
}

function Asistencia() {
  const { api } = useGym();
  const [f, setF] = useState({ desde: sumarDias(hoy(), -30), hasta: hoy(), agrupar: 'diario', origen: '' });
  const { data, error, cargando } = useCarga(() => api.asistencia({ ...f, origen: f.origen || undefined }), [api, f.desde, f.hasta, f.agrupar, f.origen]);
  const serie = useMemo(() => {
    const m = new Map();
    for (const s of data?.serie || []) m.set(s.periodo, (m.get(s.periodo) || 0) + s.n);
    return [...m].map(([periodo, total]) => ({ periodo, total }));
  }, [data]);
  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Campo label="Desde" tipo="date" value={f.desde} onChange={v => setF(x => ({ ...x, desde: v }))} />
        <Campo label="Hasta" tipo="date" value={f.hasta} onChange={v => setF(x => ({ ...x, hasta: v }))} />
        <Campo label="Agrupar" tipo="select" value={f.agrupar} onChange={v => setF(x => ({ ...x, agrupar: v }))} opciones={[['diario', 'Diario'], ['semanal', 'Semanal'], ['mensual', 'Mensual']]} />
        <Campo label="Origen" tipo="select" value={f.origen} onChange={v => setF(x => ({ ...x, origen: v }))} opciones={[['', 'Todos'], ['acceso', 'Ingresos'], ['clase', 'Clases'], ['manual', 'Manual']]} />
      </div>
      {cargando ? <Cargando /> : error ? <ErrorBox>{error}</ErrorBox> : (
        <>
          <div className="card"><h3 className="font-semibold text-sm mb-2">Asistencias por período</h3><Columnas datos={serie} x="periodo" series={[{ k: 'total', l: 'Asistencias', color: '#3987e5' }]} /></div>
          <Tabla filas={data.detalle} vacio="Sin asistencias en el período." columnas={[
            { k: 'fecha', l: 'Fecha', r: a => fechaCorta(a.fecha) },
            { k: 'hora', l: 'Hora' },
            { k: 'socio', l: 'Socio', r: a => nombre(a.socio) },
            { k: 'actividad', l: 'Actividad', r: a => a.actividad?.nombre || '—' },
            { k: 'profesor', l: 'Profesor', r: a => (a.profesor ? `${a.profesor.nombre} ${a.profesor.apellido}` : '—') },
            { k: 'origen', l: 'Origen' },
          ]} />
        </>
      )}
    </div>
  );
}
