import { useState, useMemo } from 'react';
import { ClipboardList, Plus, Trash2, ArrowUp, ArrowDown, Printer, MessageSquare, UserPlus, Copy } from 'lucide-react';
import { useGym, puede, useCarga, Tabla, Modal, Campo, Cargando, ErrorBox, errMsg, nombre, fechaCorta } from '../../../components/gym/GymUI';

const EJ_VACIO = { dia: 'Día 1', nombre: '', series: '', repeticiones: '', peso: '', descanso_seg: '', notas: '' };

/** Buscador de socio reutilizable (devuelve el socio elegido). */
function BuscarSocio({ api, onElegir, etiqueta = 'Socio' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const buscar = async () => { if (q.trim().length >= 2) setRes((await api.socios({ q: q.trim(), limite: 8 }).catch(() => ({ socios: [] }))).socios); };
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <div className="flex gap-2">
        <input className="input text-sm" placeholder="Nombre o DNI" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
        <button type="button" className="btn-outline btn-sm" onClick={buscar}>Buscar</button>
      </div>
      {res.length > 0 && (
        <ul className="border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
          {res.map(s => <li key={s.id}><button type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { onElegir(s); setRes([]); setQ(''); }}>{nombre(s)} · {s.dni}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Rutinas: plantillas y rutinas por socio, con editor de ejercicios por día,
 * versionado (cada guardado crea una versión), historial, comentarios e impresión.
 */
export default function GymRutinas() {
  const { api, permisos, avisar } = useGym();
  const [tipo, setTipo] = useState('todas');
  const [socio, setSocio] = useState(null);
  const [editor, setEditor] = useState(null);   // { id? } | null
  const params = { ...(tipo === 'plantillas' && { plantillas: '1' }), ...(socio && { socio_id: socio.id }) };
  const lista = useCarga(() => api.rutinas(params), [api, tipo, socio?.id]);
  const filas = (lista.data || []).filter(r => tipo !== 'socios' || r.socio_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {[['todas', 'Todas'], ['plantillas', 'Plantillas'], ['socios', 'De socios']].map(([v, l]) => (
            <button key={v} onClick={() => setTipo(v)} aria-pressed={tipo === v}
              className={`px-3 py-1.5 rounded-full text-sm border ${tipo === v ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        <div className="min-w-[14rem]">
          {socio ? <div className="text-sm">Socio: <strong>{nombre(socio)}</strong> <button className="text-xs text-muted-foreground underline ml-1" onClick={() => setSocio(null)}>quitar</button></div>
            : <BuscarSocio api={api} onElegir={setSocio} etiqueta="Filtrar por socio" />}
        </div>
        {puede(permisos, 'rutinas', 'crear') && <button className="btn-primary btn-sm ml-auto" onClick={() => setEditor({})}><Plus className="w-4 h-4" /> Nueva rutina</button>}
      </div>
      {lista.cargando && !lista.data ? <Cargando /> : <ErrorBox>{lista.error}</ErrorBox>}
      {lista.data && (
        <Tabla filas={filas} vacio="No hay rutinas cargadas." onRow={r => setEditor({ id: r.id })} columnas={[
          { k: 'nombre', l: 'Rutina', r: r => <span className="font-medium">{r.nombre}</span> },
          { k: 'socio', l: 'Socio', r: r => (r.socio ? nombre(r.socio) : <span className="badge-blue">Plantilla</span>) },
          { k: 'profesor', l: 'Profesor', r: r => (r.profesor ? `${r.profesor.nombre} ${r.profesor.apellido}` : '—') },
          { k: 'version_actual', l: 'Versión', r: r => `v${r.version_actual}` },
          { k: 'activa', l: 'Estado', r: r => <span className={r.activa ? 'badge-green' : 'badge-neutral'}>{r.activa ? 'Activa' : 'Inactiva'}</span> },
          { k: 'updated_at', l: 'Actualizada', r: r => fechaCorta(r.updated_at) },
        ]} />
      )}
      {editor && <EditorRutina id={editor.id} onClose={() => setEditor(null)} onGuardado={() => { lista.recargar(); }} api={api} permisos={permisos} avisar={avisar} />}
    </div>
  );
}

function EditorRutina({ id, onClose, onGuardado, api, permisos, avisar }) {
  const [version, setVersion] = useState(null);
  const det = useCarga(() => (id ? api.rutina(id, version) : Promise.resolve(null)), [api, id, version]);
  const profes = useCarga(() => api.profesores.list({ activo: 'true' }), [api]);
  const [form, setForm] = useState(null);
  const [comentario, setComentario] = useState('');
  const [asignar, setAsignar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const d = det.data;
  const soloLectura = Boolean(d && d.version_vista !== d.version_actual);
  const editable = id ? puede(permisos, 'rutinas', 'editar') && !soloLectura : true;

  // Inicializa el formulario cuando llega la rutina (o vacío si es nueva)
  const f = useMemo(() => form || (id ? (d && {
    nombre: d.nombre, objetivo: d.objetivo || '', profesor_id: d.profesor_id || '', socio: d.socio, activa: d.activa, notas: '',
    ejercicios: d.ejercicios.map(e => ({ ...EJ_VACIO, ...e })),
  }) : { nombre: '', objetivo: '', profesor_id: '', socio: null, activa: true, notas: '', ejercicios: [{ ...EJ_VACIO }] }), [form, d, id]);
  if (id && (det.cargando && !d)) return <Modal titulo="Rutina" onClose={onClose}><Cargando /></Modal>;
  if (!f) return <Modal titulo="Rutina" onClose={onClose}><ErrorBox>{det.error}</ErrorBox></Modal>;

  const set = (k, v) => setForm({ ...f, [k]: v });
  const setEj = (i, k, v) => set('ejercicios', f.ejercicios.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const mover = (i, delta) => {
    const arr = [...f.ejercicios]; const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; set('ejercicios', arr);
  };
  const dias = [...new Set(f.ejercicios.map(e => e.dia || 'Día 1'))];
  const agregarDia = () => set('ejercicios', [...f.ejercicios, { ...EJ_VACIO, dia: `Día ${dias.length + 1}` }]);

  const guardar = async () => {
    setGuardando(true);
    const ejercicios = f.ejercicios.filter(e => e.nombre.trim()).map((e, i) => ({
      dia: e.dia || 'Día 1', orden: i, nombre: e.nombre, series: e.series === '' ? null : e.series, repeticiones: e.repeticiones || null,
      peso: e.peso || null, descanso_seg: e.descanso_seg === '' ? null : e.descanso_seg, notas: e.notas || null,
    }));
    const body = { nombre: f.nombre, objetivo: f.objetivo || null, profesor_id: f.profesor_id || null, ejercicios };
    try {
      if (id) await api.versionRutina(id, { ...body, activa: f.activa, notas: f.notas || null });
      else await api.crearRutina({ ...body, socio_id: f.socio?.id || null });
      avisar('ok', id ? 'Rutina guardada como nueva versión.' : 'Rutina creada.');
      onGuardado(); onClose();
    } catch (e) { avisar('err', errMsg(e)); } finally { setGuardando(false); }
  };
  const comentar = async () => {
    try { await api.comentarRutina(id, comentario); setComentario(''); det.recargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const eliminar = async () => {
    if (!window.confirm('¿Eliminar la rutina y todas sus versiones?')) return;
    try { await api.eliminarRutina(id); avisar('ok', 'Rutina eliminada.'); onGuardado(); onClose(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const asignarA = async (s) => {
    try { await api.asignarPlantilla(id, s.id); avisar('ok', `Rutina asignada a ${nombre(s)}.`); setAsignar(false); onGuardado(); } catch (e) { avisar('err', errMsg(e)); }
  };
  const imprimir = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const e = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${e(f.nombre)}</title><style>body{font:13px system-ui;margin:24px}table{width:100%;border-collapse:collapse;margin-bottom:16px}td,th{border-bottom:1px solid #ddd;padding:4px;text-align:left}</style>
      <h1>${e(f.nombre)}</h1><p>${e(f.socio ? `${f.socio.apellido}, ${f.socio.nombre}` : 'Plantilla')} · ${e(f.objetivo)}</p>
      ${dias.map(dia => `<h3>${e(dia)}</h3><table><tr><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Peso</th><th>Descanso</th><th>Notas</th></tr>${f.ejercicios.filter(x => (x.dia || 'Día 1') === dia).map(x => `<tr><td>${e(x.nombre)}</td><td>${e(x.series)}</td><td>${e(x.repeticiones)}</td><td>${e(x.peso)}</td><td>${x.descanso_seg ? `${e(x.descanso_seg)}s` : ''}</td><td>${e(x.notas)}</td></tr>`).join('')}</table>`).join('')}
      <script>print()</script>`);
    w.document.close();
  };

  return (
    <Modal titulo={id ? `Rutina: ${f.nombre}` : 'Nueva rutina'} onClose={onClose} ancho="max-w-4xl">
      <div className="space-y-4">
        {id && d && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Versión:</span>
            <select className="input text-sm !w-auto" value={d.version_vista} onChange={e => { setForm(null); setVersion(Number(e.target.value)); }}>
              {d.versiones.map(v => <option key={v.id} value={v.version}>v{v.version}{v.version === d.version_actual ? ' (vigente)' : ''} · {fechaCorta(v.created_at)}{v.notas ? ` · ${v.notas}` : ''}</option>)}
            </select>
            {soloLectura && <span className="badge-yellow">Versión anterior: solo lectura</span>}
            <span className="ml-auto flex gap-1">
              <button className="btn-ghost btn-sm" onClick={imprimir}><Printer className="w-4 h-4" /> Imprimir</button>
              {!d.socio_id && puede(permisos, 'rutinas', 'crear') && <button className="btn-ghost btn-sm" onClick={() => setAsignar(a => !a)}><UserPlus className="w-4 h-4" /> Asignar a socio</button>}
              {puede(permisos, 'rutinas', 'eliminar') && <button className="btn-ghost btn-sm !text-danger" onClick={eliminar}><Trash2 className="w-4 h-4" /></button>}
            </span>
          </div>
        )}
        {asignar && <div className="card !p-3"><BuscarSocio api={api} onElegir={asignarA} etiqueta="Asignar una copia de esta plantilla a…" /></div>}

        <fieldset disabled={!editable} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="Nombre" req value={f.nombre} onChange={v => set('nombre', v)} maxLength={150} />
            <Campo label="Objetivo" value={f.objetivo} onChange={v => set('objetivo', v)} maxLength={255} />
            <Campo label="Profesor" tipo="select" value={f.profesor_id} onChange={v => set('profesor_id', v)}
              opciones={[['', 'Sin asignar'], ...(profes.data || []).map(p => [p.id, `${p.nombre} ${p.apellido}`])]} />
            {id ? (
              <div className="text-sm self-end">{f.socio ? <>Socio: <strong>{nombre(f.socio)}</strong></> : <span className="badge-blue">Plantilla</span>}
                <Campo className="mt-2" label="Rutina activa" tipo="checkbox" value={f.activa} onChange={v => set('activa', v)} /></div>
            ) : f.socio ? (
              <div className="text-sm self-end">Socio: <strong>{nombre(f.socio)}</strong> <button type="button" className="text-xs underline text-muted-foreground" onClick={() => set('socio', null)}>quitar (plantilla)</button></div>
            ) : <BuscarSocio api={api} onElegir={s => set('socio', s)} etiqueta="Socio (vacío = plantilla)" />}
          </div>

          {dias.map(dia => (
            <div key={dia} className="space-y-2">
              <input className="input text-sm font-semibold !w-auto" value={dia} aria-label="Nombre del día"
                onChange={e => set('ejercicios', f.ejercicios.map(x => ((x.dia || 'Día 1') === dia ? { ...x, dia: e.target.value } : x)))} />
              {f.ejercicios.map((e, i) => ((e.dia || 'Día 1') !== dia ? null : (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_repeat(4,1fr)_2fr_auto] gap-2 items-end border-b border-border pb-2">
                  <Campo className="col-span-2 sm:col-span-1" label="Ejercicio" value={e.nombre} onChange={v => setEj(i, 'nombre', v)} maxLength={150} />
                  <Campo label="Series" tipo="number" min="0" value={e.series} onChange={v => setEj(i, 'series', v)} />
                  <Campo label="Reps" value={e.repeticiones} onChange={v => setEj(i, 'repeticiones', v)} maxLength={20} />
                  <Campo label="Peso" value={e.peso} onChange={v => setEj(i, 'peso', v)} maxLength={20} />
                  <Campo label="Descanso (s)" tipo="number" min="0" value={e.descanso_seg} onChange={v => setEj(i, 'descanso_seg', v)} />
                  <Campo className="col-span-2 sm:col-span-1" label="Notas" value={e.notas} onChange={v => setEj(i, 'notas', v)} maxLength={255} />
                  {editable && (
                    <div className="flex gap-1 col-span-2 sm:col-span-1">
                      <button type="button" className="btn-ghost btn-sm !px-2" onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" className="btn-ghost btn-sm !px-2" onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button>
                      <button type="button" className="btn-ghost btn-sm !px-2 !text-danger" onClick={() => set('ejercicios', f.ejercicios.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              )))}
              {editable && <button type="button" className="btn-ghost btn-sm" onClick={() => set('ejercicios', [...f.ejercicios, { ...EJ_VACIO, dia }])}><Plus className="w-4 h-4" /> Ejercicio</button>}
            </div>
          ))}
          {editable && <button type="button" className="btn-outline btn-sm" onClick={agregarDia}><Copy className="w-4 h-4" /> Agregar día</button>}
          {id && editable && <Campo label="Nota de esta versión (opcional)" value={f.notas} onChange={v => set('notas', v)} maxLength={255} />}
        </fieldset>

        {editable && (
          <button className="btn-primary" disabled={guardando || !f.nombre.trim() || !f.ejercicios.some(e => e.nombre.trim())} onClick={guardar}>
            <ClipboardList className="w-4 h-4" /> {id ? 'Guardar como nueva versión' : 'Crear rutina'}
          </button>
        )}

        {id && d && (
          <div className="space-y-2 border-t border-border pt-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Comentarios</h4>
            {d.comentarios.length === 0 && <p className="text-xs text-muted-foreground">Sin comentarios.</p>}
            {d.comentarios.map(c => <div key={c.id} className="text-sm rounded-lg bg-muted px-3 py-2"><span className="font-medium">{c.autor}</span> <span className="text-xs text-muted-foreground">· {fechaCorta(c.created_at)}</span><p className="whitespace-pre-line">{c.texto}</p></div>)}
            <div className="flex gap-2">
              <input className="input text-sm" placeholder="Escribí un comentario…" value={comentario} onChange={e => setComentario(e.target.value)} maxLength={2000} />
              <button className="btn-outline btn-sm" disabled={comentario.trim().length < 2} onClick={comentar}>Enviar</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
