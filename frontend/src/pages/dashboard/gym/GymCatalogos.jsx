import { useState } from 'react';
import { Plus, Pencil, Trash2, Wrench, AlertTriangle } from 'lucide-react';
import {
  useGym, puede, useCarga, Tabla, Modal, Campo, Cargando, ErrorBox, errMsg, money, num, fechaCorta, hoy,
  TIPOS_ACT, PERIODOS, DIAS, label,
} from '../../../components/gym/GymUI';

/**
 * Catálogos del gym: planes, actividades, profesores (horarios + estadísticas),
 * equipos (mantenimiento y alertas) y sucursales. CrudLista evita repetir el
 * patrón listado + alta/edición + baja en cada uno.
 */
export default function GymCatalogos() {
  const { permisos } = useGym();
  const SECCIONES = [
    ['planes', 'Planes', 'planes', Planes], ['actividades', 'Actividades', 'planes', Actividades],
    ['profesores', 'Profesores', 'profesores', Profesores], ['equipos', 'Equipos', 'equipos', Equipos],
    ['sucursales', 'Sucursales', 'configuracion', Sucursales],
  ].filter(([, , r]) => puede(permisos, r, 'ver'));
  const [sec, setSec] = useState(SECCIONES[0]?.[0]);
  const Actual = SECCIONES.find(s => s[0] === sec)?.[3];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto">
        {SECCIONES.map(([k, l]) => (
          <button key={k} onClick={() => setSec(k)} aria-pressed={sec === k}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${sec === k ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {Actual && <Actual key={sec} />}
    </div>
  );
}

/**
 * Listado + formulario genérico.
 * campos: [{ k, l, tipo?, opciones?, req?, def? }] · columnas: para <Tabla> · extra(form,set): campos especiales
 * aBody(form): transforma antes de enviar · alGuardar(): callback tras guardar/eliminar
 */
function CrudLista({ titulo, servicio, recurso, campos, columnas, extra, aBody = (f) => f, desdeFila = (r) => r, alGuardar, acciones, params }) {
  const { permisos, avisar } = useGym();
  const lista = useCarga(() => servicio.list(params), [servicio, JSON.stringify(params || {})]);
  const [form, setForm] = useState(null);
  const vacio = () => Object.fromEntries(campos.map(c => [c.k, c.def ?? (c.tipo === 'checkbox' ? true : '')]));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault();
    const body = aBody(Object.fromEntries(Object.entries(form).filter(([k]) => k !== 'id').map(([k, v]) => [k, v === '' ? null : v])));
    try {
      if (form.id) await servicio.update(form.id, body); else await servicio.create(body);
      avisar('ok', `${titulo}: guardado.`); setForm(null); lista.recargar(); alGuardar?.();
    } catch (err) { avisar('err', errMsg(err)); }
  };
  const eliminar = async (r) => {
    if (!window.confirm(`¿Eliminar "${r.nombre || r.id}"? Si está en uso se desactiva.`)) return;
    try { const res = await servicio.remove(r.id); avisar('ok', res?.desactivado ? 'Estaba en uso: quedó desactivado.' : 'Eliminado.'); lista.recargar(); alGuardar?.(); } catch (err) { avisar('err', errMsg(err)); }
  };
  const cols = [...columnas, {
    k: '_acc', l: '', cls: 'text-right', r: (r) => (
      <span className="inline-flex gap-1" onClick={e => e.stopPropagation()}>
        {acciones?.(r)}
        {puede(permisos, recurso, 'editar') && <button className="btn-ghost btn-sm !px-2" onClick={() => setForm({ ...vacio(), ...desdeFila(r), id: r.id })} aria-label="Editar"><Pencil className="w-4 h-4" /></button>}
        {puede(permisos, recurso, 'eliminar') && <button className="btn-ghost btn-sm !px-2 !text-danger" onClick={() => eliminar(r)} aria-label="Eliminar"><Trash2 className="w-4 h-4" /></button>}
      </span>
    ),
  }];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{titulo}</h3>
        {puede(permisos, recurso, 'crear') && <button className="btn-primary btn-sm" onClick={() => setForm(vacio())}><Plus className="w-4 h-4" /> Nuevo</button>}
      </div>
      {lista.cargando && !lista.data ? <Cargando /> : <ErrorBox>{lista.error}</ErrorBox>}
      {lista.data && <Tabla filas={lista.data} columnas={cols} />}
      {form && (
        <Modal titulo={`${form.id ? 'Editar' : 'Nuevo'}: ${titulo}`} onClose={() => setForm(null)} ancho="max-w-2xl">
          <form onSubmit={guardar} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              {campos.map(c => <Campo key={c.k} label={c.l} tipo={c.tipo} opciones={c.opciones} req={c.req} value={form[c.k]} onChange={v => set(c.k, v)} className={c.ancho ? 'sm:col-span-2' : ''} {...(c.attrs || {})} />)}
            </div>
            {extra?.(form, set)}
            <button className="btn-primary">Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

const ACTIVO = (r, k = 'activo') => <span className={r[k] ? 'badge-green' : 'badge-neutral'}>{r[k] ? 'Activo' : 'Inactivo'}</span>;

function Planes() {
  const { api } = useGym();
  const acts = useCarga(() => api.actividades.list(), [api]);
  return (
    <CrudLista titulo="Planes y membresías" servicio={api.planes} recurso="planes"
      campos={[
        { k: 'nombre', l: 'Nombre', req: true, attrs: { maxLength: 100 } }, { k: 'tipo', l: 'Tipo', tipo: 'select', opciones: TIPOS_ACT, def: 'libre' },
        { k: 'periodo', l: 'Período', tipo: 'select', opciones: PERIODOS, def: 'mensual', req: true }, { k: 'precio', l: 'Precio', tipo: 'number', req: true, attrs: { min: 0, step: '0.01' } },
        { k: 'descuento_pct', l: 'Descuento %', tipo: 'number', def: 0, attrs: { min: 0, max: 100, step: '0.01' } }, { k: 'clases_por_semana', l: 'Clases por semana (vacío = libre)', tipo: 'number', attrs: { min: 1 } },
        { k: 'hora_desde', l: 'Acceso desde', tipo: 'time' }, { k: 'hora_hasta', l: 'Acceso hasta', tipo: 'time' },
        { k: 'descripcion', l: 'Descripción', ancho: true, attrs: { maxLength: 255 } }, { k: 'activo', l: 'Activo', tipo: 'checkbox' },
      ]}
      desdeFila={r => ({ ...r, actividad_ids: r.actividades?.map(a => a.id) || [] })}
      aBody={f => ({ ...f, actividad_ids: f.actividad_ids || [] })}
      extra={(f, set) => (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Actividades permitidas (ninguna = todas)</legend>
          <div className="flex flex-wrap gap-3">
            {(acts.data || []).map(a => (
              <label key={a.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={(f.actividad_ids || []).includes(a.id)}
                  onChange={e => set('actividad_ids', e.target.checked ? [...(f.actividad_ids || []), a.id] : (f.actividad_ids || []).filter(x => x !== a.id))} />{a.nombre}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      columnas={[
        { k: 'nombre', l: 'Plan', r: r => <span className="font-medium">{r.nombre}</span> },
        { k: 'tipo', l: 'Tipo', r: r => label(TIPOS_ACT, r.tipo) }, { k: 'periodo', l: 'Período', r: r => label(PERIODOS, r.periodo) },
        { k: 'precio', l: 'Precio', r: r => (Number(r.descuento_pct) > 0 ? <><s className="text-muted-foreground">{money(r.precio)}</s> {money(r.precio * (1 - r.descuento_pct / 100))}</> : money(r.precio)) },
        { k: 'horario', l: 'Horario', r: r => (r.hora_desde ? `${r.hora_desde}–${r.hora_hasta}` : 'Libre') },
        { k: 'actividades', l: 'Actividades', r: r => (r.actividades?.length ? r.actividades.map(a => a.nombre).join(', ') : 'Todas') },
        { k: 'activo', l: 'Estado', r: r => ACTIVO(r) },
      ]} />
  );
}

function Actividades() {
  const { api } = useGym();
  return (
    <CrudLista titulo="Actividades" servicio={api.actividades} recurso="planes"
      campos={[
        { k: 'nombre', l: 'Nombre', req: true, attrs: { maxLength: 100 } }, { k: 'tipo', l: 'Tipo', tipo: 'select', opciones: TIPOS_ACT, def: 'libre' },
        { k: 'color', l: 'Color', tipo: 'color', def: '#3987e5' }, { k: 'activa', l: 'Activa', tipo: 'checkbox' },
        { k: 'descripcion', l: 'Descripción', ancho: true, attrs: { maxLength: 255 } },
      ]}
      columnas={[
        { k: 'nombre', l: 'Actividad', r: r => <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: r.color || '#3987e5' }} />{r.nombre}</span> },
        { k: 'tipo', l: 'Tipo', r: r => label(TIPOS_ACT, r.tipo) }, { k: 'activa', l: 'Estado', r: r => ACTIVO(r, 'activa') },
      ]} />
  );
}

function Profesores() {
  const { api, sucursales } = useGym();
  const [desde, setDesde] = useState(`${hoy().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy());
  const stats = useCarga(() => api.statsProfesores({ desde, hasta }), [api, desde, hasta]);
  const ROLES = [['profesor', 'Profesor'], ['personal_trainer', 'Personal trainer'], ['nutricionista', 'Nutricionista']];
  return (
    <div className="space-y-6">
      <CrudLista titulo="Profesores" servicio={api.profesores} recurso="profesores" alGuardar={stats.recargar}
        campos={[
          { k: 'nombre', l: 'Nombre', req: true, attrs: { maxLength: 100 } }, { k: 'apellido', l: 'Apellido', req: true, attrs: { maxLength: 100 } },
          { k: 'dni', l: 'DNI', attrs: { maxLength: 15 } }, { k: 'rol', l: 'Rol', tipo: 'select', opciones: ROLES, def: 'profesor' },
          { k: 'telefono', l: 'Teléfono', attrs: { maxLength: 30 } }, { k: 'email', l: 'Email', tipo: 'email' },
          { k: 'especialidad', l: 'Especialidad', attrs: { maxLength: 150 } }, { k: 'valor_hora', l: 'Valor hora', tipo: 'number', def: 0, attrs: { min: 0 } },
          { k: 'comision_pct', l: 'Comisión %', tipo: 'number', def: 0, attrs: { min: 0, max: 100 } }, { k: 'activo', l: 'Activo', tipo: 'checkbox' },
          { k: 'certificaciones', l: 'Certificaciones', tipo: 'textarea', ancho: true },
        ]}
        desdeFila={r => ({ ...r, horarios: (r.horarios || []).map(h => ({ dia_semana: h.dia_semana, hora_desde: h.hora_desde, hora_hasta: h.hora_hasta, sucursal_id: h.sucursal_id || '' })) })}
        aBody={f => ({ ...f, horarios: (f.horarios || []).map(h => ({ ...h, dia_semana: Number(h.dia_semana), sucursal_id: h.sucursal_id || null })) })}
        extra={(f, set) => {
          const hs = f.horarios || [];
          const setH = (i, k, v) => set('horarios', hs.map((h, j) => (j === i ? { ...h, [k]: v } : h)));
          return (
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Horarios</legend>
              {hs.map((h, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                  <Campo label="Día" tipo="select" value={h.dia_semana} onChange={v => setH(i, 'dia_semana', v)} opciones={DIAS.map((d, j) => [j, d])} />
                  <Campo label="Desde" tipo="time" value={h.hora_desde} onChange={v => setH(i, 'hora_desde', v)} req />
                  <Campo label="Hasta" tipo="time" value={h.hora_hasta} onChange={v => setH(i, 'hora_hasta', v)} req />
                  <Campo label="Sucursal" tipo="select" value={h.sucursal_id} onChange={v => setH(i, 'sucursal_id', v)} opciones={[['', '—'], ...sucursales.map(s => [s.id, s.nombre])]} />
                  <button type="button" className="btn-ghost btn-sm !text-danger" onClick={() => set('horarios', hs.filter((_, j) => j !== i))} aria-label="Quitar horario"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={() => set('horarios', [...hs, { dia_semana: 1, hora_desde: '08:00', hora_hasta: '12:00', sucursal_id: '' }])}><Plus className="w-4 h-4" /> Horario</button>
            </fieldset>
          );
        }}
        columnas={[
          { k: 'nombre', l: 'Profesor', r: r => <span className="font-medium">{r.apellido}, {r.nombre}</span> },
          { k: 'rol', l: 'Rol', r: r => label(ROLES, r.rol) }, { k: 'especialidad', l: 'Especialidad' },
          { k: 'valor_hora', l: 'Valor hora', r: r => money(r.valor_hora) },
          { k: 'horarios', l: 'Horarios', r: r => (r.horarios?.length ? r.horarios.map(h => `${DIAS[h.dia_semana]} ${h.hora_desde}-${h.hora_hasta}`).join(' · ') : '—') },
          { k: 'activo', l: 'Estado', r: r => ACTIVO(r) },
        ]} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <h3 className="font-semibold mr-auto">Estadísticas de profesores</h3>
          <Campo label="Desde" tipo="date" value={desde} onChange={setDesde} /><Campo label="Hasta" tipo="date" value={hasta} onChange={setHasta} />
        </div>
        {stats.cargando && !stats.data ? <Cargando /> : <ErrorBox>{stats.error}</ErrorBox>}
        {stats.data && <Tabla filas={stats.data.profesores} vacio="Sin profesores." columnas={[
          { k: 'nombre', l: 'Profesor', r: p => `${p.apellido}, ${p.nombre}` }, { k: 'clases', l: 'Clases dictadas', r: p => num(p.clases) },
          { k: 'horas', l: 'Horas', r: p => num(p.horas) }, { k: 'asistentes', l: 'Asistentes', r: p => num(p.asistentes) },
          { k: 'pct_asistencia', l: 'Asistencia', r: p => `${p.pct_asistencia}%` }, { k: 'liquidacion_horas', l: 'Liquidación (horas × valor)', r: p => money(p.liquidacion_horas) },
        ]} />}
      </div>
    </div>
  );
}

function Equipos() {
  const { api, sucursales, permisos, avisar } = useGym();
  const alertas = useCarga(() => api.alertas().then(a => a.equipos), [api]);
  const [detalle, setDetalle] = useState(null);
  const ESTADOS = [['operativo', 'Operativo'], ['mantenimiento', 'En mantenimiento'], ['fuera_servicio', 'Fuera de servicio'], ['baja', 'Baja']];
  const TIPOS = [['maquina', 'Máquina'], ['cinta', 'Cinta'], ['bicicleta', 'Bicicleta'], ['equipamiento', 'Equipamiento'], ['otro', 'Otro']];
  const BADGE = { operativo: 'badge-green', mantenimiento: 'badge-yellow', fuera_servicio: 'badge-red', baja: 'badge-neutral' };
  return (
    <div className="space-y-4">
      {alertas.data?.length > 0 && (
        <ul className="space-y-1.5">
          {alertas.data.map((a, i) => (
            <li key={i} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${a.nivel === 'critico' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10'}`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.nivel === 'critico' ? 'text-danger' : 'text-warning'}`} aria-hidden />{a.mensaje}
            </li>
          ))}
        </ul>
      )}
      <CrudLista titulo="Equipos" servicio={api.equipos} recurso="equipos" alGuardar={alertas.recargar}
        campos={[
          { k: 'nombre', l: 'Nombre', req: true, attrs: { maxLength: 150 } }, { k: 'tipo', l: 'Tipo', tipo: 'select', opciones: TIPOS, def: 'maquina' },
          { k: 'sucursal_id', l: 'Sucursal', tipo: 'select', opciones: [['', '—'], ...sucursales.map(s => [s.id, s.nombre])] },
          { k: 'estado', l: 'Estado', tipo: 'select', opciones: ESTADOS, def: 'operativo' },
          { k: 'marca', l: 'Marca', attrs: { maxLength: 100 } }, { k: 'modelo', l: 'Modelo', attrs: { maxLength: 100 } }, { k: 'nro_serie', l: 'N° de serie', attrs: { maxLength: 100 } },
          { k: 'fecha_compra', l: 'Fecha de compra', tipo: 'date' }, { k: 'garantia_hasta', l: 'Garantía hasta', tipo: 'date' },
          { k: 'frecuencia_mant_dias', l: 'Mantenimiento cada (días)', tipo: 'number', attrs: { min: 1 } }, { k: 'ultimo_mantenimiento', l: 'Último mantenimiento', tipo: 'date' },
        ]}
        acciones={r => <button className="btn-ghost btn-sm !px-2" onClick={() => setDetalle(r)} aria-label="Mantenimiento"><Wrench className="w-4 h-4" /></button>}
        columnas={[
          { k: 'nombre', l: 'Equipo', r: r => <span className="font-medium">{r.nombre}</span> }, { k: 'tipo', l: 'Tipo', r: r => label(TIPOS, r.tipo) },
          { k: 'sucursal', l: 'Sucursal', r: r => r.sucursal?.nombre || '—' }, { k: 'ultimo_mantenimiento', l: 'Último mant.', r: r => fechaCorta(r.ultimo_mantenimiento) },
          { k: 'garantia_hasta', l: 'Garantía', r: r => fechaCorta(r.garantia_hasta) },
          { k: 'estado', l: 'Estado', r: r => <span className={BADGE[r.estado]}>{label(ESTADOS, r.estado)}</span> },
        ]} />
      {detalle && <EventosEquipo equipo={detalle} onClose={() => { setDetalle(null); alertas.recargar(); }} api={api} puedeEditar={puede(permisos, 'equipos', 'editar')} avisar={avisar} />}
    </div>
  );
}

function EventosEquipo({ equipo, onClose, api, puedeEditar, avisar }) {
  const ev = useCarga(() => api.eventosEquipo(equipo.id), [api, equipo.id]);
  const [f, setF] = useState({ tipo: 'mantenimiento', fecha: hoy(), descripcion: '', costo: '', proveedor: '', cerrar: false });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault();
    try { await api.eventoEquipo(equipo.id, { ...f, costo: f.costo || 0, proveedor: f.proveedor || null }); avisar('ok', 'Evento registrado.'); setF(x => ({ ...x, descripcion: '', costo: '' })); ev.recargar(); } catch (err) { avisar('err', errMsg(err)); }
  };
  return (
    <Modal titulo={`Mantenimiento: ${equipo.nombre}`} onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4">
        {puedeEditar && (
          <form onSubmit={guardar} className="grid sm:grid-cols-2 gap-3">
            <Campo label="Tipo" tipo="select" value={f.tipo} onChange={v => set('tipo', v)} opciones={[['mantenimiento', 'Mantenimiento'], ['reparacion', 'Reparación'], ['garantia', 'Garantía']]} />
            <Campo label="Fecha" tipo="date" value={f.fecha} onChange={v => set('fecha', v)} />
            <Campo label="Descripción" req value={f.descripcion} onChange={v => set('descripcion', v)} className="sm:col-span-2" maxLength={255} />
            <Campo label="Costo" tipo="number" min="0" value={f.costo} onChange={v => set('costo', v)} />
            <Campo label="Proveedor" value={f.proveedor} onChange={v => set('proveedor', v)} maxLength={150} />
            {f.tipo === 'reparacion' && <Campo label="Reparación terminada (vuelve a operativo)" tipo="checkbox" value={f.cerrar} onChange={v => set('cerrar', v)} className="sm:col-span-2" />}
            <button className="btn-primary sm:col-span-2">Registrar</button>
          </form>
        )}
        {ev.cargando && !ev.data ? <Cargando /> : (
          <Tabla filas={ev.data || []} vacio="Sin eventos registrados." columnas={[
            { k: 'fecha', l: 'Fecha', r: x => fechaCorta(x.fecha) }, { k: 'tipo', l: 'Tipo' }, { k: 'descripcion', l: 'Descripción' },
            { k: 'proveedor', l: 'Proveedor' }, { k: 'costo', l: 'Costo', r: x => money(x.costo) },
          ]} />
        )}
      </div>
    </Modal>
  );
}

function Sucursales() {
  const { api, recargarContexto } = useGym();
  return (
    <CrudLista titulo="Sucursales" servicio={api.sucursales} recurso="configuracion" alGuardar={recargarContexto}
      campos={[
        { k: 'nombre', l: 'Nombre', req: true, attrs: { maxLength: 100 } }, { k: 'telefono', l: 'Teléfono', attrs: { maxLength: 30 } },
        { k: 'direccion', l: 'Dirección', ancho: true, attrs: { maxLength: 200 } }, { k: 'activa', l: 'Activa', tipo: 'checkbox' },
      ]}
      columnas={[
        { k: 'nombre', l: 'Sucursal', r: r => <span className="font-medium">{r.nombre}</span> }, { k: 'direccion', l: 'Dirección' },
        { k: 'telefono', l: 'Teléfono' }, { k: 'activa', l: 'Estado', r: r => ACTIVO(r, 'activa') },
      ]} />
  );
}
