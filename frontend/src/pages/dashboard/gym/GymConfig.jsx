import { useState } from 'react';
import { useGym, puede, useCarga, Cargando, ErrorBox, Campo, Tabla, errMsg } from '../../../components/gym/GymUI';

/** Configuración del gym: general, roles y permisos, auditoría y tienda. */
export default function GymConfig() {
  const { permisos } = useGym();
  const tabs = [
    puede(permisos, 'configuracion', 'ver') && ['general', 'General'],
    puede(permisos, 'configuracion', 'ver') && ['roles', 'Roles y permisos'],
    puede(permisos, 'auditoria', 'ver') && ['auditoria', 'Auditoría'],
    ['tienda', 'Tienda'],
  ].filter(Boolean);
  const [t, setT] = useState(tabs[0][0]);
  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setT(k)} className={`btn-sm ${t === k ? 'btn-primary' : 'btn-ghost'}`}>{l}</button>)}
      </div>
      {t === 'general' && <General />}
      {t === 'roles' && <Roles />}
      {t === 'auditoria' && <Auditoria />}
      {t === 'tienda' && (
        <div className="card text-sm space-y-2">
          <h3 className="font-semibold">Tienda e inventario</h3>
          <p className="text-muted-foreground">Proteínas, bebidas, indumentaria y accesorios se venden desde <strong>Cantina / Almacén</strong>, que ya maneja productos, compras, stock, mermas y descuenta el stock en cada venta. Usá el botón <strong>Tienda e inventario</strong> de arriba para ir.</p>
        </div>
      )}
    </div>
  );
}

function General() {
  const { api, config, avisar, recargarContexto, permisos } = useGym();
  const [f, setF] = useState({ dias_gracia: config.dias_gracia, exigir_apto_medico: config.exigir_apto_medico, recibo_prefijo: config.recibo_prefijo, nutricion_habilitada: config.nutricion_habilitada });
  const editar = puede(permisos, 'configuracion', 'editar');
  const guardar = async (e) => {
    e.preventDefault();
    try { await api.guardarConfig({ ...f, dias_gracia: Number(f.dias_gracia) }); avisar('ok', 'Configuración guardada.'); recargarContexto(); }
    catch (err) { avisar('err', errMsg(err)); }
  };
  return (
    <form onSubmit={guardar} className="card space-y-3 max-w-lg">
      <Campo label="Días de gracia antes de pasar a moroso" tipo="number" min="0" value={f.dias_gracia} onChange={v => setF({ ...f, dias_gracia: v })} />
      <Campo label="Prefijo de recibos" value={f.recibo_prefijo} maxLength={10} onChange={v => setF({ ...f, recibo_prefijo: v })} />
      <Campo tipo="checkbox" label="Exigir apto médico vigente para ingresar" value={f.exigir_apto_medico} onChange={v => setF({ ...f, exigir_apto_medico: v })} />
      <Campo tipo="checkbox" label="Habilitar módulo de nutrición" value={f.nutricion_habilitada} onChange={v => setF({ ...f, nutricion_habilitada: v })} />
      {editar && <button className="btn-primary btn-sm">Guardar</button>}
    </form>
  );
}

