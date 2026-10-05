import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Wallet, CalendarDays, Megaphone, Layers, UserCog, Settings, Search, Plus, Pencil, Trash2,
  MessageCircle, Link2, Goal, School, CheckCircle, Smartphone, Send,
} from 'lucide-react';
import { escuelaAdmin, escuelasAdmin } from '../../services/escuelaService';
import { telefonoEscuela } from '../../services/telefonoEntidadService';
import TelefonoEntidad from '../../components/TelefonoEntidad';
import MensajesPadres from '../../components/escuela/MensajesPadres';
import { profesoresAdmin } from '../../services/profesoresService';
import { copiarTexto, periodoLabel } from '../../utils/escuelaWhatsapp';
import {
  WhatsAppAlumno, EnvioMasivo, HorariosEditor, AvisoForm, PAGO_BADGE, money, errMsg, hoyISO,
} from '../../components/escuela/EscuelaShared';

const edadDe = (f) => {
  if (!f) return null;
  const [y, m, d] = f.split('-').map(Number); const [hy, hm, hd] = hoyISO().split('-').map(Number);
  return hy - y - ((hm < m || (hm === m && hd < d)) ? 1 : 0);
};

const DEPORTES = [
  ['futbol', 'Fútbol'], ['padel', 'Pádel'], ['tenis', 'Tenis'], ['basquet', 'Básquet'], ['voley', 'Vóley'], ['squash', 'Squash'], ['otro', 'Otro'],
];
const deporteLabel = (d) => DEPORTES.find(x => x[0] === d)?.[1] || d;
const claveEscuela = (cid) => `escuela_activa_${cid}`;
const leerEscuela = (cid) => { try { return Number(localStorage.getItem(claveEscuela(cid))) || null; } catch { return null; } };
const guardarEscuela = (cid, id) => { try { localStorage.setItem(claveEscuela(cid), String(id)); } catch { /* sin storage */ } };

/**
 * Escuelas del complejo (panel admin / colaborador con permiso 'escuela').
 * Un complejo puede tener varias escuelas (fútbol, tenis…): se elige una
 * arriba y todas las vistas trabajan sobre ella; cada escuela usa solo las
 * canchas de su deporte.
 */
