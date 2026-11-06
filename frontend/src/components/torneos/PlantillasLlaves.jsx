import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Plus, FlaskConical, Save, Power, Pencil, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { errMsg } from '../../utils/torneos';

/**
 * Plantillas de llaves (solo Administrador General). Muestra los formatos oficiales internos y
 * las plantillas cargadas desde administración (globales o del club), y permite crear / editar /
 * activar plantillas nuevas SIN modificar código. Toda la validación la hace el backend.
 */
const VACIA = { name: '', alcance: 'global', zones: '', clasifican: 2, min_pairs: '', max_pairs: '', template_json: '' };

function VistaRondas({ rondas }) {
  if (!rondas?.length) return null;
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max text-[11px]">
        {rondas.map(r => (
          <div key={r.ronda} className="w-52 space-y-1">
            <div className="font-semibold uppercase text-muted-foreground">{r.nombre}</div>
            {r.partidos.map(p => (
              <div key={p.key} className="rounded border border-border px-2 py-1">
                <div>{p.cruce}</div>
                <div className="text-muted-foreground">{p.key}{p.siguiente ? ` → ${p.siguiente}` : ''}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlantillasLlaves({ svc }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [form, setForm] = useState(null);       // null = cerrado
  const [editId, setEditId] = useState(null);
  const [prueba, setPrueba] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(() => svc.plantillas().then(setData).catch(e => setError(errMsg(e))), [svc]);
  useEffect(() => { cargar(); }, [cargar]);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setPrueba(null); };

  const nueva = (base) => {
    setEditId(null); setPrueba(null); setOk('');
    setForm(base ? {
      ...VACIA, name: `${base.nombre} (personalizada)`, zones: base.zonas, clasifican: base.clasifican, min_pairs: base.min ?? '', max_pairs: base.max ?? '',
      template_json: JSON.stringify({ ...(base.regla.etiquetas && { etiquetas: base.regla.etiquetas }), rondas: base.regla.rondas }, null, 2),
    } : { ...VACIA });
  };
  const editar = (t) => {
    setEditId(t.id); setPrueba(null); setOk('');
    setForm({ name: t.name, alcance: t.id_tenant ? 'club' : 'global', zones: t.zones, clasifican: t.clasifican, min_pairs: t.min_pairs ?? '', max_pairs: t.max_pairs ?? '', template_json: JSON.stringify(t.template_json, null, 2), active: t.active });
  };
  const probar = async () => {
    setOcupado(true); setError('');
    try { setPrueba(await svc.probarPlantilla(form)); } catch (e) { setError(errMsg(e)); } finally { setOcupado(false); }
  };
  const guardar = async () => {
    setOcupado(true); setError('');
    try {
      if (editId) await svc.actualizarPlantilla(editId, form); else await svc.crearPlantilla(form);
      setOk(`Plantilla "${form.name}" guardada. Se aplica a las próximas llaves de ${form.zones} zonas.`);
      setForm(null); cargar();
    } catch (e) { setError(errMsg(e)); if (e.errores) setPrueba({ valida: false, errores: e.errores }); } finally { setOcupado(false); }
  };
  const activar = async (t) => {
    try { await svc.activarPlantilla(t.id, !t.active); cargar(); } catch (e) { setError(errMsg(e)); }
  };

  if (!data && !error) return <div className="h-40 rounded-xl bg-muted animate-pulse" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-sm text-muted-foreground flex-1 min-w-[16rem]">
          Los cruces de la fase final salen de una plantilla según la cantidad de zonas. Prioridad: plantilla del club → plantilla global → formato oficial.
          Una plantilla con rango de parejas solo se aplica dentro de ese rango. Cada plantilla se valida antes de guardarse
          (cada clasificado una vez, sin cruces de la misma zona, todos los partidos encadenados hasta la final).
        </p>
        <button className="btn-primary text-sm" onClick={() => nueva(null)}><Plus className="w-4 h-4" /> Nueva plantilla</button>
      </div>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {ok && <div className="text-sm text-emerald-400" role="status">{ok}</div>}

      {form && (
        <div className="card space-y-3 border-primary/40">
          <div className="flex items-center justify-between"><h3 className="font-semibold">{editId ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
            <button className="p-1 rounded hover:bg-muted" onClick={() => setForm(null)} aria-label="Cerrar"><X className="w-4 h-4" /></button></div>
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <label className="text-xs text-muted-foreground sm:col-span-2">Nombre<input className="input text-sm" value={form.name} onChange={e => set('name', e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Alcance
              <select className="input text-sm" value={form.alcance} onChange={e => set('alcance', e.target.value)}>
                <option value="global">Todos los clubes</option><option value="club">Solo este club</option>
              </select></label>
            <label className="text-xs text-muted-foreground">Zonas<input className="input text-sm" type="number" min="1" max="16" value={form.zones} onChange={e => set('zones', e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Parejas mín.<input className="input text-sm" type="number" min="2" value={form.min_pairs} onChange={e => set('min_pairs', e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Parejas máx.<input className="input text-sm" type="number" min="2" value={form.max_pairs} onChange={e => set('max_pairs', e.target.value)} /></label>
          </div>
          <label className="block text-xs text-muted-foreground">Cruces (JSON): cada partido <code>{'{ key, local, visitante, siguiente: { key, slot } }'}</code>; lados: <code>"1A"</code> (1° Zona A), <code>"W:cuartos-1"</code> (ganador), <code>null</code> (BYE, solo 1ª ronda)
            <textarea className="input text-xs font-mono h-64" spellCheck={false} value={form.template_json} onChange={e => set('template_json', e.target.value)} placeholder='{ "rondas": { "semifinal": [...], "final": [...] } }' /></label>
          {prueba && (
            <div className={`rounded-lg p-3 text-sm space-y-2 ${prueba.valida ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="flex items-center gap-2 font-medium">{prueba.valida ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Plantilla válida · {prueba.partidos_a_jugar} partidos a jugar</> : <><AlertTriangle className="w-4 h-4 text-red-400" /> La plantilla tiene errores</>}</div>
              {!prueba.valida && <ul className="list-disc pl-5 text-xs space-y-0.5">{prueba.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
              <VistaRondas rondas={prueba.rondas} />
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-outline text-sm" disabled={ocupado} onClick={probar}><FlaskConical className="w-4 h-4" /> Probar</button>
            <button className="btn-primary text-sm" disabled={ocupado} onClick={guardar}><Save className="w-4 h-4" /> Guardar</button>
          </div>
        </div>
      )}

      {data && (
        <>
          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Plantillas de administración</h3>
            {!data.plantillas.length && <p className="text-sm text-muted-foreground">Todavía no hay plantillas propias: se usan los formatos oficiales.</p>}
            {data.plantillas.map(t => (
              <div key={t.id} className={`card !p-3 space-y-2 ${t.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.zones} zonas · {t.min_pairs || '—'} a {t.max_pairs || '—'} parejas · {t.id_tenant ? 'solo este club' : 'global'}</span>
                  {t.errores?.length > 0 && <span className="badge badge-red">Inválida</span>}
                  <span className={`badge ${t.active ? 'badge-green' : ''}`}>{t.active ? 'Activa' : 'Inactiva'}</span>
                  <span className="ml-auto flex gap-1">
                    <button className="btn-ghost text-xs" onClick={() => setAbierta(abierta === `t${t.id}` ? null : `t${t.id}`)}>Ver cruces</button>
                    <button className="btn-ghost text-xs" onClick={() => editar(t)}><Pencil className="w-3.5 h-3.5" /> Editar</button>
                    <button className="btn-ghost text-xs" onClick={() => activar(t)}><Power className="w-3.5 h-3.5" /> {t.active ? 'Desactivar' : 'Activar'}</button>
                  </span>
                </div>
                {abierta === `t${t.id}` && <VistaRondas rondas={t.rondas} />}
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Formatos oficiales (internos)</h3>
            {data.internas.map(r => (
              <div key={r.key} className="card !p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{r.nombre}</span>
                  <span className="ml-auto flex gap-1">
                    <button className="btn-ghost text-xs" onClick={() => setAbierta(abierta === r.key ? null : r.key)}>Ver cruces</button>
                    <button className="btn-ghost text-xs" onClick={() => nueva(r)}><Plus className="w-3.5 h-3.5" /> Usar como base</button>
                  </span>
                </div>
                {abierta === r.key && <VistaRondas rondas={r.rondas} />}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
