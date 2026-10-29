import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Save, Eye, Copy, Trash2, Pencil, AlertTriangle, BookmarkPlus, RotateCcw } from 'lucide-react';
import CompartirMensaje from '../CompartirMensaje';
import { copiarTexto, whatsappSendUrl } from '../../utils/compartir';

const errMsg = (e) => e?.message || 'Ocurrió un error';
const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
const mesISO = () => hoyISO().slice(0, 7);
const ICONO = { suspension: '⛔', normal: '✅', recordatorio_pago: '💰', recibo: '🧾' };
const usaPeriodo = (t) => t === 'recordatorio_pago' || t === 'recibo';
const esDifusion = (t) => t === 'suspension' || t === 'normal';

/**
 * Mensajes a los padres de UNA escuela, en MODO MANUAL (el sistema no envía nada):
 *  - Actividad normal / suspendida → UN texto general de difusión (sin nombres ni datos
 *    personales) para pegar en el grupo o la lista de difusión.
 *  - Recordatorio de cuota / recibo → un texto por familia, cada uno con su link de chat.
 * Las plantillas se pueden guardar como propias de la escuela. Con historial.
 *
 * @param {object} props.svc         escuelaAdmin(complexId, escuelaId)
 * @param {Array}  props.categorias  categorías de la escuela
 * @param {(vista:string)=>void} [props.irA]  cambia de pestaña (para ir a "WhatsApp")
 */
/** Textos por familia (cuotas/recibos): copiar o abrir el chat de cada responsable. */
function MensajesIndividuales({ destinatarios }) {
  const [hechos, setHechos] = useState(() => new Set());
  const marcar = (id) => setHechos(s => new Set(s).add(id));
  return (
    <div className="max-h-[28rem] overflow-y-auto divide-y divide-border rounded-lg border border-border">
      {destinatarios.map(d => (
        <div key={d.alumno_id} className="px-3 py-2 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{d.responsable}</span>
            <span className="text-xs text-muted-foreground">({d.alumno}) · +{d.numero}</span>
            {hechos.has(d.alumno_id) && <span className="text-[10px] px-1 rounded bg-success/15 text-success">abierto</span>}
            <span className="ml-auto flex gap-2">
              <button className="text-xs text-primary hover:underline" onClick={async () => { await copiarTexto(d.texto); marcar(d.alumno_id); }}>Copiar</button>
              <a className="text-xs text-primary hover:underline" href={whatsappSendUrl(d.texto, d.numero)} onClick={() => marcar(d.alumno_id)}>Abrir chat</a>
            </span>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">{d.texto}</pre>
        </div>
      ))}
    </div>
  );
}