export default function EscuelaTab({ complexId }) {
  const [escuelas, setEscuelas] = useState(null);
  const [escuelaId, setEscuelaId] = useState(() => leerEscuela(complexId));
  const recargarEscuelas = useCallback(() => escuelasAdmin(complexId).list().then(setEscuelas).catch(() => setEscuelas([])), [complexId]);
  useEffect(() => { recargarEscuelas(); }, [recargarEscuelas]);
  // Escuela activa válida: la guardada si sigue existiendo, si no la primera
  const actual = escuelas?.find(e => e.id === escuelaId) || escuelas?.[0] || null;
  const elegir = (id) => { setEscuelaId(id); guardarEscuela(complexId, id); };

  const [toast, setToast] = useState(null);
  const avisar = (tipo, msg) => { setToast({ tipo, msg }); setTimeout(() => setToast(null), 3500); };

  if (!escuelas) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2 mr-2"><Goal className="w-5 h-5 text-primary" /> Escuelas</h2>
        {escuelas.map(e => (
          <button key={e.id} onClick={() => elegir(e.id)} aria-pressed={actual?.id === e.id}
            className={`px-3 py-1.5 rounded-full text-sm border ${actual?.id === e.id ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {e.nombre} <span className="text-[11px] opacity-70">· {deporteLabel(e.deporte)}{e.estado === 'inactiva' ? ' · inactiva' : ''}</span>
          </button>
        ))}
      </div>
      {actual
        ? <EscuelaPanel key={actual.id} complexId={complexId} escuela={actual} escuelas={escuelas} recargarEscuelas={recargarEscuelas} elegir={elegir} avisar={avisar} />
        : <Escuelas complexId={complexId} escuelas={escuelas} recargarEscuelas={recargarEscuelas} elegir={elegir} avisar={avisar} />}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-foreground ${toast.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── Alta / edición / baja de escuelas ─────────────────────────
function Escuelas({ complexId, escuelas, recargarEscuelas, elegir, avisar }) {
  const svc = useMemo(() => escuelasAdmin(complexId), [complexId]);
  const [form, setForm] = useState(null);
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault();
    try {
      const d = { nombre: form.nombre, deporte: form.deporte, descripcion: form.descripcion, estado: form.estado };
      const r = form.id ? await svc.update(form.id, d) : await svc.create(d);
      setForm(null); await recargarEscuelas(); if (!form.id) elegir(r.id);
      avisar('ok', form.id ? 'Escuela actualizada.' : 'Escuela creada: cargá sus categorías.');
    } catch (err) { avisar('err', errMsg(err)); }
  };
  const borrar = async (x) => {
    if (!confirm(`¿Eliminar ${x.nombre}? Si tiene alumnos queda inactiva.`)) return;
    try { const r = await svc.remove(x.id); avisar('ok', r.message || 'Escuela eliminada.'); recargarEscuelas(); } catch (err) { avisar('err', errMsg(err)); }
  };
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-xs text-muted-foreground">Cada escuela tiene su deporte, categorías, alumnos, horarios, cuotas y entrenadores. Usa solo las canchas de su deporte.</p>
      {!escuelas.length && !form && <div className="card text-center text-sm text-muted-foreground py-6">Todavía no hay escuelas. Creá la primera (ej. "Escuela de fútbol", "Escuela de tenis").</div>}
      {!form && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setForm({ nombre: '', deporte: 'futbol', descripcion: '', estado: 'activa' })}><Plus className="w-4 h-4" /> Escuela</button>}
      {form && (
        <form onSubmit={guardar} className="card grid sm:grid-cols-2 gap-2">
          <input className="input" placeholder="Nombre (ej. Escuela de tenis)" value={form.nombre} onChange={e => set('nombre', e.target.value)} required minLength={3} />
          <select className="input" value={form.deporte} onChange={e => set('deporte', e.target.value)} aria-label="Deporte">
            {DEPORTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <textarea className="input sm:col-span-2" rows={2} placeholder="Descripción (se muestra en la web)" value={form.descripcion || ''} onChange={e => set('descripcion', e.target.value)} />
          {form.id && (
            <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)} aria-label="Estado">
              <option value="activa">Activa</option><option value="inactiva">Inactiva (no se muestra)</option>
            </select>
          )}
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm">{form.id ? 'Guardar' : 'Crear escuela'}</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {escuelas.map(x => (
        <div key={x.id} className="card py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate flex items-center gap-1.5"><School className="w-4 h-4 text-primary shrink-0" /> {x.nombre}
              {x.estado === 'inactiva' && <span className="badge-red ml-1">Inactiva</span>}</div>
            <div className="text-xs text-muted-foreground">{deporteLabel(x.deporte)} · {x.categorias} categorías · {x.alumnos} alumnos{x.pendientes ? ` · ${x.pendientes} pre‑inscriptos` : ''} · {x.profesores} profesores</div>
          </div>
          <div className="flex gap-1">
            <button className="btn-outline text-xs" onClick={() => elegir(x.id)}>Abrir</button>
            <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm({ ...x })}><Pencil className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Eliminar" onClick={() => borrar(x)}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EscuelaPanel({ complexId, escuela, escuelas, recargarEscuelas, elegir, avisar }) {
  const svc = useMemo(() => escuelaAdmin(complexId, escuela.id), [complexId, escuela.id]);
  const telefonoWa = useMemo(() => telefonoEscuela(complexId, escuela.id), [complexId, escuela.id]);
  const [vista, setVista] = useState('alumnos');
  const [categorias, setCategorias] = useState([]);
  const [canchas, setCanchas] = useState([]);

  const recargarCategorias = useCallback(() => svc.categorias().then(setCategorias).catch(() => {}), [svc]);
  useEffect(() => { recargarCategorias(); svc.canchas().then(setCanchas).catch(() => {}); }, [svc, recargarCategorias]);

  const VISTAS = [
    ['alumnos', 'Alumnos', Users], ['cuotas', 'Cuotas', Wallet], ['horarios', 'Horarios', CalendarDays],
    ['avisos', 'Avisos', Megaphone], ['categorias', 'Categorías', Layers], ['entrenadores', 'Entrenadores', UserCog],
    ['mensajes', 'Mensajes a padres', Send], ['whatsapp', 'WhatsApp', Smartphone], ['config', 'Configuración', Settings], ['escuelas', 'Escuelas', School],
  ];
  const ctx = { svc, complexId, escuela, categorias, canchas: canchas.filter(c => c.activa !== false), recargarCategorias, recargarEscuelas, avisar };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {VISTAS.map(([k, l, Icon]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${vista === k ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>
      {vista === 'alumnos'      && <Alumnos {...ctx} />}
      {vista === 'cuotas'       && <Cuotas {...ctx} />}
      {vista === 'horarios'     && <Horarios {...ctx} />}
      {vista === 'avisos'       && <Avisos {...ctx} />}
      {vista === 'categorias'   && <Categorias {...ctx} />}
      {vista === 'entrenadores' && <Entrenadores {...ctx} />}
      {vista === 'mensajes'     && <MensajesPadres svc={svc} categorias={categorias} irA={setVista} />}
      {vista === 'whatsapp'     && <TelefonoEntidad svc={telefonoWa} quienes="alumnos (responsables)" categorias={categorias} />}
      {vista === 'config'       && <Config {...ctx} />}
      {vista === 'escuelas'     && <Escuelas complexId={complexId} escuelas={escuelas} recargarEscuelas={recargarEscuelas} elegir={elegir} avisar={avisar} />}
    </div>
  );
}

// ── Alumnos ───────────────────────────────────────────────────
function Alumnos({ svc, categorias, avisar }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [form, setForm] = useState(null);
  const [wa, setWa] = useState(null);
  const cargar = useCallback(() => svc.alumnos({ q: q.trim() || undefined, categoria_id: cat || undefined }).then(setRows).catch(() => setRows([])), [svc, q, cat]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  const guardar = async (d) => {
    if (form.id) await svc.editarAlumno(form.id, d); else await svc.crearAlumno(d);
    setForm(null); cargar(); avisar('ok', 'Alumno guardado.');
  };
  const borrar = async (a) => {
    if (!confirm(`¿Dar de baja a ${a.nombre}?`)) return;
    try { const r = await svc.borrarAlumno(a.id); avisar('ok', r.message || 'Eliminado.'); cargar(); } catch (e) { avisar('err', errMsg(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-9" placeholder="Buscar por alumno, responsable, DNI o WhatsApp…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto text-sm" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button className="btn-primary text-sm flex items-center gap-1" disabled={!categorias.length} onClick={() => setForm({})}><Plus className="w-4 h-4" /> Alumno</button>
      </div>
      {!categorias.length && <p className="text-xs text-amber-400">Primero creá las categorías (ej. Sub-8, Sub-10).</p>}
      {form && <AlumnoForm inicial={form} categorias={categorias} onSave={guardar} onCancel={() => setForm(null)} />}
      {rows?.length === 0 && <div className="card text-center text-sm text-muted-foreground py-8">Sin alumnos.</div>}
      <div className="space-y-1.5">
        {rows?.map(a => {
          const b = PAGO_BADGE[a.pago_estado];
          return (
            <div key={a.id} className="card py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.nombre} {a.estado === 'inactivo' && <span className="badge-red ml-1">Inactivo</span>}
                  {a.estado === 'pendiente' && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Pre‑inscripción web</span>}</div>
                <div className="text-xs text-muted-foreground truncate">{a.categoria?.nombre} · {a.edad} años · {a.responsable_nombre} ({a.responsable_whatsapp})</div>
              </div>
              <span className={b.cls} title={`Cuota ${a.periodo}`}>{b.label}</span>
              <div className="flex gap-1">
                {a.estado === 'pendiente' && (
                  <button className="p-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25" aria-label="Confirmar inscripción" title="Confirmar inscripción (ocupa cupo)"
                    onClick={async () => { try { await svc.editarAlumno(a.id, { estado: 'activo' }); avisar('ok', `${a.nombre} quedó inscripto.`); cargar(); } catch (e) { avisar('err', errMsg(e)); } }}>
                    <CheckCircle className="w-4 h-4" /></button>
                )}
                <button className="p-1.5 rounded bg-green-700 text-white hover:bg-green-800" aria-label="WhatsApp" onClick={() => setWa(a)}><MessageCircle className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted" aria-label="Copiar link del portal" title="Copiar link del portal del alumno"
                  onClick={async () => { if (await copiarTexto(a.portal_url)) avisar('ok', 'Link del portal copiado.'); }}><Link2 className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm(a)}><Pencil className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Baja" onClick={() => borrar(a)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {wa && <WhatsAppAlumno alumno={wa} cargarContexto={() => svc.contexto(wa.id)} onClose={() => setWa(null)} />}
    </div>
  );
}

function AlumnoForm({ inicial, categorias, onSave, onCancel }) {
  const [f, setF] = useState({ nombre: '', dni: '', fecha_nacimiento: '', genero: 'masculino', categoria_id: '', responsable_nombre: '', responsable_whatsapp: '', responsable_email: '', estado: 'activo', ...inicial });
  const [error, setError] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const edad = edadDe(f.fecha_nacimiento);
  const sugeridas = edad == null ? categorias : categorias.filter(c => edad >= c.edad_min && edad <= c.edad_max);
  // Al cargar la fecha de nacimiento, proponer la categoría que corresponde
  useEffect(() => { if (!f.id && sugeridas.length === 1) set('categoria_id', sugeridas[0].id); }, [f.fecha_nacimiento]);   // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault(); setError('');
    const { nombre, dni, fecha_nacimiento, genero, categoria_id, responsable_nombre, responsable_whatsapp, responsable_email, estado } = f;
    try { await onSave({ nombre, dni, fecha_nacimiento, genero, categoria_id, responsable_nombre, responsable_whatsapp, responsable_email, estado }); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-2">
      <input className="input" placeholder="Nombre y apellido del alumno" value={f.nombre} onChange={e => set('nombre', e.target.value)} required />
      <input className="input" inputMode="numeric" placeholder="DNI (opcional)" value={f.dni || ''} onChange={e => set('dni', e.target.value)} />
      <label className="text-xs text-muted-foreground">Fecha de nacimiento {edad != null && `· ${edad} años`}
        <input type="date" className="input" value={f.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} required />
      </label>
      <label className="text-xs text-muted-foreground">Género
        <select className="input" value={f.genero} onChange={e => set('genero', e.target.value)}>
          <option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground sm:col-span-2">Categoría
        <select className="input" value={f.categoria_id} onChange={e => set('categoria_id', Number(e.target.value))} required>
          <option value="">Elegí…</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id} disabled={edad != null && !sugeridas.includes(c)}>
              {c.nombre} ({c.edad_min}–{c.edad_max} años · {c.inscriptos}/{c.cupos})
            </option>
          ))}
        </select>
      </label>
      <input className="input" placeholder="Padre / madre / responsable" value={f.responsable_nombre} onChange={e => set('responsable_nombre', e.target.value)} required />
      <input className="input" inputMode="tel" placeholder="WhatsApp del responsable (5493811234567)" value={f.responsable_whatsapp} onChange={e => set('responsable_whatsapp', e.target.value)} required />
      <input className="input" type="email" placeholder="Email del responsable (opcional)" value={f.responsable_email || ''} onChange={e => set('responsable_email', e.target.value)} />
      {f.id && (
        <select className="input" value={f.estado} onChange={e => set('estado', e.target.value)}>
          <option value="activo">Activo</option><option value="pendiente">Pre‑inscripto (sin cupo)</option><option value="inactivo">Inactivo</option>
        </select>
      )}
      {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn-primary text-sm">Guardar</button>
        <button type="button" className="btn-outline text-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

// ── Cuotas ────────────────────────────────────────────────────
function Cuotas({ svc, categorias, avisar }) {
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [cat, setCat] = useState('');
  const [data, setData] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [wa, setWa] = useState(null);           // { alumno, tipo }
  const [masivo, setMasivo] = useState(null);   // { titulo, alumnos, tipo }

  const cargar = useCallback(() => {
    svc.pagos({ periodo, categoria_id: cat || undefined }).then(setData).catch(() => setData({ pagos: [], cobrado: 0, pendiente: 0 }));
    svc.alumnos({ periodo, categoria_id: cat || undefined, estado: 'activo' }).then(setAlumnos).catch(() => setAlumnos([]));
  }, [svc, periodo, cat]);
  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    try { const r = await svc.generarCuotas(periodo); avisar('ok', `${r.creadas} cuotas nuevas de ${periodoLabel(periodo)}.`); cargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const cobrar = async (p, metodo) => {
    try {
      await svc.pagar(p.id, metodo);
      cargar();
      // Ofrecer el comprobante por WhatsApp apenas se cobra
      setWa({ alumno: p.alumno, tipo: 'comprobante' });
    } catch (e) { avisar('err', errMsg(e)); }
  };
  const anular = async (p) => {
    if (!confirm(`¿Anular el pago ${p.comprobante}? Vuelve a pendiente (y sale de caja si está abierta).`)) return;
    try { await svc.anular(p.id); cargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const pendientes = alumnos.filter(a => a.pago_estado === 'pendiente');
  const sinRegistro = alumnos.filter(a => a.pago_estado === 'sin_registro');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="month" className="input !w-auto text-sm" value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período" />
        <select className="input !w-auto text-sm" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button className="btn-primary text-sm" onClick={generar}>Generar cuotas de {periodoLabel(periodo)}</button>
      </div>
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="card py-3"><div className="text-lg font-bold text-green-400">{money(data.cobrado)}</div><div className="text-xs text-muted-foreground">Cobrado</div></div>
          <div className="card py-3"><div className="text-lg font-bold text-amber-400">{money(data.pendiente)}</div><div className="text-xs text-muted-foreground">Pendiente</div></div>
          <button className="card py-3 text-left hover:border-amber-500/50 disabled:opacity-50" disabled={!pendientes.length}
            onClick={() => setMasivo({ titulo: `Recordar cuota ${periodoLabel(periodo)}`, alumnos: pendientes, tipo: 'recordatorio' })}>
            <div className="text-lg font-bold">{pendientes.length}</div><div className="text-xs text-muted-foreground">Pendientes · recordar por WhatsApp</div>
          </button>
          <button className="card py-3 text-left hover:border-red-500/50 disabled:opacity-50" disabled={!sinRegistro.length}
            onClick={() => setMasivo({ titulo: `Sin pago registrado · ${periodoLabel(periodo)}`, alumnos: sinRegistro, tipo: 'sin_registro' })}>
            <div className="text-lg font-bold">{sinRegistro.length}</div><div className="text-xs text-muted-foreground">Sin registro · avisar por WhatsApp</div>
          </button>
        </div>
      )}
      <div className="space-y-1.5">
        {data?.pagos.length === 0 && <div className="card text-center text-sm text-muted-foreground py-8">No hay cuotas de este período: generalas con el botón de arriba.</div>}
        {data?.pagos.map(p => (
          <div key={p.id} className="card py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.alumno.nombre}</div>
              <div className="text-xs text-muted-foreground">{p.alumno.categoria?.nombre} · {money(p.monto)}{p.comprobante && ` · ${p.comprobante} (${p.fecha_pago})`}</div>
            </div>
            <span className={PAGO_BADGE[p.estado].cls}>{PAGO_BADGE[p.estado].label}</span>
            <div className="flex gap-1 flex-wrap">
              {p.estado === 'pendiente' ? <>
                <button className="btn-outline text-xs !px-2 !py-1" onClick={() => cobrar(p, 'efectivo')}>Efectivo</button>
                <button className="btn-outline text-xs !px-2 !py-1" onClick={() => cobrar(p, 'transferencia')}>Transferencia</button>
                <button className="p-1.5 rounded bg-green-700 text-white" aria-label="Recordatorio por WhatsApp" onClick={() => setWa({ alumno: p.alumno, tipo: 'recordatorio' })}><MessageCircle className="w-4 h-4" /></button>
              </> : <>
                <button className="p-1.5 rounded bg-green-700 text-white" aria-label="Comprobante por WhatsApp" onClick={() => setWa({ alumno: p.alumno, tipo: 'comprobante' })}><MessageCircle className="w-4 h-4" /></button>
                <button className="text-xs text-red-400 hover:underline px-1" onClick={() => anular(p)}>Anular</button>
              </>}
            </div>
          </div>
        ))}
      </div>
      {wa && <WhatsAppAlumno alumno={wa.alumno} tipoInicial={wa.tipo} cargarContexto={() => svc.contexto(wa.alumno.id, { periodo })} onClose={() => setWa(null)} />}
      {masivo && <EnvioMasivo titulo={masivo.titulo} alumnos={masivo.alumnos} tipo={masivo.tipo}
        cargarContexto={(id) => svc.contexto(id, { periodo })} onClose={() => setMasivo(null)} />}
    </div>
  );
}

// ── Horarios ──────────────────────────────────────────────────
function Horarios({ svc, escuela, categorias, canchas }) {
  const [horarios, setHorarios] = useState([]);
  const cargar = useCallback(() => svc.horarios().then(setHorarios).catch(() => {}), [svc]);
  useEffect(() => { cargar(); }, [cargar]);
  const conRecarga = (fn) => async (...a) => { const r = await fn(...a); cargar(); return r; };
  return (
    <div className="space-y-2 max-w-3xl">
      <p className="text-xs text-muted-foreground">Solo canchas de {deporteLabel(escuela.deporte).toLowerCase()}. Cada horario reserva la cancha en la agenda todas las semanas (turno fijo "Escuela · categoría").</p>
      <HorariosEditor horarios={horarios} categorias={categorias} canchas={canchas}
        onCrear={conRecarga(svc.crearHorario)} onEditar={conRecarga(svc.editarHorario)} onBorrar={conRecarga(svc.borrarHorario)} />
    </div>
  );
}

// ── Avisos ────────────────────────────────────────────────────
function Avisos({ svc, categorias, avisar }) {
  const [avisos, setAvisos] = useState([]);
  const [nuevo, setNuevo] = useState(false);
  const [masivo, setMasivo] = useState(null);
  const cargar = useCallback(() => svc.avisos().then(setAvisos).catch(() => {}), [svc]);
  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async (av) => {
    const alumnos = await svc.alumnos({ categoria_id: av.categoria_id || undefined, estado: 'activo' });
    const cuando = av.fecha === hoyISO() ? 'hoy' : `el ${new Date(`${av.fecha}T12:00:00`).toLocaleDateString('es-AR')}`;
    const quien = av.categoria?.nombre || 'todas las categorías';
    const textoGrupo = av.estado === 'suspendida'
      ? `⚠️ Se suspende el entrenamiento de ${quien} ${cuando}.${av.mensaje ? ` ${av.mensaje}` : ''}`
      : `✅ ${cuando[0].toUpperCase() + cuando.slice(1)} la actividad de ${quien} es normal.${av.mensaje ? ` ${av.mensaje}` : ''}`;
    setMasivo({ titulo: `Aviso a padres · ${quien}`, alumnos, aviso: av, textoGrupo });
  };

  return (
    <div className="space-y-3 max-w-3xl">
      {!nuevo && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setNuevo(true)}><Plus className="w-4 h-4" /> Aviso de actividad</button>}
      {nuevo && <AvisoForm categorias={categorias} onCancel={() => setNuevo(false)}
        onGuardar={async (d) => { const av = await svc.crearAviso(d); setNuevo(false); cargar(); avisar('ok', 'Aviso publicado en el portal.'); enviar({ ...av, categoria: categorias.find(c => c.id === av.categoria_id) }); }} />}
      {avisos.length === 0 && <div className="card text-center text-sm text-muted-foreground py-6">Sin avisos próximos.</div>}
      {avisos.map(a => (
        <div key={a.id} className="card py-2.5 flex items-center gap-3 text-sm">
          <span className={a.estado === 'suspendida' ? 'badge-red' : 'badge-green'}>{a.estado === 'suspendida' ? 'Suspendida' : 'Normal'}</span>
          <div className="flex-1 min-w-0">
            <div>{new Date(`${a.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · {a.categoria?.nombre || 'Toda la escuela'}</div>
            {a.mensaje && <div className="text-xs text-muted-foreground truncate">{a.mensaje}{a.autor && ` — ${a.autor}`}</div>}
          </div>
          <button className="btn-outline text-xs !px-2 !py-1 flex items-center gap-1" onClick={() => enviar(a)}><MessageCircle className="w-3.5 h-3.5" /> Avisar a padres</button>
          <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Borrar" onClick={async () => { await svc.borrarAviso(a.id); cargar(); }}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {masivo && <EnvioMasivo titulo={masivo.titulo} alumnos={masivo.alumnos} tipo="actividad" aviso={masivo.aviso} textoGrupo={masivo.textoGrupo}
        cargarContexto={(id) => svc.contexto(id)} onClose={() => setMasivo(null)} />}
    </div>
  );
}

// ── Categorías ────────────────────────────────────────────────
function Categorias({ svc, categorias, recargarCategorias, avisar }) {
  const [form, setForm] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault();
    try {
      const { id, nombre, edad_min, edad_max, cupos, cuota_mensual } = form;
      const d = { nombre, edad_min, edad_max, cupos, cuota_mensual };
      if (id) await svc.editarCategoria(id, d); else await svc.crearCategoria(d);
      setForm(null); recargarCategorias(); avisar('ok', 'Categoría guardada.');
    } catch (err) { avisar('err', errMsg(err)); }
  };
  return (
    <div className="space-y-3 max-w-3xl">
      {!form && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setForm({ nombre: '', edad_min: '', edad_max: '', cupos: 20, cuota_mensual: '' })}><Plus className="w-4 h-4" /> Categoría</button>}
      {form && (
        <form onSubmit={guardar} className="card grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <label className="text-xs text-muted-foreground col-span-2 sm:col-span-1">Nombre<input className="input" placeholder="Sub-10" value={form.nombre} onChange={e => set('nombre', e.target.value)} required /></label>
          <label className="text-xs text-muted-foreground">Edad desde<input type="number" min="3" max="21" className="input" value={form.edad_min} onChange={e => set('edad_min', e.target.value)} required /></label>
          <label className="text-xs text-muted-foreground">Edad hasta<input type="number" min="3" max="21" className="input" value={form.edad_max} onChange={e => set('edad_max', e.target.value)} required /></label>
          <label className="text-xs text-muted-foreground">Cupos<input type="number" min="1" className="input" value={form.cupos} onChange={e => set('cupos', e.target.value)} required /></label>
          <label className="text-xs text-muted-foreground">Cuota mensual<input type="number" min="0" className="input" value={form.cuota_mensual} onChange={e => set('cuota_mensual', e.target.value)} /></label>
          <div className="col-span-2 sm:col-span-5 flex gap-2">
            <button className="btn-primary text-sm">Guardar</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {categorias.length === 0 && <div className="card text-center text-sm text-muted-foreground py-6">Sin categorías.</div>}
      {categorias.map(c => (
        <div key={c.id} className="card py-2.5 flex items-center gap-3 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{c.nombre} <span className="text-xs text-muted-foreground">· {c.edad_min} a {c.edad_max} años</span></div>
            <div className="text-xs text-muted-foreground">{c.inscriptos}/{c.cupos} inscriptos · cuota {money(c.cuota_mensual)}{c.profesores?.length ? ` · ${c.profesores.map(p => `${p.nombre} ${p.apellido}`).join(', ')}` : ''}</div>
          </div>
          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
            <div className={`h-full ${c.inscriptos >= c.cupos ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (c.inscriptos / c.cupos) * 100)}%` }} />
          </div>
          <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm(c)}><Pencil className="w-4 h-4" /></button>
          <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Borrar"
            onClick={async () => { if (confirm(`¿Borrar ${c.nombre}?`)) { try { await svc.borrarCategoria(c.id); recargarCategorias(); } catch (e) { avisar('err', errMsg(e)); } } }}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Entrenadores (profesores con login DNI ↔ categorías) ──────
function Entrenadores({ svc, complexId, escuela, categorias, recargarCategorias, avisar }) {
  const profs = useMemo(() => profesoresAdmin(complexId), [complexId]);
  const [rows, setRows] = useState(null);
  const [nuevo, setNuevo] = useState(null);
  const cargar = useCallback(() => svc.entrenadores().then(setRows).catch(() => setRows([])), [svc]);
  useEffect(() => { cargar(); }, [cargar]);

  const toggle = async (p, catId) => {
    const actuales = p.categoriasEscuela.map(c => c.id);
    const ids = actuales.includes(catId) ? actuales.filter(x => x !== catId) : [...actuales, catId];
    try { await svc.asignarCategorias(p.id, ids); cargar(); recargarCategorias(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const crear = async (e) => {
    e.preventDefault();
    try { await profs.create({ ...nuevo, deportes: [escuela.deporte] }); setNuevo(null); cargar(); avisar('ok', 'Entrenador creado: entra con su DNI como usuario y contraseña.'); }
    catch (err) { avisar('err', errMsg(err)); }
  };
  const set = (k, v) => setNuevo(x => ({ ...x, [k]: v }));

  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-xs text-muted-foreground">
        Los entrenadores son los profesores del complejo: ingresan en <a href="/profesor/login" className="text-primary hover:underline">/profesor/login</a> con su DNI (usuario y contraseña) y ven solo las categorías que les asignes.
      </p>
      {!nuevo && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setNuevo({ nombre: '', apellido: '', dni: '', whatsapp: '' })}><Plus className="w-4 h-4" /> Entrenador</button>}
      {nuevo && (
        <form onSubmit={crear} className="card grid sm:grid-cols-2 gap-2">
          <input className="input" placeholder="Nombre" value={nuevo.nombre} onChange={e => set('nombre', e.target.value)} required />
          <input className="input" placeholder="Apellido" value={nuevo.apellido} onChange={e => set('apellido', e.target.value)} required />
          <input className="input" inputMode="numeric" placeholder="DNI (usuario y contraseña)" value={nuevo.dni} onChange={e => set('dni', e.target.value)} required />
          <input className="input" inputMode="tel" placeholder="WhatsApp" value={nuevo.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm">Crear</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {rows?.length === 0 && <div className="card text-center text-sm text-muted-foreground py-6">Sin entrenadores.</div>}
      {rows?.map(p => (
        <div key={p.id} className="card py-2.5 space-y-2">
          <div className="text-sm"><span className="font-medium">{p.apellido}, {p.nombre}</span> <span className="text-xs text-muted-foreground">· DNI {p.dni}{!p.activo && ' · inactivo'}</span>
            {p.asignado && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">En esta escuela</span>}
            {!p.deporte_ok && <span className="ml-1 text-[11px] text-amber-400">· no tiene cargado {deporteLabel(escuela.deporte)} (Profesores → editar)</span>}</div>
          <div className="flex flex-wrap gap-1.5">
            {categorias.map(c => {
              const on = p.categoriasEscuela.some(x => x.id === c.id);
              return (
                <button key={c.id} onClick={() => toggle(p, c.id)} aria-pressed={on}
                  className={`px-2.5 py-1 rounded-full text-xs ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{c.nombre}</button>
              );
            })}
            {!categorias.length && <span className="text-xs text-muted-foreground">Creá categorías para asignarlas.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Configuración ─────────────────────────────────────────────
function Config({ svc, escuela, recargarEscuelas, avisar }) {
  const [f, setF] = useState(null);
  useEffect(() => { svc.config().then(setF).catch(() => {}); }, [svc]);
  if (!f) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <form className="card space-y-3 max-w-lg" onSubmit={async (e) => {
      e.preventDefault();
      try { setF(await svc.guardarConfig({ nombre: f.nombre, descripcion: f.descripcion, whatsapp_oficial: f.whatsapp_oficial, dia_vencimiento: f.dia_vencimiento })); recargarEscuelas(); avisar('ok', 'Configuración guardada.'); }
      catch (err) { avisar('err', errMsg(err)); }
    }}>
      <label className="block text-xs text-muted-foreground">Nombre de la escuela
        <input className="input" placeholder="Escuela de fútbol …" value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} />
        <span className="text-[11px]">Deporte: {deporteLabel(escuela.deporte)} (se cambia en Escuelas → editar).</span>
      </label>
      <label className="block text-xs text-muted-foreground">Descripción (web pública)
        <textarea className="input" rows={2} value={f.descripcion || ''} onChange={e => set('descripcion', e.target.value)} />
      </label>
      <label className="block text-xs text-muted-foreground">WhatsApp oficial de la escuela
        <input className="input" inputMode="tel" placeholder="5493811234567" value={f.whatsapp_oficial || ''} onChange={e => set('whatsapp_oficial', e.target.value)} />
        <span className="text-[11px]">Es el número desde el que se envían los mensajes (abrí WhatsApp con esa cuenta en el dispositivo) y al que escriben los padres desde su portal.</span>
      </label>
      <label className="block text-xs text-muted-foreground">Día de vencimiento de la cuota
        <input type="number" min="1" max="28" className="input !w-24" value={f.dia_vencimiento} onChange={e => set('dia_vencimiento', e.target.value)} />
      </label>
      <button className="btn-primary text-sm">Guardar</button>
    </form>
  );
}
