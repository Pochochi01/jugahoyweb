import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Save, Eye, Copy, Trash2, Pencil, AlertTriangle } from 'lucide-react';

const errMsg = (e) => e?.message || 'Ocurrió un error';
const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
const mesISO = () => hoyISO().slice(0, 7);
const ICONO = { suspension: '⛔', normal: '✅', recordatorio_pago: '💰', recibo: '🧾' };
const usaPeriodo = (t) => t === 'recordatorio_pago' || t === 'recibo';

/**
 * Mensajes a los padres de UNA escuela: tipo → contenido editable (con variables
 * por alumno) → vista previa por alumno (cada texto se puede retocar, p. ej. un
 * recibo) → envío masivo desde el WhatsApp vinculado a la escuela. Con historial.
 *
 * @param {object} props.svc         escuelaAdmin(complexId, escuelaId)
 * @param {Array}  props.categorias  categorías de la escuela
 * @param {(vista:string)=>void} [props.irA]  cambia de pestaña (para ir a "WhatsApp")
 */
export default function MensajesPadres({ svc, categorias, irA }) {
  const [cfg, setCfg] = useState(null);
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null);         // borrador en edición
  const [prev, setPrev] = useState(null);         // { mensaje, destinatarios, sin_whatsapp }
  const [sel, setSel] = useState(new Set());
  const [textos, setTextos] = useState({});       // ediciones por alumno
  const [editando, setEditando] = useState(null); // alumno_id con el texto abierto
  const [msg, setMsg] = useState({});
  const [ocupado, setOcupado] = useState(false);
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
  const nuevo = (tipo) => { setPrev(null); setMsg({}); setForm({ tipo, contenido: plantilla(tipo), categoria_id: '', fecha: hoyISO(), periodo: mesISO(), editado: false }); };
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
    setPrev({ mensaje: m, ...r }); setSel(new Set(r.destinatarios.map(d => d.alumno_id))); setTextos({}); setEditando(null);
  };
  const enviar = async () => {
    if (!sel.size) return setMsg({ error: 'Elegí al menos un alumno.' });
    if (!confirm(`¿Enviar a ${sel.size} familia(s) desde el WhatsApp de la escuela?`)) return;
    setOcupado(true); setMsg({});
    try {
      const todos = sel.size === prev.destinatarios.length;
      const ed = Object.fromEntries(Object.entries(textos).filter(([id]) => sel.has(Number(id))));
      const r = await svc.enviarMensaje(prev.mensaje.id, { alumno_ids: todos ? undefined : [...sel], textos: Object.keys(ed).length ? ed : undefined });
      setMsg({ ok: r.message }); setPrev(null); setForm(null); cargar();
    } catch (e) { setMsg({ error: errMsg(e), sinTelefono: e?.code === 'TELEFONO_NO_CONECTADO' }); } finally { setOcupado(false); }
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
            {form.tipo === 'recordatorio_pago' && 'Se envía solo a las familias con la cuota de ese mes pendiente.'}
            {form.tipo === 'recibo' && 'Se envía solo a las familias con la cuota de ese mes pagada (con su número de recibo). Podés retocar cada recibo en la vista previa.'}
            {(form.tipo === 'suspension' || form.tipo === 'normal') && 'Se envía a todos los alumnos activos (de la escuela o de la categoría elegida).'}
          </p>
          <textarea ref={area} className="input font-mono text-sm" rows={8} maxLength={2000} value={form.contenido} onChange={e => set('contenido', e.target.value)} aria-label="Contenido del mensaje" />
          <div className="flex flex-wrap gap-1">
            {Object.entries(cfg.variables).map(([v, d]) => (
              <button key={v} type="button" title={d} onClick={() => insertar(v)} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground">{v}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-sm flex items-center gap-1.5" disabled={ocupado} onClick={guardar}><Save className="w-4 h-4" /> Guardar y ver destinatarios</button>
            {form.editado && <button className="btn-outline text-sm" onClick={() => setForm(f => ({ ...f, contenido: plantilla(f.tipo), editado: false }))}>Restaurar plantilla</button>}
            <button className="btn-outline text-sm" onClick={() => { setForm(null); setPrev(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Vista previa por alumno + envío */}
      {prev && (
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
          <p className="text-[11px] text-muted-foreground">Cada mensaje sale con el nombre de la escuela arriba y el del club al pie, desde el WhatsApp vinculado a la escuela, de a uno.</p>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={ocupado || !sel.size} onClick={enviar}><Send className="w-4 h-4" /> Enviar masivo ({sel.size})</button>
        </div>
      )}

      {msg.error && (
        <p className="text-sm text-red-400">{msg.error}
          {msg.sinTelefono && irA && <> <button className="underline" onClick={() => irA('whatsapp')}>Ir a WhatsApp</button></>}</p>
      )}
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
              {m.estado === 'enviado' ? (
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