function Roles() {
  const { api, avisar } = useGym();
  const d = useCarga(() => api.roles(), [api]);
  const [edit, setEdit] = useState(null);   // { clave, nombre, permisos, nuevo }
  if (d.cargando && !d.data) return <Cargando />;
  if (d.error) return <ErrorBox>{d.error}</ErrorBox>;
  const { roles, recursos, acciones, colaboradores } = d.data;

  const toggle = (r, a) => setEdit(e => {
    const act = new Set(e.permisos[r] || []);
    act.has(a) ? act.delete(a) : act.add(a);
    return { ...e, permisos: { ...e.permisos, [r]: [...act] } };
  });
  const guardar = async () => {
    try { await api.guardarRol({ clave: edit.clave, nombre: edit.nombre, permisos: edit.permisos }); avisar('ok', 'Rol guardado.'); setEdit(null); d.recargar(); }
    catch (err) { avisar('err', errMsg(err)); }
  };
  const asignar = async (col, clave) => {
    try { await api.asignarRol(col.id, clave || null); avisar('ok', 'Rol asignado.'); d.recargar(); }
    catch (err) { avisar('err', errMsg(err)); }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Roles</h3>
          <button className="btn-outline btn-sm" onClick={() => setEdit({ clave: '', nombre: '', permisos: {}, nuevo: true })}>Nuevo rol</button></div>
        <p className="text-xs text-muted-foreground">El dueño del complejo y el administrador general tienen acceso total. Solo ellos pueden modificar roles.</p>
        <div className="flex flex-wrap gap-2">
          {roles.map(r => <button key={r.id} className="btn-ghost btn-sm border border-border" onClick={() => setEdit({ clave: r.clave, nombre: r.nombre, permisos: r.permisos || {} })}>{r.nombre}</button>)}
        </div>
      </div>

      {edit && (
        <div className="card space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <Campo label="Nombre" value={edit.nombre} onChange={v => setEdit({ ...edit, nombre: v })} />
            <Campo label="Clave (minúsculas)" value={edit.clave} disabled={!edit.nuevo} onChange={v => setEdit({ ...edit, clave: v })} />
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead><tr><th className="text-left p-1">Recurso</th>{acciones.map(a => <th key={a} className="p-1 capitalize">{a}</th>)}</tr></thead>
              <tbody>
                {Object.entries(recursos).map(([r, l]) => (
                  <tr key={r} className="border-t border-border">
                    <td className="p-1">{l}</td>
                    {acciones.map(a => <td key={a} className="text-center p-1"><input type="checkbox" aria-label={`${l}: ${a}`} checked={(edit.permisos[r] || []).includes(a)} onChange={() => toggle(r, a)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2"><button className="btn-primary btn-sm" onClick={guardar}>Guardar rol</button><button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>Cancelar</button></div>
        </div>
      )}

      <div className="card space-y-2">
        <h3 className="font-semibold">Colaboradores</h3>
        {!colaboradores.length ? <p className="text-sm text-muted-foreground">No hay colaboradores. Se crean en la pestaña Colaboradores del panel.</p> : (
          <ul className="divide-y divide-border">
            {colaboradores.map(c => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0"><strong>{c.nombre || c.email}</strong> <span className="text-xs text-muted-foreground">{c.email}</span></span>
                <select className="input text-sm !w-auto" value={c.gym_rol || ''} onChange={e => asignar(c, e.target.value)}>
                  <option value="">Sin acceso al gym</option>{roles.map(r => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Auditoria() {
  const { api } = useGym();
  const [f, setF] = useState({ entidad: '', desde: '', hasta: '' });
  const [q, setQ] = useState(f);
  const [abierto, setAbierto] = useState(null);
  const d = useCarga(() => api.auditoria(Object.fromEntries(Object.entries(q).filter(([, v]) => v))), [api, q]);
  return (
    <div className="space-y-3">
      <form className="card flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setQ(f); }}>
        <Campo label="Entidad" value={f.entidad} placeholder="socio, pago, clase…" onChange={v => setF({ ...f, entidad: v })} />
        <Campo label="Desde" tipo="date" value={f.desde} onChange={v => setF({ ...f, desde: v })} />
        <Campo label="Hasta" tipo="date" value={f.hasta} onChange={v => setF({ ...f, hasta: v })} />
        <button className="btn-primary btn-sm">Filtrar</button>
      </form>
      {d.cargando && !d.data ? <Cargando /> : d.error ? <ErrorBox>{d.error}</ErrorBox> : (
        <Tabla filas={d.data} onRow={r => setAbierto(abierto === r.id ? null : r.id)} columnas={[
          { k: 'created_at', l: 'Fecha', r: x => new Date(x.created_at).toLocaleString('es-AR') },
          { k: 'usuario', l: 'Usuario' }, { k: 'accion', l: 'Acción' },
          { k: 'entidad', l: 'Entidad', r: x => `${x.entidad}${x.entidad_id ? ` #${x.entidad_id}` : ''}` },
          { k: 'ip', l: 'IP' }, { k: 'sucursal_id', l: 'Sucursal' },
          { k: 'detalle', l: 'Detalle', r: x => (x.detalle ? (abierto === x.id
            ? <pre className="text-[10px] whitespace-pre-wrap break-all max-w-xs">{JSON.stringify(x.detalle, null, 1)}</pre>
            : <span className="text-xs text-primary">ver</span>) : '—') },
        ]} />
      )}
    </div>
  );
}
