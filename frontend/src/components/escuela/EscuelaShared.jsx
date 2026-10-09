import { useState, useEffect } from 'react';
import { MessageCircle, Copy, Check, X, Plus, Trash2, Pencil, CheckCircle2 } from 'lucide-react';
import { mensajeEscuela, waLinkEscuela, copiarTexto, TIPOS_MENSAJE } from '../../utils/escuelaWhatsapp';
import { hoyAR } from '../../utils/fecha';

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
export const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
export const errMsg = (e) => e?.message || 'Ocurrió un error';
export const hoyISO = () => hoyAR();

export const PAGO_BADGE = {
  pagado:       { label: 'Pagada',        cls: 'badge-green' },
  pendiente:    { label: 'Pendiente',     cls: 'badge-yellow' },
  sin_registro: { label: 'Sin registrar', cls: 'badge-red' },
};

/** Panel lateral (pantalla completa en el celular). */
export function Panel({ titulo, onClose, children, ancho = 'sm:max-w-lg' }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative z-10 w-full ${ancho} h-full overflow-y-auto bg-background border-l border-border p-4 sm:p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{titulo}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Mensaje de WhatsApp a un alumno/padre, generado con sus datos (categoría,
 * horarios, estado de la cuota, aviso del día). Se puede retocar antes de enviar.
 * @param {() => Promise<object>} cargarContexto  GET .../alumnos/:id/contexto
 */
export function WhatsAppAlumno({ alumno, cargarContexto, tipoInicial = 'automatico', aviso = null, onClose }) {
  const [ctx, setCtx] = useState(null);
  const [tipo, setTipo] = useState(tipoInicial);
  const [texto, setTexto] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { cargarContexto().then(setCtx).catch(e => setError(errMsg(e))); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ctx) setTexto(mensajeEscuela(ctx, tipo, aviso)); }, [ctx, tipo]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tel = alumno.responsable_whatsapp;
  const copiar = async () => { if (await copiarTexto(texto)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); } };
  const abrir = async () => { await copiarTexto(texto); window.open(waLinkEscuela(tel, texto), '_blank', 'noopener'); };

  return (
    <Panel titulo={`WhatsApp · ${alumno.nombre}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">Para {alumno.responsable_nombre} · {tel}</div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!ctx && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {ctx && <>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TIPOS_MENSAJE).map(([k, l]) => (
              <button key={k} onClick={() => setTipo(k)}
                className={`px-2.5 py-1 rounded-full text-xs ${tipo === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            Cuota {ctx.periodo}: <span className={PAGO_BADGE[ctx.pago_estado]?.cls}>{PAGO_BADGE[ctx.pago_estado]?.label}</span>
            {ctx.aviso_hoy && <> · Hoy: <strong className={ctx.aviso_hoy.estado === 'suspendida' ? 'text-red-400' : 'text-green-400'}>{ctx.aviso_hoy.estado}</strong></>}
          </div>
          <textarea className="input min-h-[260px] text-sm font-sans" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Mensaje" />
          <div className="flex gap-2">
            <button className="btn-outline text-sm flex-1 flex items-center justify-center gap-1.5" onClick={copiar}>
              {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-green-700 hover:bg-green-800" onClick={abrir}>
              <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Se abre WhatsApp en este dispositivo con el chat del responsable y el mensaje cargado: solo tenés que enviarlo. Usá el WhatsApp con el número oficial de la escuela.</p>
        </>}
      </div>
    </Panel>
  );
}

/**
 * Envío a varios padres (ej. "hoy se suspende" a toda una categoría).
 * WhatsApp no permite mandar a muchos con un solo link: se abre un chat por
 * padre, con el mensaje personalizado, y se va tildando a quién ya se le envió.
 * Alternativa: copiar un texto general para pegar en el grupo de la categoría.
 */
export function EnvioMasivo({ titulo, alumnos, cargarContexto, tipo, aviso, textoGrupo, onClose }) {
  const [enviados, setEnviados] = useState(new Set());
  const [copiado, setCopiado] = useState(false);
  const abrir = async (a) => {
    const ctx = await cargarContexto(a.id);
    window.open(waLinkEscuela(a.responsable_whatsapp, mensajeEscuela(ctx, tipo, aviso)), '_blank', 'noopener');
    setEnviados(s => new Set(s).add(a.id));
  };
  return (
    <Panel titulo={titulo} onClose={onClose}>
      <div className="space-y-3">
        {textoGrupo && (
          <div className="card space-y-2">
            <div className="text-sm font-medium">Para el grupo de WhatsApp de la categoría</div>
            <pre className="text-xs whitespace-pre-wrap font-sans bg-background/60 rounded p-2">{textoGrupo}</pre>
            <button className="btn-outline text-sm" onClick={async () => { if (await copiarTexto(textoGrupo)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); } }}>
              {copiado ? 'Copiado' : 'Copiar texto para el grupo'}
            </button>
          </div>
        )}
        <div className="text-sm text-muted-foreground">O uno por uno ({enviados.size}/{alumnos.length} enviados):</div>
        <div className="space-y-1.5">
          {alumnos.map(a => (
            <div key={a.id} className="card py-2 flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate">{a.nombre}</div>
                <div className="text-[11px] text-muted-foreground truncate">{a.responsable_nombre} · {a.responsable_whatsapp}</div>
              </div>
              {enviados.has(a.id) && <CheckCircle2 className="w-4 h-4 text-green-400" aria-label="Enviado" />}
              <button className="p-2 rounded-lg bg-green-700 text-white hover:bg-green-800" onClick={() => abrir(a)} aria-label={`WhatsApp a ${a.responsable_nombre}`}>
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Horarios de entrenamiento (alta / edición / baja). Cada horario bloquea la
 * cancha (del deporte de la escuela) todas las semanas en la agenda (turno fijo).
 */
export function HorariosEditor({ horarios, categorias, canchas, onCrear, onEditar, onBorrar }) {
  const VACIO = { categoria_id: categorias[0]?.id || '', field_id: canchas[0]?.id || '', dia_semana: 1, hora_inicio: '18:00', hora_fin: '19:30' };
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault(); setMsg({});
    try {
      const { id, ...d } = form;
      const r = id ? await onEditar(id, d) : await onCrear(d);
      setForm(null);
      setMsg({ ok: `Guardado: la cancha queda reservada en la agenda (${r.bloqueadas} fechas)${r.salteadas ? `; ${r.salteadas} fechas ya estaban ocupadas y se saltearon` : ''}.` });
    } catch (err) { setMsg({ error: errMsg(err) }); }
  };
  const horas = Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
  const ordenados = [...horarios].sort((a, b) => ORDEN_DIAS.indexOf(a.dia_semana) - ORDEN_DIAS.indexOf(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio));

  return (
    <div className="space-y-3">
      {!form && <button className="btn-primary text-sm flex items-center gap-1" disabled={!categorias.length || !canchas.length} onClick={() => setForm(VACIO)}><Plus className="w-4 h-4" /> Horario</button>}
      {(!categorias.length || !canchas.length) && <p className="text-xs text-muted-foreground">Necesitás al menos una categoría y una cancha habilitada del deporte de la escuela.</p>}
      {form && (
        <form onSubmit={guardar} className="card grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <label className="text-xs text-muted-foreground col-span-2 sm:col-span-1">Categoría
            <select className="input" value={form.categoria_id} onChange={e => set('categoria_id', Number(e.target.value))}>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground col-span-2 sm:col-span-1">Cancha
            <select className="input" value={form.field_id} onChange={e => set('field_id', Number(e.target.value))}>
              {canchas.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.identificador ? ` (${c.identificador})` : ''}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Día
            <select className="input" value={form.dia_semana} onChange={e => set('dia_semana', Number(e.target.value))}>
              {ORDEN_DIAS.map(d => <option key={d} value={d}>{DIAS[d]}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Desde
            <select className="input" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)}>
              {horas.map(h => <option key={h}>{h}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Hasta
            <input type="time" step="900" className="input" value={form.hora_fin} onChange={e => set('hora_fin', e.target.value)} />
          </label>
          <div className="col-span-2 sm:col-span-5 flex gap-2">
            <button className="btn-primary text-sm">Guardar</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-green-400">{msg.ok}</p>}
      {ordenados.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Sin horarios cargados.</div>}
      <div className="space-y-1.5">
        {ordenados.map(h => (
          <div key={h.id} className="card py-2.5 flex items-center gap-3 text-sm">
            <span className="w-24 font-medium">{DIAS[h.dia_semana]}</span>
            <span className="font-mono">{h.hora_inicio}–{h.hora_fin}</span>
            <span className="flex-1 min-w-0 truncate text-muted-foreground">{h.categoria?.nombre || categorias.find(c => c.id === h.categoria_id)?.nombre} · {h.field?.nombre}</span>
            <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm({ id: h.id, categoria_id: h.categoria_id, field_id: h.field_id, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })}><Pencil className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Borrar"
              onClick={async () => { if (confirm('¿Borrar el horario? Se libera la cancha en la agenda.')) { try { await onBorrar(h.id); } catch (e) { setMsg({ error: errMsg(e) }); } } }}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Formulario de aviso de actividad (normal / suspendida). */
export function AvisoForm({ categorias, permitirGeneral = true, onGuardar, onCancel }) {
  const [f, setF] = useState({ fecha: hoyISO(), estado: 'suspendida', categoria_id: permitirGeneral ? '' : (categorias[0]?.id || ''), mensaje: '' });
  const [error, setError] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <form className="card space-y-2" onSubmit={async (e) => { e.preventDefault(); setError(''); try { await onGuardar({ ...f, categoria_id: f.categoria_id || null }); } catch (err) { setError(errMsg(err)); } }}>
      <div className="grid sm:grid-cols-3 gap-2">
        <input type="date" className="input" value={f.fecha} onChange={e => set('fecha', e.target.value)} aria-label="Fecha" />
        <select className="input" value={f.categoria_id} onChange={e => set('categoria_id', e.target.value ? Number(e.target.value) : '')} aria-label="Categoría">
          {permitirGeneral && <option value="">Toda la escuela</option>}
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div className="flex gap-1">
          {['normal', 'suspendida'].map(e => (
            <button type="button" key={e} onClick={() => set('estado', e)}
              className={`flex-1 rounded-lg text-sm py-2 ${f.estado === e ? (e === 'normal' ? 'bg-green-700 text-white' : 'bg-red-600 text-white') : 'bg-muted'}`}>
              {e === 'normal' ? 'Normal' : 'Suspendida'}
            </button>
          ))}
        </div>
      </div>
      <input className="input" maxLength={500} placeholder="Motivo / detalle (ej. lluvia, se pasa al jueves…)" value={f.mensaje} onChange={e => set('mensaje', e.target.value)} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm">Publicar aviso</button>
        {onCancel && <button type="button" className="btn-outline text-sm" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
