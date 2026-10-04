import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { GraduationCap, LogOut, Plus, X, Trash2, Layers, School, Trophy } from 'lucide-react';
import { profesorPanel } from '../../services/profesoresService';
import GrillaSemanal, { SemanaNav, inicioSemana } from '../../components/profesores/GrillaSemanal';
import EscuelaEntrenador from './EscuelaEntrenador';
import { escuelaProfesor } from '../../services/escuelaService';
import TelefonoEntidad from '../../components/TelefonoEntidad';
import { telefonoProfesor } from '../../services/telefonoEntidadService';

const errMsg = (e) => e?.message || 'Ocurrió un error';
const leerSesion = () => { try { return JSON.parse(localStorage.getItem('prof_session')); } catch { return null; } };
const CONSOLIDADO = 'todos';

// ── /profesor/login ───────────────────────────────────────────
export function ProfesorLogin() {
  const navigate = useNavigate();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r = await profesorPanel.login(dni, password);
      localStorage.setItem('prof_token', r.token);
      localStorage.setItem('prof_session', JSON.stringify({ profesor: r.profesor, complejos: r.complejos }));
      navigate('/profesor');
    } catch (err) { setError(errMsg(err)); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 font-bold text-lg"><GraduationCap className="w-5 h-5 text-primary" /> Profesores</div>
        <input className="input" inputMode="numeric" placeholder="DNI" autoComplete="username" value={dni} onChange={e => setDni(e.target.value)} />
        <input className="input" type="password" placeholder="Contraseña (tu DNI)" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}