export default function MensajesPadres({ svc, categorias }) {
  const [cfg, setCfg] = useState(null);
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null);         // borrador en edición
  const [prev, setPrev] = useState(null);         // { mensaje, destinatarios, sin_whatsapp }
  const [sel, setSel] = useState(new Set());
  const [textos, setTextos] = useState({});       // ediciones por alumno
  const [editando, setEditando] = useState(null); // alumno_id con el texto abierto
  const [msg, setMsg] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [generado, setGenerado] = useState(null); // resultado de "Generar" (modo manual)
  const area = useRef(null);

  const cargar = useCallback(() => svc.mensajes().then(setLista).catch(() => {}), [svc]);
  useEffect(() => { svc.plantillasMensaje().then(setCfg).catch(e => setMsg({ error: errMsg(e) })); cargar(); }, [svc, cargar]);
  // Mientras haya envíos en curso, refrescar el historial
  useEffect(() => {
    if (!lista.some(m => m.pendientes > 0)) return undefined;
    const t = setInterval(cargar, 3000);
    return () => clearInterval(t);
  }, [lista, cargar]);

  const plantilla = (tipo) => cfg?.tipos.find(t => t.tipo === tipo)?.plantilla || '';
  const tipoCfg = (tipo) => cfg?.tipos.find(t => t.tipo === tipo);
  const variables = (tipo) => (esDifusion(tipo)
    ? Object.entries(cfg.variables).filter(([v]) => cfg.variables_difusion?.includes(v))
    : Object.entries(cfg.variables));
  const recargarPlantillas = () => svc.plantillasMensaje().then(setCfg).catch(() => {});
  const guardarPlantilla = async (restablecer = false) => {
    setOcupado(true); setMsg({});
    try {
      const r = await svc.guardarPlantilla(form.tipo, restablecer ? '' : form.contenido);
      await recargarPlantillas();
      if (restablecer) setForm(f => ({ ...f, contenido: r.plantilla, editado: false }));
      setMsg({ ok: restablecer ? 'Se restableció la plantilla del sistema.' : 'Plantilla guardada para esta escuela.' });
    } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const nuevo = (tipo) => { setPrev(null); setGenerado(null); setMsg({}); setForm({ tipo, contenido: plantilla(tipo), categoria_id: '', fecha: hoyISO(), periodo: mesISO(), editado: false }); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k === 'contenido' ? { editado: true } : {}) }));
  const cambiarTipo = (tipo) => setForm(f => ({ ...f, tipo, ...(f.editado ? {} : { contenido: plantilla(tipo) }) }));
  const insertar = (v) => {
    const el = area.current;
    if (!el) return set('contenido', `${form.contenido}${v}`);
    const [a, b] = [el.selectionStart, el.selectionEnd];
    set('contenido', form.contenido.slice(0, a) + v + form.contenido.slice(b));
    setTimeout(() => { el.focus(); el.setSelectionRange(a + v.length, a + v.length); }, 0);
  };

  const guardar = async () => {
    setOcupado(true); setMsg({});
    try {
      const d = { tipo: form.tipo, contenido: form.contenido, categoria_id: form.categoria_id || null, ...(usaPeriodo(form.tipo) ? { periodo: form.periodo } : { fecha: form.fecha }) };
      const m = form.id ? await svc.editarMensaje(form.id, d) : await svc.crearMensaje(d);
      setForm(f => ({ ...f, id: m.id }));
      cargar();
      await vistaPrevia(m);
    } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const vistaPrevia = async (m) => {
    const r = await svc.destinatariosMensaje(m.id);
    setPrev({ mensaje: m, ...r }); setSel(new Set(r.destinatarios.map(d => d.alumno_id))); setTextos({}); setEditando(null); setGenerado(null);
  };
  /** Genera los textos (no envía): difusión = uno general; cuotas = uno por familia. */
  const generar = async () => {
    if (!prev.difusion && !sel.size) return setMsg({ error: 'Elegí al menos un alumno.' });
    setOcupado(true); setMsg({});
    try {
      const todos = sel.size === prev.destinatarios.length;
      const ed = Object.fromEntries(Object.entries(textos).filter(([id]) => sel.has(Number(id))));
      const r = await svc.enviarMensaje(prev.mensaje.id, prev.difusion ? {} : { alumno_ids: todos ? undefined : [...sel], textos: Object.keys(ed).length ? ed : undefined });
      setGenerado(r); setPrev(null); setForm(null); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const accion = async (fn, ok) => { try { await fn(); setMsg({ ok }); cargar(); } catch (e) { setMsg({ error: errMsg(e) }); } };

  if (!cfg) return <p className="text-sm text-muted-foreground">{msg.error || 'Cargando…'}</p>;
  return (
    <div className="space-y-4 max-w-4xl">
      {/* Tipo de mensaje */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" role="group" aria-label="Tipo de mensaje">
        {cfg.tipos.map(t => (
          <button key={t.tipo} aria-pressed={form?.tipo === t.tipo} onClick={() => (form ? cambiarTipo(t.tipo) : nuevo(t.tipo))}
            className={`card !py-3 text-left transition-colors ${form?.tipo === t.tipo ? 'border-primary bg-primary/10' : 'hover:border-primary/40'}`}>
            <div className="text-lg">{ICONO[t.tipo]}</div>
            <div className="text-sm font-medium">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Editor */}
      {form && (
        <div className="card space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Destinatarios
              <select className="input" value={form.categoria_id} onChange={e => set('categoria_id', e.target.value)}>
                <option value="">Toda la escuela</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            {usaPeriodo(form.tipo)
              ? <label className="text-xs text-muted-foreground">Mes de la cuota
                  <input type="month" className="input" value={form.periodo} onChange={e => set('periodo', e.target.value)} /></label>
              : <label className="text-xs text-muted-foreground">Día de la clase
                  <input type="date" className="input" value={form.fecha} onChange={e => set('fecha', e.target.value)} /></label>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {form.tipo === 'recordatorio_pago' && 'Un texto por familia con la cuota de ese mes pendiente.'}
            {form.tipo === 'recibo' && 'Un texto por familia con la cuota de ese mes pagada (con su número de recibo). Podés retocar cada recibo en la vista previa.'}
            {esDifusion(form.tipo) && 'Mensaje general para el grupo o la lista de difusión: no lleva nombres ni datos de los alumnos.'}
          </p>
          <textarea ref={area} className="input font-mono text-sm" rows={8} maxLength={2000} value={form.contenido} onChange={e => set('contenido', e.target.value)} aria-label="Contenido del mensaje" />
          <div className="flex flex-wrap gap-1">
            {variables(form.tipo).map(([v, d]) => (
              <button key={v} type="button" title={d} onClick={() => insertar(v)} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground">{v}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-sm flex items-center gap-1.5" disabled={ocupado} onClick={guardar}><Save className="w-4 h-4" /> Guardar y ver destinatarios</button>
            {form.editado && <button className="btn-outline text-sm" onClick={() => setForm(f => ({ ...f, contenido: plantilla(f.tipo), editado: false }))}>Deshacer cambios</button>}
            {form.editado && form.contenido !== plantilla(form.tipo) && (
              <button className="btn-outline text-sm flex items-center gap-1.5" disabled={ocupado} onClick={() => guardarPlantilla(false)} title="Usar este texto como plantilla de la escuela">
                <BookmarkPlus className="w-4 h-4" aria-hidden="true" /> Guardar como plantilla
              </button>
            )}
            {tipoCfg(form.tipo)?.personalizada && (
              <button className="btn-ghost text-sm flex items-center gap-1.5" disabled={ocupado} onClick={() => confirm('¿Volver a la plantilla del sistema para este tipo de mensaje?') && guardarPlantilla(true)}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> Plantilla del sistema
              </button>
            )}
            <button className="btn-outline text-sm" onClick={() => { setForm(null); setPrev(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Vista previa por alumno + envío */}
      {prev?.difusion && (
        <div className="card space-y-3">
          <h3 className="font-semibold">Mensaje de difusión <span className="text-xs text-muted-foreground font-normal">({prev.destinatarios.length} familia(s) alcanzadas)</span></h3>
          <pre className="text-sm whitespace-pre-wrap font-sans rounded-lg bg-muted/40 p-3">{prev.texto_difusion}</pre>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={ocupado} onClick={generar}><FileText className="w-4 h-4" aria-hidden="true" /> Generar mensaje</button>
        </div>
      )}
      {prev && !prev.difusion && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold mr-auto">Destinatarios <span className="text-xs text-muted-foreground font-normal">({sel.size}/{prev.destinatarios.length} elegidos)</span></h3>
            {prev.destinatarios.length > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => setSel(sel.size === prev.destinatarios.length ? new Set() : new Set(prev.destinatarios.map(d => d.alumno_id)))}>
                {sel.size === prev.destinatarios.length ? 'Ninguno' : 'Todos'}
              </button>
            )}
          </div>
          {prev.sin_whatsapp.length > 0 && (
            <p className="text-xs text-amber-400 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Sin WhatsApp válido (no se les envía): {prev.sin_whatsapp.map(d => d.alumno).join(', ')}.</p>
          )}
          {prev.destinatarios.length === 0
            ? <p className="text-sm text-muted-foreground">No hay familias para este mensaje.</p>
            : (
              <div className="max-h-[28rem] overflow-y-auto divide-y divide-border rounded-lg border border-border">
                {prev.destinatarios.map(d => (
                  <div key={d.alumno_id} className="px-3 py-2 space-y-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={sel.has(d.alumno_id)} onChange={() => setSel(s => { const x = new Set(s); if (x.has(d.alumno_id)) x.delete(d.alumno_id); else x.add(d.alumno_id); return x; })} />
                      <span className="font-medium">{d.alumno}</span>
                      <span className="text-xs text-muted-foreground">{d.categoria} · {d.responsable}</span>
                      {textos[d.alumno_id] != null && <span className="text-[10px] px-1 rounded bg-primary/15 text-primary">editado</span>}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">+{d.numero}</span>
                      <button type="button" className="p-1 rounded hover:bg-muted" aria-label={`Editar el mensaje de ${d.alumno}`} onClick={(e) => { e.preventDefault(); setEditando(editando === d.alumno_id ? null : d.alumno_id); }}><Pencil className="w-3.5 h-3.5" /></button>
                    </label>
                    {editando === d.alumno_id
                      ? <textarea className="input text-xs font-mono" rows={6} value={textos[d.alumno_id] ?? d.texto} onChange={e => setTextos(t => ({ ...t, [d.alumno_id]: e.target.value }))} aria-label={`Mensaje para ${d.alumno}`} />
                      : <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground pl-6">{textos[d.alumno_id] ?? d.texto}</pre>}
                  </div>
                ))}
              </div>
            )}
          <p className="text-[11px] text-muted-foreground">Se genera un texto por familia; después lo abrís en tu WhatsApp, uno por uno.</p>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={ocupado || !sel.size} onClick={generar}><FileText className="w-4 h-4" aria-hidden="true" /> Generar mensajes ({sel.size})</button>
        </div>
      )}

      {/* Resultado: listo para compartir desde este dispositivo */}
      {generado && (
        <div className="card space-y-3 border-primary/40">
          <h3 className="font-semibold">{generado.difusion ? 'Listo para el grupo o la lista de difusión' : `${generado.total} mensaje(s) listos`}</h3>
          {generado.difusion
            ? <CompartirMensaje key={generado.envio_id} texto={generado.texto} />
            : <MensajesIndividuales destinatarios={generado.destinatarios} />}
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setGenerado(null)}>Cerrar</button>
        </div>
      )}

      {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-green-400">{msg.ok}</p>}

      {/* Historial */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-2">Historial</h3>
        {lista.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay mensajes. Elegí un tipo arriba para empezar.</p>}
        <div className="divide-y divide-border">
          {lista.map(m => (
            <div key={m.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-1.5 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span>{ICONO[m.tipo]}</span><span className="font-medium">{m.tipo_label}</span>
                  <span className="text-xs text-muted-foreground">{m.periodo || m.fecha} · {categorias.find(c => c.id === m.categoria_id)?.nombre || 'toda la escuela'}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{m.contenido.replace(/\s+/g, ' ')}</div>
              </div>
              {m.estado === 'enviado' && m.generados > 0 ? (
                <span className="text-xs text-muted-foreground shrink-0">
                  {fechaHora(m.enviado_at)} · <span className="text-primary">Generado</span> · {m.total_destinatarios} familia(s){m.enviado_por && ` · ${m.enviado_por}`}
                </span>
              ) : m.estado === 'enviado' ? (
                <span className="text-xs text-muted-foreground shrink-0">
                  {fechaHora(m.enviado_at)} · <span className="text-green-400">{m.enviados}/{m.total_destinatarios} enviados</span>
                  {m.pendientes > 0 && <span className="text-amber-300"> · {m.pendientes} en cola</span>}
                  {m.errores > 0 && <span className="text-red-400"> · {m.errores} con error</span>}
                  {m.enviado_por && ` · ${m.enviado_por}`}
                </span>
              ) : <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 shrink-0">Borrador</span>}
              <div className="flex gap-1 shrink-0">
                {m.estado === 'borrador' && <>
                  <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => { setPrev(null); setForm({ ...m, categoria_id: m.categoria_id || '', fecha: m.fecha || hoyISO(), periodo: m.periodo || mesISO(), editado: true }); }}><Pencil className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-muted" aria-label="Ver destinatarios" onClick={() => vistaPrevia(m).catch(e => setMsg({ error: errMsg(e) }))}><Eye className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Borrar" onClick={() => confirm('¿Borrar el borrador?') && accion(() => svc.borrarMensaje(m.id), 'Borrador eliminado.')}><Trash2 className="w-4 h-4" /></button>
                </>}
                <button className="p-1.5 rounded hover:bg-muted" aria-label="Duplicar" title="Duplicar como borrador" onClick={() => accion(() => svc.duplicarMensaje(m.id), 'Duplicado como borrador.')}><Copy className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
