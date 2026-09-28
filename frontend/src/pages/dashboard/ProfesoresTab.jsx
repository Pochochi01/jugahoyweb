import { useState, useEffect, useMemo, useCallback } from 'react';
import { GraduationCap, Plus, Pencil, Trash2, Clock, CalendarDays, X, Info } from 'lucide-react';
import { profesoresAdmin } from '../../services/profesoresService';
import GrillaSemanal, { SemanaNav, inicioSemana, DIAS_SEMANA } from '../../components/profesores/GrillaSemanal';

const VACIO = { nombre: '', apellido: '', dni: '', whatsapp: '' };
const HORAS = Array.from({ length: 18 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`).concat('00:00'); // 07:00 … 00:00
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];   // lunes primero
const errMsg = (e) => e?.message || 'Ocurrió un error';

/**
 * Tab "Profesores": solo para complejos con canchas de pádel.
 * CRUD de profesores (acceso por DNI) + ventanas de cancha/horario para clases.
 */
export default function ProfesoresTab({ complexId }) {
  const svc = useMemo(() => profesoresAdmin(complexId), [complexId]);
  const [profes, setProfes] = useState(null);
  const [canchas, setCanchas] = useState([]);
  const [form, setForm] = useState(null);           // alta/edición
  const [horarios, setHorarios] = useState(null);   // profesor cuyas ventanas se editan
  const [agenda, setAgenda] = useState(null);       // profesor cuya grilla se ve
  const [error, setError] = useState('');

  const cargar = useCallback(() => svc.list().then(setProfes).catch(e => { setProfes([]); setError(errMsg(e)); }), [svc]);
  useEffect(() => { cargar(); svc.canchas().then(setCanchas).catch(() => {}); }, [cargar, svc]);

  const guardar = async (e) => {
    e.preventDefault(); setError('');
    try {
      const { id, ...d } = form;
      if (id) await svc.update(id, d); else await svc.create(d);
      setForm(null); cargar();
    } catch (err) { setError(errMsg(err)); }
  };
  const eliminar = async (p) => {
    if (!confirm(`¿Dar de baja a ${p.nombre} ${p.apellido}? Se cancelan sus clases futuras en este complejo.`)) return;
    try { await svc.remove(p.id); cargar(); } catch (err) { alert(errMsg(err)); }
  };

  if (horarios) return <VentanasEditor svc={svc} profesor={horarios} canchas={canchas} onClose={() => { setHorarios(null); cargar(); }} />;
  if (agenda) return <AgendaProfesor svc={svc} profesor={agenda} onClose={() => setAgenda(null)} />;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2 mr-auto"><GraduationCap className="w-5 h-5 text-primary" /> Profesores de pádel</h2>
        {!form && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setForm(VACIO)}><Plus className="w-4 h-4" /> Nuevo profesor</button>}
      </div>
      <div className="card text-xs text-muted-foreground flex gap-2">
        <Info className="w-4 h-4 text-primary shrink-0" />
        <span>El profesor entra en <a href="/profesor/login" className="text-primary hover:underline">/profesor/login</a> con su <strong>DNI como usuario y contraseña</strong>. Si también da clases en otro complejo, ese complejo lo da de alta por separado y al ingresar elige dónde operar.</span>
      </div>

      {form && (
        <form onSubmit={guardar} className="card grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Nombre" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
          <input className="input" placeholder="Apellido" value={form.apellido} onChange={e => set('apellido', e.target.value)} required />
          <input className="input" inputMode="numeric" placeholder="DNI (usuario y contraseña)" value={form.dni} onChange={e => set('dni', e.target.value)} required />
          <input className="input" inputMode="tel" placeholder="WhatsApp" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} />
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm">Guardar</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {profes?.length === 0 && <div className="card text-sm text-muted-foreground text-center py-8">Todavía no hay profesores.</div>}
        {profes?.map(p => (
          <div key={p.id} className="card py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{p.apellido}, {p.nombre} {!p.activo && <span className="badge-red ml-1">Inactivo</span>}</div>
              <div className="text-xs text-muted-foreground">DNI {p.dni}{p.whatsapp ? ` · ${p.whatsapp}` : ''} · {p.disponibilidad?.length || 0} franjas habilitadas</div>
            </div>
            <div className="flex flex-wrap gap-1">
              <button className="btn-outline text-xs !px-2 !py-1 flex items-center gap-1" onClick={() => setHorarios(p)}><Clock className="w-3.5 h-3.5" /> Canchas y horarios</button>
              <button className="btn-outline text-xs !px-2 !py-1 flex items-center gap-1" onClick={() => setAgenda(p)}><CalendarDays className="w-3.5 h-3.5" /> Agenda</button>
              <button className={`text-xs px-2 ${p.activo ? 'text-green-400' : 'text-red-400'}`} onClick={async () => { await svc.update(p.id, { activo: !p.activo }); cargar(); }}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </button>
              <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm({ id: p.id, nombre: p.nombre, apellido: p.apellido, dni: p.dni, whatsapp: p.whatsapp || '' })}><Pencil className="w-4 h-4" /></button>
              <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Eliminar" onClick={() => eliminar(p)}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ventanas semanales: cancha + día + desde/hasta. */
function VentanasEditor({ svc, profesor, canchas, onClose }) {
  const [ventanas, setVentanas] = useState(profesor.disponibilidad?.map(({ field_id, dia_semana, hora_desde, hora_hasta }) => ({ field_id, dia_semana, hora_desde, hora_hasta })) || []);
  const [nueva, setNueva] = useState({ field_id: canchas[0]?.id || '', dias: [1, 2, 3, 4, 5], hora_desde: '09:00', hora_hasta: '13:00' });
  const [msg, setMsg] = useState({});
  const nombreCancha = (id) => canchas.find(c => c.id === Number(id))?.nombre || `#${id}`;

  const agregar = () => {
    if (!nueva.field_id || !nueva.dias.length) return;
    setVentanas(v => [...v, ...nueva.dias.map(d => ({ field_id: Number(nueva.field_id), dia_semana: d, hora_desde: nueva.hora_desde, hora_hasta: nueva.hora_hasta }))]);
  };
  const guardar = async () => {
    setMsg({});
    try { await svc.setDisponibilidad(profesor.id, ventanas); setMsg({ ok: 'Horarios guardados.' }); } catch (e) { setMsg({ error: errMsg(e) }); }
  };
  const ordenadas = [...ventanas].map((v, i) => ({ ...v, i }))
    .sort((a, b) => ORDEN_DIAS.indexOf(a.dia_semana) - ORDEN_DIAS.indexOf(b.dia_semana) || a.hora_desde.localeCompare(b.hora_desde));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-muted" onClick={onClose} aria-label="Volver"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold">Canchas y horarios · {profesor.nombre} {profesor.apellido}</h2>
      </div>
      <p className="text-sm text-muted-foreground">Definí en qué canchas y horas puede dar clases. El profesor carga sus clases dentro de estas franjas; las reservas del complejo se respetan.</p>

      <div className="card space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select className="input !w-auto text-sm" value={nueva.field_id} onChange={e => setNueva(n => ({ ...n, field_id: e.target.value }))}>
            {canchas.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.identificador ? ` (${c.identificador})` : ''}</option>)}
          </select>
          <select className="input !w-auto text-sm" value={nueva.hora_desde} onChange={e => setNueva(n => ({ ...n, hora_desde: e.target.value }))}>
            {HORAS.slice(0, -1).map(h => <option key={h}>{h}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">a</span>
          <select className="input !w-auto text-sm" value={nueva.hora_hasta} onChange={e => setNueva(n => ({ ...n, hora_hasta: e.target.value }))}>
            {HORAS.slice(1).map(h => <option key={h}>{h}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1">
          {ORDEN_DIAS.map(d => (
            <button key={d} type="button"
              onClick={() => setNueva(n => ({ ...n, dias: n.dias.includes(d) ? n.dias.filter(x => x !== d) : [...n.dias, d] }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${nueva.dias.includes(d) ? 'bg-primary text-white' : 'bg-muted'}`}>
              {DIAS_SEMANA[d]}
            </button>
          ))}
        </div>
        <button className="btn-outline text-sm" onClick={agregar}><Plus className="w-4 h-4 inline" /> Agregar franjas</button>
      </div>

      <div className="space-y-1.5">
        {ordenadas.length === 0 && <div className="card text-sm text-muted-foreground text-center py-5">Sin franjas: el profesor no podrá cargar clases.</div>}
        {ordenadas.map(v => (
          <div key={v.i} className="card py-2 flex items-center gap-3 text-sm">
            <span className="w-10 font-medium">{DIAS_SEMANA[v.dia_semana]}</span>
            <span className="font-mono">{v.hora_desde}–{v.hora_hasta}</span>
            <span className="text-muted-foreground flex-1">{nombreCancha(v.field_id)}</span>
            <button className="p-1 text-red-400 hover:bg-red-500/10 rounded" aria-label="Quitar" onClick={() => setVentanas(vs => vs.filter((_, j) => j !== v.i))}><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-green-400">{msg.ok}</p>}
      <button className="btn-primary" onClick={guardar}>Guardar horarios</button>
    </div>
  );
}

/** Grilla del profesor vista por el admin (puede cancelar clases). */
function AgendaProfesor({ svc, profesor, onClose }) {
  const [desde, setDesde] = useState(inicioSemana());
  const [g, setG] = useState(null);
  const cargar = useCallback(() => svc.grilla(profesor.id, { desde, dias: 7 }).then(setG).catch(() => setG({ dias: [], ocupados: [], disponibles: [] })), [svc, profesor.id, desde]);
  useEffect(() => { cargar(); }, [cargar]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-muted" onClick={onClose} aria-label="Volver"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold mr-auto">Agenda · {profesor.nombre} {profesor.apellido}</h2>
        <SemanaNav desde={desde} onChange={setDesde} />
      </div>
      {g && <GrillaSemanal dias={g.dias} ocupados={g.ocupados} disponibles={g.disponibles}
        onClase={async (c) => {
          if (!confirm(`¿Cancelar la clase de ${c.alumnos.map(a => a.nombre).join(', ')} (${c.fecha} ${c.hora_inicio})?`)) return;
          try { await svc.cancelarClase(profesor.id, c.id); cargar(); } catch (e) { alert(errMsg(e)); }
        }} />}
    </div>
  );
}