// ── /profesor ─────────────────────────────────────────────────
export function ProfesorPanel() {
  const navigate = useNavigate();
  const sesion = leerSesion();
  const [complejos, setComplejos] = useState(sesion?.complejos || []);
  // Con un solo complejo entra directo; con varios, elige (o ve el consolidado)
  const [club, setClub] = useState(() => (sesion?.complejos?.length === 1 ? sesion.complejos[0].id : null));
  // Escuela: si en este complejo tiene categorías asignadas, aparece la pestaña
  const [modo, setModo] = useState('clases');          // 'clases' | 'escuela' | 'actividades' | 'whatsapp'
  const [tieneEscuela, setTieneEscuela] = useState(false);
  // Escuelas y torneos asignados (todos sus complejos)
  const [actividades, setActividades] = useState([]);
  useEffect(() => { profesorPanel.actividades().then(setActividades).catch(() => {}); }, []);
  const misActividades = actividades.filter(a => (club === CONSOLIDADO || a.club.id === club) && (a.escuelas.length || a.torneos.length));
  useEffect(() => {
    setTieneEscuela(false); setModo('clases');
    if (!club || club === CONSOLIDADO) return;
    escuelaProfesor(club).resumen().then(r => setTieneEscuela(r.categorias.length > 0)).catch(() => {});
  }, [club]);
  const [desde, setDesde] = useState(inicioSemana());
  const [g, setG] = useState(null);
  const [alta, setAlta] = useState(null);      // slot libre elegido
  const [detalle, setDetalle] = useState(null); // clase elegida

  useEffect(() => { profesorPanel.complejos().then(setComplejos).catch(() => {}); }, []);

  const cargar = useCallback(() => {
    if (!club) return;
    setG(null);
    const p = club === CONSOLIDADO ? profesorPanel.consolidado({ desde, dias: 7 }) : profesorPanel.grilla(club, { desde, dias: 7 });
    p.then(setG).catch(() => setG({ dias: [], ocupados: [], disponibles: [] }));
  }, [club, desde]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!sesion || !localStorage.getItem('prof_token')) return <Navigate to="/profesor/login" replace />;
  const salir = () => { localStorage.removeItem('prof_token'); localStorage.removeItem('prof_session'); navigate('/profesor/login'); };
  const clubActual = complejos.find(c => c.id === club);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <GraduationCap className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{sesion.profesor.nombre} {sesion.profesor.apellido}</div>
          <div className="text-xs text-muted-foreground truncate">{club === CONSOLIDADO ? 'Todos mis complejos' : clubActual?.nombre || 'Elegí un complejo'}</div>
        </div>
        {complejos.length > 1 && club && (
          <select className="input !w-auto text-sm" value={club} onChange={e => setClub(e.target.value === CONSOLIDADO ? CONSOLIDADO : Number(e.target.value))}>
            {complejos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value={CONSOLIDADO}>Todos (consolidado)</option>
          </select>
        )}
        <button className="p-2 rounded-lg hover:bg-muted text-red-400" title="Salir" onClick={salir}><LogOut className="w-5 h-5" /></button>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {!club ? (
          <div className="max-w-md mx-auto space-y-3">
            <h2 className="font-semibold">¿En qué complejo querés operar?</h2>
            {complejos.map(c => (
              <button key={c.id} onClick={() => setClub(c.id)} className="card w-full text-left hover:border-primary/50 transition-colors">
                <div className="font-medium">{c.nombre}</div>
                <div className="text-xs text-muted-foreground">{c.direccion} · {c.ciudad}</div>
              </button>
            ))}
            <button onClick={() => setClub(CONSOLIDADO)} className="card w-full text-left hover:border-primary/50 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Ver todas mis clases (todos los complejos)
            </button>
          </div>
        ) : (
          <>
            {club !== CONSOLIDADO && (
              <div className="flex flex-wrap gap-1">
                {[['clases', 'Clases'], ...(tieneEscuela ? [['escuela', 'Escuela']] : []), ...(misActividades.length ? [['actividades', 'Mis escuelas y torneos']] : []), ['whatsapp', 'Mi WhatsApp']].map(([k, l]) => (
                  <button key={k} onClick={() => setModo(k)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${modo === k ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
            )}
            {modo === 'whatsapp' && club !== CONSOLIDADO ? <TelefonoEntidad key={club} svc={telefonoProfesor(club)} quienes="alumnos" />
            : modo === 'actividades' && misActividades.length ? <MisActividades lista={misActividades} mostrarClub={club === CONSOLIDADO} />
            : modo === 'escuela' && tieneEscuela ? <EscuelaEntrenador complexId={club} /> : <>
            <div className="flex flex-wrap items-center gap-3">
              <SemanaNav desde={desde} onChange={setDesde} />
              {club !== CONSOLIDADO && g && (
                <span className="text-xs text-muted-foreground ml-auto">
                  <span className="text-primary font-semibold">{g.ocupados.length}</span> clases · <span className="text-green-400 font-semibold">{g.disponibles.length}</span> turnos libres · tocá uno libre para cargar una clase
                </span>
              )}
            </div>
            {!g ? <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" /></div>
              : <GrillaSemanal dias={g.dias} ocupados={g.ocupados} disponibles={club === CONSOLIDADO ? [] : g.disponibles}
                  mostrarClub={club === CONSOLIDADO}
                  onLibre={club === CONSOLIDADO ? undefined : setAlta}
                  onClase={setDetalle} />}
            </>}
          </>
        )}
      </main>

      {alta && <AltaClase slot={alta} libres={g?.disponibles || []} onClose={() => setAlta(null)}
        onSave={async (d) => { await profesorPanel.crearClase(club, d); setAlta(null); cargar(); }} />}
      {detalle && <DetalleClase clase={detalle} editable={club !== CONSOLIDADO} onClose={() => setDetalle(null)}
        onSave={async (alumnos) => { await profesorPanel.editarClase(club, detalle.id, { alumnos }); setDetalle(null); cargar(); }}
        onCancel={async () => { await profesorPanel.cancelarClase(club, detalle.id); setDetalle(null); cargar(); }} />}
    </div>
  );
}

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="card w-full sm:max-w-md max-h-[90vh] overflow-y-auto space-y-4 rounded-b-none sm:rounded-b-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="font-semibold">{titulo}</h3>
          <button className="p-1 rounded hover:bg-muted" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function AlumnosEditor({ alumnos, setAlumnos }) {
  const set = (i, k, v) => setAlumnos(as => as.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  return (
    <div className="space-y-2">
      {alumnos.map((a, i) => (
        <div key={i} className="flex gap-2">
          <input className="input" placeholder="Nombre del alumno" value={a.nombre} onChange={e => set(i, 'nombre', e.target.value)} />
          <input className="input" inputMode="tel" placeholder="Celular" value={a.celular} onChange={e => set(i, 'celular', e.target.value)} />
          {alumnos.length > 1 && <button type="button" className="p-2 text-red-400" aria-label="Quitar alumno" onClick={() => setAlumnos(as => as.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>}
        </div>
      ))}
      {alumnos.length < 4 && (
        <button type="button" className="text-sm text-primary flex items-center gap-1" onClick={() => setAlumnos(as => [...as, { nombre: '', celular: '' }])}>
          <Plus className="w-4 h-4" /> Otro alumno
        </button>
      )}
    </div>
  );
}

function AltaClase({ slot, libres, onSave, onClose }) {
  const [duracion, setDuracion] = useState(60);
  const [alumnos, setAlumnos] = useState([{ nombre: '', celular: '' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // 90/120 min requieren el turno siguiente libre en la misma cancha
  const siguienteLibre = libres.some(s => s.field_id === slot.field_id && s.fecha === slot.fecha && s.hora_inicio === slot.hora_fin);

  const guardar = async (e) => {
    e.preventDefault(); setError(''); setSaving(true);
    try { await onSave({ field_id: slot.field_id, fecha: slot.fecha, hora_inicio: slot.hora_inicio, duracion, alumnos }); }
    catch (err) { setError(errMsg(err)); } finally { setSaving(false); }
  };
  return (
    <Modal titulo="Nueva clase" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="text-sm">{new Date(`${slot.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · <strong>{slot.hora_inicio} hs</strong> · {slot.cancha}</div>
        <div className="flex gap-2">
          {[60, 90, 120].map(d => (
            <button key={d} type="button" disabled={d > 60 && !siguienteLibre} onClick={() => setDuracion(d)}
              className={`px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 ${duracion === d ? 'bg-primary text-white' : 'bg-muted'}`}>{d} min</button>
          ))}
        </div>
        <AlumnosEditor alumnos={alumnos} setAlumnos={setAlumnos} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Guardando…' : 'Reservar clase'}</button>
      </form>
    </Modal>
  );
}

function DetalleClase({ clase, editable, onSave, onCancel, onClose }) {
  const [alumnos, setAlumnos] = useState(clase.alumnos.map(({ nombre, celular }) => ({ nombre, celular })));
  const [error, setError] = useState('');
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(errMsg(e)); } };
  return (
    <Modal titulo="Clase" onClose={onClose}>
      <div className="text-sm space-y-0.5">
        <div>{new Date(`${clase.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · <strong>{clase.hora_inicio}–{clase.hora_fin}</strong></div>
        <div className="text-muted-foreground">{clase.cancha} · {clase.club}</div>
      </div>
      {editable ? (
        <>
          <AlumnosEditor alumnos={alumnos} setAlumnos={setAlumnos} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => run(() => onSave(alumnos))}>Guardar alumnos</button>
            <button className="btn-outline text-red-400 flex items-center gap-1"
              onClick={() => confirm('¿Cancelar esta clase? La cancha queda libre.') && run(onCancel)}>
              <Trash2 className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </>
      ) : (
        <ul className="text-sm space-y-1">
          {clase.alumnos.map(a => <li key={a.id}>{a.nombre} · <a className="text-primary" href={`https://wa.me/${a.celular}`} target="_blank" rel="noreferrer">{a.celular}</a></li>)}
          <li className="text-xs text-muted-foreground pt-2">Para editarla, elegí ese complejo arriba.</li>
        </ul>
      )}
    </Modal>
  );
}

/** Escuelas (categorías + horarios) y torneos asignados al profesor. */
function MisActividades({ lista, mostrarClub }) {
  const fecha = (x) => (x ? `${x.slice(8, 10)}/${x.slice(5, 7)}` : '');
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {lista.map(a => (
        <div key={a.club.id} className="card space-y-3">
          {mostrarClub && <div className="text-sm font-semibold">{a.club.nombre}</div>}
          {a.escuelas.map(e => (
            <div key={e.id}>
              <div className="flex items-center gap-1.5 font-medium text-sm"><School className="w-4 h-4 text-primary" /> {e.nombre} <span className="text-xs text-muted-foreground font-normal">· {e.deporte_label}</span></div>
              {e.categorias.length ? e.categorias.map(c => (
                <div key={c.id} className="text-xs text-muted-foreground pl-6 mt-0.5">
                  <span className="text-foreground">{c.nombre}:</span> {c.horarios.length ? c.horarios.map(h => `${h.dia} ${h.hora_inicio}–${h.hora_fin}${h.cancha ? ` (${h.cancha})` : ''}`).join(' · ') : 'sin horarios'}
                </div>
              )) : <div className="text-xs text-muted-foreground pl-6">Sin categorías asignadas.</div>}
            </div>
          ))}
          {a.torneos.map(t => (
            <div key={t.id} className="flex items-center gap-1.5 text-sm">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" /> <span className="font-medium">{t.nombre}</span>
              <span className="text-xs text-muted-foreground">{t.rol ? `${t.rol} · ` : ''}{fecha(t.fecha_inicio)} al {fecha(t.fecha_fin)} · {t.estado}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
