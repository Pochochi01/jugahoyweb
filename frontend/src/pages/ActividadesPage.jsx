import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { School, Trophy, GraduationCap, Clock, Users, ChevronLeft, X } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { publicService } from '../services/publicService';

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const fecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
const errMsg = (e) => e?.message || 'Ocurrió un error';
const ESTADO_TORNEO = { inscripcion: 'Inscripción abierta', zonas: 'Fase de zonas', llaves: 'Llaves', finalizado: 'Finalizado' };

/**
 * Página pública /complejo/:id/actividades — escuelas (categorías, cupos,
 * horarios, entrenadores), profesores y torneos del complejo, filtrables por
 * deporte (?deporte=tenis). Sin login: desde acá se pre‑inscribe un alumno y
 * se entra a la inscripción de cada torneo. Es el link que manda el chatbot.
 */
export default function ActividadesPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const deporte = params.get('deporte') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [inscribir, setInscribir] = useState(null);   // { escuela, categoria }

  useEffect(() => {
    setData(null); setError('');
    publicService.actividades(id, deporte ? { deporte } : {}).then(setData).catch(e => setError(errMsg(e)));
  }, [id, deporte]);

  // Los chips de deporte salen del catálogo completo (sin filtro)
  const [deportes, setDeportes] = useState([]);
  useEffect(() => { publicService.actividades(id).then(d => setDeportes(d.deportes)).catch(() => {}); }, [id]);

  const vacio = data && !data.escuelas.length && !data.profesores.length && !data.torneos.length;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Link to={`/canchas/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Turnos del complejo
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{data?.complex?.nombre || 'Complejo'}</h1>
          <p className="text-sm text-muted-foreground">Escuelas, profesores y torneos</p>
        </div>

        {deportes.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por deporte">
            {[{ value: '', label: 'Todos' }, ...deportes].map(d => (
              <button key={d.value || 'todos'} aria-pressed={deporte === d.value}
                onClick={() => setParams(d.value ? { deporte: d.value } : {})}
                className={`px-3 py-1.5 rounded-full text-sm border ${deporte === d.value ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {d.label}
              </button>
            ))}
          </div>
        )}

        {error && <div className="card text-sm text-red-400">{error}</div>}
        {!data && !error && <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" /></div>}
        {vacio && <div className="card text-center text-sm text-muted-foreground py-8">Este complejo todavía no publicó escuelas ni torneos{deporte ? ' de este deporte' : ''}.</div>}

        {data?.escuelas.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><School className="w-5 h-5 text-primary" /> Escuelas</h2>
            {data.escuelas.map(e => (
              <article key={e.id} className="card space-y-3">
                <div>
                  <h3 className="font-semibold">{e.nombre} <span className="text-xs font-normal text-muted-foreground">· {e.deporte_label}</span></h3>
                  {e.descripcion && <p className="text-sm text-muted-foreground mt-0.5">{e.descripcion}</p>}
                  {e.entrenadores.length > 0 && <p className="text-xs text-muted-foreground mt-1">Profesores: {e.entrenadores.join(', ')}</p>}
                </div>
                {e.categorias.length === 0 && <p className="text-xs text-muted-foreground">Categorías a confirmar.</p>}
                <div className="grid sm:grid-cols-2 gap-2">
                  {e.categorias.map(c => (
                    <div key={c.id} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">{c.nombre}</div>
                          <div className="text-xs text-muted-foreground">{c.edad_min} a {c.edad_max} años{c.cuota_mensual ? ` · ${money(c.cuota_mensual)}/mes` : ''}</div>
                        </div>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${c.cupos_libres ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                          {c.cupos_libres ? `${c.cupos_libres} cupos` : 'Sin cupos'}
                        </span>
                      </div>
                      {c.horarios.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {c.horarios.map((h, i) => <li key={i} className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" /> <span className="capitalize">{h.dia}</span> {h.hora_inicio}–{h.hora_fin}{h.cancha ? ` · ${h.cancha}` : ''}</li>)}
                        </ul>
                      )}
                      <button className="btn-primary text-xs w-full" onClick={() => setInscribir({ escuela: e, categoria: c })}>
                        {c.cupos_libres ? 'Pre‑inscribirme' : 'Anotarme (lista de espera)'}
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}

        {data?.torneos.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Torneos</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {data.torneos.map(t => (
                <Link key={t.id} to={`/torneos/${t.id}`} className="card hover:border-primary/50 transition-colors space-y-1">
                  <div className="font-semibold">{t.nombre} <span className="text-xs font-normal text-muted-foreground">· {t.deporte_label}</span></div>
                  <div className="text-xs text-muted-foreground">{fecha(t.fecha_inicio)} al {fecha(t.fecha_fin)} · {t.categoria}ª {t.genero}{t.precio_inscripcion ? ` · ${money(t.precio_inscripcion)}` : ''}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${t.inscripcion_abierta ? 'bg-green-500/15 text-green-300' : 'bg-muted text-foreground/70'}`}>
                      {t.estado === 'inscripcion' && !t.inscripcion_abierta ? 'Cupo completo' : ESTADO_TORNEO[t.estado]}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground"><Users className="w-3 h-3" /> {t.inscriptas}/{t.cupo_parejas} inscriptos</span>
                  </div>
                  {t.staff.length > 0 && <div className="text-[11px] text-muted-foreground">Staff: {t.staff.join(', ')}</div>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {data?.profesores.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><GraduationCap className="w-5 h-5 text-primary" /> Profesores</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {data.profesores.map(p => (
                <div key={p.id} className="card py-2.5">
                  <div className="font-medium text-sm">{p.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.deportes.length ? p.deportes.map(d => deportes.find(x => x.value === d)?.label || d).join(', ') : 'Varios deportes'}
                    {p.escuelas.length > 0 && ` · ${p.escuelas.join(', ')}`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
      {inscribir && <PreinscripcionModal complexId={id} {...inscribir} onClose={() => setInscribir(null)} />}
    </div>
  );
}

function PreinscripcionModal({ complexId, escuela, categoria, onClose }) {
  const [f, setF] = useState({ nombre: '', dni: '', fecha_nacimiento: '', genero: 'masculino', responsable_nombre: '', responsable_whatsapp: '', responsable_email: '' });
  const [estado, setEstado] = useState({});
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const edadTxt = useMemo(() => `${categoria.edad_min} a ${categoria.edad_max} años`, [categoria]);
  const enviar = async (e) => {
    e.preventDefault(); setEstado({ enviando: true });
    try {
      const r = await publicService.preinscribir(complexId, escuela.id, { ...f, categoria_id: categoria.id });
      setEstado({ ok: r.message });
    } catch (err) { setEstado({ error: errMsg(err) }); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Pre‑inscripción">
      <div className="bg-card border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1">
            <h3 className="font-semibold">Pre‑inscripción · {escuela.nombre}</h3>
            <p className="text-xs text-muted-foreground">{categoria.nombre} ({edadTxt}). El club confirma la inscripción por WhatsApp.</p>
          </div>
          <button className="p-1.5 rounded hover:bg-muted" aria-label="Cerrar" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {estado.ok ? (
          <div className="space-y-3">
            <p className="text-sm text-green-400">{estado.ok}</p>
            <button className="btn-primary text-sm w-full" onClick={onClose}>Listo</button>
          </div>
        ) : (
          <form onSubmit={enviar} className="grid sm:grid-cols-2 gap-2">
            <input className="input sm:col-span-2" placeholder="Nombre y apellido del alumno" value={f.nombre} onChange={e => set('nombre', e.target.value)} required minLength={3} />
            <label className="text-xs text-muted-foreground">Fecha de nacimiento
              <input type="date" className="input" value={f.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} required />
            </label>
            <label className="text-xs text-muted-foreground">Género
              <select className="input" value={f.genero} onChange={e => set('genero', e.target.value)}>
                <option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option>
              </select>
            </label>
            <input className="input" inputMode="numeric" placeholder="DNI del alumno (opcional)" value={f.dni} onChange={e => set('dni', e.target.value)} />
            <input className="input" placeholder="Nombre del responsable" value={f.responsable_nombre} onChange={e => set('responsable_nombre', e.target.value)} required minLength={3} />
            <input className="input" inputMode="tel" placeholder="WhatsApp (ej. 5493811234567)" value={f.responsable_whatsapp} onChange={e => set('responsable_whatsapp', e.target.value)} required />
            <input className="input" type="email" placeholder="Email (opcional)" value={f.responsable_email} onChange={e => set('responsable_email', e.target.value)} />
            {estado.error && <p className="sm:col-span-2 text-sm text-red-400">{estado.error}</p>}
            <button className="btn-primary text-sm sm:col-span-2" disabled={estado.enviando}>{estado.enviando ? 'Enviando…' : 'Enviar pre‑inscripción'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
