import { useState, useCallback } from 'react';
import { Plus, Search, Copy, ExternalLink, Trash2, Ban, UserCog } from 'lucide-react';
import {
  useGym, puede, Modal, Campo, Tabla, Kpi, Linea, EstadoBadge, money, fechaCorta, nombre, hoy, sumarDias,
  useCarga, Cargando, Vacio, ErrorBox, METODOS, ESTADO_SOCIO, errMsg, label,
} from '../../../components/gym/GymUI';

/**
 * Gym → Socios: listado con filtros y ficha completa (datos, plan y pagos, apto,
 * QR, historial, evaluaciones, rutinas y nutrición).
 */
const VACIO = {
  nombre: '', apellido: '', dni: '', fecha_nacimiento: '', sexo: '', sucursal_id: '', foto_url: '', direccion: '', localidad: '',
  provincia: '', telefono: '', whatsapp: '', email: '', emergencia_nombre: '', emergencia_telefono: '', obra_social: '', observaciones: '',
};
const ESTADOS = Object.entries(ESTADO_SOCIO).map(([v, [l]]) => [v, l]);

export default function GymSocios() {
  const { api, permisos, sucursales } = useGym();
  const [f, setF] = useState({ q: '', estado: '', sucursal_id: '', pagina: 1 });
  const [qTxt, setQTxt] = useState('');
  const lista = useCarga(() => api.socios({ ...f, limite: 30 }), [api, f.q, f.estado, f.sucursal_id, f.pagina]);
  const [nuevo, setNuevo] = useState(false);
  const [fichaId, setFichaId] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v, pagina: k === 'pagina' ? v : 1 }));
  const d = lista.data;
  const paginas = d ? Math.max(1, Math.ceil(d.total / d.limite)) : 1;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); set('q', qTxt.trim()); }}>
          <label className="flex-1 min-w-[12rem]"><span className="text-xs text-muted-foreground">Buscar</span>
            <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="input text-sm !pl-8" placeholder="Nombre, apellido, DNI o código" value={qTxt} onChange={e => setQTxt(e.target.value)} /></div></label>
          <Campo label="Estado" tipo="select" value={f.estado} onChange={v => set('estado', v)} opciones={[['', 'Todos'], ...ESTADOS]} className="w-36" />
          {sucursales.length > 1 && <Campo label="Sucursal" tipo="select" value={f.sucursal_id} onChange={v => set('sucursal_id', v)} opciones={[['', 'Todas'], ...sucursales.map(s => [s.id, s.nombre])]} className="w-40" />}
          <button className="btn-outline text-sm">Buscar</button>
          {puede(permisos, 'socios', 'crear') && <button type="button" className="btn-primary text-sm ml-auto" onClick={() => setNuevo(true)}><Plus className="w-4 h-4" /> Nuevo socio</button>}
        </form>
      </div>
      <ErrorBox>{lista.error}</ErrorBox>
      {lista.cargando && !d ? <Cargando /> : d && (
        <>
          <Tabla filas={d.socios} onRow={s => setFichaId(s.id)} vacio="No hay socios con esos filtros." columnas={[
            { k: 'nombre', l: 'Socio', r: s => <span className="font-medium">{nombre(s)}</span> },
            { k: 'dni', l: 'DNI' }, { k: 'codigo', l: 'Código' },
            { k: 'estado', l: 'Estado', r: s => <EstadoBadge estado={s.estado} /> },
            { k: 'vence', l: 'Vence', r: s => (s.vence ? <span className={s.vence < hoy() ? 'text-danger' : ''}>{fechaCorta(s.vence)}</span> : '—') },
            { k: 'whatsapp', l: 'WhatsApp', r: s => s.whatsapp || s.telefono || '—' },
          ]} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{d.total} socio(s)</span>
            {paginas > 1 && <span className="flex gap-2 items-center">
              <button className="btn-ghost btn-sm" disabled={f.pagina <= 1} onClick={() => set('pagina', f.pagina - 1)}>Anterior</button>
              {f.pagina} / {paginas}
              <button className="btn-ghost btn-sm" disabled={f.pagina >= paginas} onClick={() => set('pagina', f.pagina + 1)}>Siguiente</button>
            </span>}
          </div>
        </>
      )}
      {nuevo && <Modal titulo="Nuevo socio" ancho="max-w-2xl" onClose={() => setNuevo(false)}>
        <SocioForm onGuardado={(s) => { setNuevo(false); lista.recargar(); setFichaId(s.id); }} />
      </Modal>}
      {fichaId && <Modal titulo="Ficha del socio" ancho="max-w-4xl" onClose={() => { setFichaId(null); lista.recargar(); }}>
        <Ficha id={fichaId} />
      </Modal>}
    </div>
  );
}

function SocioForm({ inicial, onGuardado }) {
  const { api, sucursales, avisar } = useGym();
  const [s, setS] = useState(() => ({ ...VACIO, ...Object.fromEntries(Object.keys(VACIO).map(k => [k, inicial?.[k] ?? ''])) }));
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (v) => setS(x => ({ ...x, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault(); setGuardando(true);
    try {
      const body = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === '' ? null : v]));
      const r = inicial ? await api.actualizarSocio(inicial.id, body) : await api.crearSocio(body);
      avisar('ok', inicial ? 'Datos guardados.' : 'Socio creado.');
      onGuardado(r);
    } catch (err) { avisar('err', errMsg(err)); } finally { setGuardando(false); }
  };
  return (
    <form onSubmit={guardar} className="grid sm:grid-cols-2 gap-3">
      <Campo label="Nombre" req value={s.nombre} onChange={set('nombre')} />
      <Campo label="Apellido" req value={s.apellido} onChange={set('apellido')} />
      <Campo label="DNI" req value={s.dni} onChange={set('dni')} inputMode="numeric" />
      <Campo label="Fecha de nacimiento" tipo="date" value={s.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
      <Campo label="Sexo" tipo="select" value={s.sexo} onChange={set('sexo')} opciones={[['', '—'], ['F', 'Femenino'], ['M', 'Masculino'], ['X', 'X']]} />
      {sucursales.length > 0 && <Campo label="Sucursal" tipo="select" value={s.sucursal_id} onChange={set('sucursal_id')} opciones={[['', '—'], ...sucursales.map(x => [x.id, x.nombre])]} />}
      <Campo label="Teléfono" value={s.telefono} onChange={set('telefono')} />
      <Campo label="WhatsApp" value={s.whatsapp} onChange={set('whatsapp')} />
      <Campo label="Email" tipo="email" value={s.email} onChange={set('email')} />
      <Campo label="Foto (URL)" value={s.foto_url} onChange={set('foto_url')} />
      <Campo label="Dirección" value={s.direccion} onChange={set('direccion')} />
      <Campo label="Localidad" value={s.localidad} onChange={set('localidad')} />
      <Campo label="Provincia" value={s.provincia} onChange={set('provincia')} />
      <Campo label="Obra social" value={s.obra_social} onChange={set('obra_social')} />
      <Campo label="Contacto de emergencia" value={s.emergencia_nombre} onChange={set('emergencia_nombre')} />
      <Campo label="Teléfono de emergencia" value={s.emergencia_telefono} onChange={set('emergencia_telefono')} />
      <Campo label="Observaciones" tipo="textarea" value={s.observaciones} onChange={set('observaciones')} className="sm:col-span-2" />
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  );
}

const TABS = [['datos', 'Datos'], ['plan', 'Plan y pagos'], ['apto', 'Apto médico'], ['qr', 'QR'], ['historial', 'Historial'], ['evaluaciones', 'Evaluaciones'], ['rutinas', 'Rutinas'], ['nutricion', 'Nutrición']];

function Ficha({ id }) {
  const { api, permisos, config, avisar } = useGym();
  const ficha = useCarga(() => api.socio(id), [api, id]);
  const [tab, setTab] = useState('datos');
  const [estado, setEstado] = useState(null);
  if (ficha.cargando && !ficha.data) return <Cargando />;
  if (ficha.error) return <ErrorBox>{ficha.error}</ErrorBox>;
  const { socio } = ficha.data;
  const tabs = TABS.filter(([k]) => (k !== 'nutricion' || config?.nutricion_habilitada) && (k !== 'evaluaciones' || puede(permisos, 'evaluaciones'))
    && (k !== 'rutinas' || puede(permisos, 'rutinas')) && (k !== 'nutricion' || puede(permisos, 'nutricion')) && (k !== 'plan' || puede(permisos, 'cobranzas')));

  const cambiarEstado = async () => {
    if (!window.confirm(`¿Pasar a ${nombre(socio)} a "${label(ESTADOS, estado.estado)}"?`)) return;
    try { await api.estadoSocio(id, estado.estado, estado.motivo || undefined); avisar('ok', 'Estado actualizado.'); setEstado(null); ficha.recargar(); }
    catch (e) { avisar('err', errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {socio.foto_url && <img src={socio.foto_url} alt="" className="w-14 h-14 rounded-full object-cover" />}
        <div className="mr-auto min-w-0">
          <div className="text-lg font-bold truncate">{nombre(socio)}</div>
          <div className="text-xs text-muted-foreground">DNI {socio.dni} · Código {socio.codigo}{socio.sucursal ? ` · ${socio.sucursal.nombre}` : ''}</div>
        </div>
        <EstadoBadge estado={socio.estado} />
        {puede(permisos, 'socios', 'aprobar') && <button className="btn-outline btn-sm" onClick={() => setEstado({ estado: socio.estado, motivo: '' })}><UserCog className="w-4 h-4" /> Estado</button>}
      </div>
      {estado && (
        <div className="rounded-lg border border-border p-3 flex flex-wrap gap-2 items-end">
          <Campo label="Nuevo estado" tipo="select" value={estado.estado} onChange={v => setEstado(x => ({ ...x, estado: v }))} opciones={ESTADOS} className="w-40" />
          <Campo label="Motivo" value={estado.motivo} onChange={v => setEstado(x => ({ ...x, motivo: v }))} className="flex-1 min-w-[10rem]" />
          <button className="btn-primary btn-sm" disabled={estado.estado === socio.estado} onClick={cambiarEstado}>Aplicar</button>
          <button className="btn-ghost btn-sm" onClick={() => setEstado(null)}>Cancelar</button>
        </div>
      )}
      <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3 py-1 rounded-full text-xs border ${tab === k ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </nav>
      {tab === 'datos' && (puede(permisos, 'socios', 'editar')
        ? <SocioForm inicial={socio} onGuardado={() => ficha.recargar()} />
        : <DatosLectura socio={socio} />)}
      {tab === 'plan' && <PlanPagos ficha={ficha.data} recargar={ficha.recargar} />}
      {tab === 'apto' && <Apto ficha={ficha.data} recargar={ficha.recargar} />}
      {tab === 'qr' && <QrSocio id={id} />}
      {tab === 'historial' && <Tabla filas={ficha.data.historial} vacio="Sin movimientos." columnas={[
        { k: 'created_at', l: 'Fecha', r: h => new Date(h.created_at || h.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) },
        { k: 'tipo', l: 'Tipo', r: h => <span className="badge-neutral capitalize">{h.tipo}</span> }, { k: 'descripcion', l: 'Detalle' },
      ]} />}
      {tab === 'evaluaciones' && <Evaluaciones socioId={id} />}
      {tab === 'rutinas' && <RutinasSocio socioId={id} />}
      {tab === 'nutricion' && <Nutricion socioId={id} />}
    </div>
  );
}

function DatosLectura({ socio }) {
  const filas = [['Nacimiento', fechaCorta(socio.fecha_nacimiento)], ['Teléfono', socio.telefono], ['WhatsApp', socio.whatsapp], ['Email', socio.email],
    ['Dirección', [socio.direccion, socio.localidad, socio.provincia].filter(Boolean).join(', ')], ['Obra social', socio.obra_social],
    ['Emergencia', [socio.emergencia_nombre, socio.emergencia_telefono].filter(Boolean).join(' · ')], ['Observaciones', socio.observaciones]];
  return <dl className="grid sm:grid-cols-2 gap-2 text-sm">{filas.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
}

function PlanPagos({ ficha, recargar }) {
  const { api, permisos, avisar } = useGym();
  const { socio, vigente, membresias, pagos, cuenta } = ficha;
  const planes = useCarga(() => api.planes.list({ activo: true }), [api]);
  const [asig, setAsig] = useState({ plan_id: '', descuento: '', fecha_inicio: '' });
  const [pago, setPago] = useState({ monto: '', metodo: 'efectivo', membresia_id: '', concepto: '' });
  const [ocupado, setOcupado] = useState(false);
  const correr = async (fn, ok) => { setOcupado(true); try { await fn(); avisar('ok', ok); recargar(); } catch (e) { avisar('err', errMsg(e)); } finally { setOcupado(false); } };
  const pagadoDe = (mid) => pagos.filter(p => p.membresia_id === mid && !p.anulado).reduce((s, p) => s + Number(p.monto), 0);
  const puedeCobrar = puede(permisos, 'cobranzas', 'crear');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Plan vigente" valor={vigente?.plan?.nombre || 'Sin plan'} sub={vigente ? `hasta ${fechaCorta(vigente.fecha_fin)}` : undefined} />
        <Kpi label="Total facturado" valor={money(cuenta.debe)} />
        <Kpi label="Pagado" valor={money(cuenta.pagado)} />
        <Kpi label="Saldo" valor={money(cuenta.saldo)} tono={cuenta.saldo > 0 ? 'text-danger' : ''} sub={cuenta.saldo > 0 ? 'adeuda' : 'al día'} />
      </div>
      {puedeCobrar && (
        <div className="grid md:grid-cols-2 gap-3">
          <form className="card space-y-2" onSubmit={e => { e.preventDefault(); correr(() => api.asignarPlan(socio.id, { plan_id: Number(asig.plan_id), ...(asig.descuento !== '' && { descuento: Number(asig.descuento) }), ...(asig.fecha_inicio && { fecha_inicio: asig.fecha_inicio }) }), vigente ? 'Plan renovado.' : 'Plan asignado.').then(() => setAsig({ plan_id: '', descuento: '', fecha_inicio: '' })); }}>
            <div className="font-semibold text-sm">{vigente ? 'Renovar / cambiar plan' : 'Asignar plan'}</div>
            <Campo label="Plan" req tipo="select" value={asig.plan_id} onChange={v => setAsig(x => ({ ...x, plan_id: v }))}
              opciones={[['', 'Elegí un plan'], ...(planes.data || []).map(p => [p.id, `${p.nombre} · ${money(p.precio)}${Number(p.descuento_pct) ? ` (−${Number(p.descuento_pct)}%)` : ''}`])]} />
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Descuento $ (opcional)" tipo="number" min="0" value={asig.descuento} onChange={v => setAsig(x => ({ ...x, descuento: v }))} />
              <Campo label="Inicio (opcional)" tipo="date" value={asig.fecha_inicio} onChange={v => setAsig(x => ({ ...x, fecha_inicio: v }))} />
            </div>
            <p className="hint">Sin fecha: empieza hoy, o al día siguiente del vencimiento del plan vigente.</p>
            <button className="btn-primary btn-sm" disabled={ocupado || !asig.plan_id}>Confirmar</button>
          </form>
          <form className="card space-y-2" onSubmit={e => { e.preventDefault(); correr(() => api.pagar(socio.id, { monto: Number(pago.monto), metodo: pago.metodo, ...(pago.membresia_id && { membresia_id: Number(pago.membresia_id) }), ...(pago.concepto && { concepto: pago.concepto }) }), 'Pago registrado.').then(() => setPago(x => ({ ...x, monto: '', concepto: '' }))); }}>
            <div className="font-semibold text-sm">Registrar pago</div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Monto" req tipo="number" min="1" step="0.01" value={pago.monto} onChange={v => setPago(x => ({ ...x, monto: v }))} />
              <Campo label="Medio" tipo="select" value={pago.metodo} onChange={v => setPago(x => ({ ...x, metodo: v }))} opciones={METODOS} />
            </div>
            <Campo label="Imputar a" tipo="select" value={pago.membresia_id} onChange={v => {
              const m = membresias.find(x => String(x.id) === v);
              setPago(x => ({ ...x, membresia_id: v, ...(m && !x.monto && { monto: String(Math.max(0, Number(m.total) - pagadoDe(m.id))) }) }));
            }} opciones={[['', 'Pago a cuenta'], ...membresias.filter(m => m.estado !== 'cancelada').map(m => [m.id, `${m.plan?.nombre} ${fechaCorta(m.fecha_inicio)}–${fechaCorta(m.fecha_fin)} · ${money(m.total)}`])]} />
            <Campo label="Concepto (opcional)" value={pago.concepto} onChange={v => setPago(x => ({ ...x, concepto: v }))} />
            <button className="btn-primary btn-sm" disabled={ocupado || !(Number(pago.monto) > 0)}>Cobrar</button>
          </form>
        </div>
      )}
      <div>
        <h4 className="text-sm font-semibold mb-2">Membresías</h4>
        <Tabla filas={membresias} vacio="Sin membresías." columnas={[
          { k: 'plan', l: 'Plan', r: m => m.plan?.nombre },
          { k: 'fecha_inicio', l: 'Período', r: m => `${fechaCorta(m.fecha_inicio)} – ${fechaCorta(m.fecha_fin)}` },
          { k: 'total', l: 'Total', r: m => money(m.total) },
          { k: 'pagado', l: 'Pagado', r: m => money(pagadoDe(m.id)) },
          { k: 'estado', l: 'Estado', r: m => <span className={{ vigente: 'badge-green', vencida: 'badge-neutral', cancelada: 'badge-red', congelada: 'badge-blue' }[m.estado]}>{m.estado}</span> },
          { k: 'acc', l: '', r: m => (puede(permisos, 'cobranzas', 'eliminar') && m.estado !== 'cancelada' && pagadoDe(m.id) === 0
            ? <button className="btn-ghost btn-sm !text-danger" onClick={() => window.confirm('¿Cancelar esta membresía?') && correr(() => api.cancelarMembresia(m.id), 'Membresía cancelada.')}><Trash2 className="w-4 h-4" /></button> : null) },
        ]} />
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Pagos</h4>
        <Tabla filas={pagos} vacio="Sin pagos." columnas={[
          { k: 'fecha', l: 'Fecha', r: p => fechaCorta(p.fecha) }, { k: 'numero_recibo', l: 'Recibo' }, { k: 'concepto', l: 'Concepto' },
          { k: 'metodo', l: 'Medio', r: p => label(METODOS, p.metodo) },
          { k: 'monto', l: 'Monto', r: p => <span className={p.anulado ? 'line-through text-muted-foreground' : 'font-medium'}>{money(p.monto)}</span> },
          { k: 'acc', l: '', r: p => (p.anulado ? <span className="badge-red">Anulado</span> : puede(permisos, 'cobranzas', 'aprobar')
            ? <button className="btn-ghost btn-sm !text-danger" title="Anular" onClick={() => { const motivo = window.prompt('Motivo de la anulación'); if (motivo !== null) correr(() => api.anularPago(p.id, motivo), 'Pago anulado.'); }}><Ban className="w-4 h-4" /></button> : null) },
        ]} />
      </div>
    </div>
  );
}

function Apto({ ficha, recargar }) {
  const { api, permisos, avisar } = useGym();
  const [a, setA] = useState({ fecha_emision: hoy(), fecha_vencimiento: sumarDias(hoy(), 365), profesional: '', observaciones: '' });
  const guardar = async (e) => {
    e.preventDefault();
    try { await api.aptoSocio(ficha.socio.id, a); avisar('ok', 'Apto médico cargado.'); recargar(); } catch (err) { avisar('err', errMsg(err)); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">Estado: {ficha.apto_vigente ? <span className="badge-green">Vigente</span> : <span className="badge-red">Vencido o faltante</span>}</p>
      {puede(permisos, 'socios', 'editar') && (
        <form onSubmit={guardar} className="card grid sm:grid-cols-4 gap-2 items-end">
          <Campo label="Emisión" req tipo="date" value={a.fecha_emision} onChange={v => setA(x => ({ ...x, fecha_emision: v }))} />
          <Campo label="Vencimiento" req tipo="date" value={a.fecha_vencimiento} onChange={v => setA(x => ({ ...x, fecha_vencimiento: v }))} />
          <Campo label="Profesional" value={a.profesional} onChange={v => setA(x => ({ ...x, profesional: v }))} />
          <button className="btn-primary btn-sm">Cargar apto</button>
        </form>
      )}
      <Tabla filas={ficha.aptos} vacio="Sin aptos cargados." columnas={[
        { k: 'fecha_emision', l: 'Emisión', r: x => fechaCorta(x.fecha_emision) },
        { k: 'fecha_vencimiento', l: 'Vence', r: x => <span className={x.fecha_vencimiento < hoy() ? 'text-danger' : ''}>{fechaCorta(x.fecha_vencimiento)}</span> },
        { k: 'profesional', l: 'Profesional' },
      ]} />
    </div>
  );
}

function QrSocio({ id }) {
  const { api, avisar } = useGym();
  const qr = useCarga(() => api.qrSocio(id), [api, id]);
  if (qr.cargando) return <Cargando />;
  if (qr.error) return <ErrorBox>{qr.error}</ErrorBox>;
  const copiar = async () => { try { await navigator.clipboard.writeText(qr.data.link); avisar('ok', 'Link copiado.'); } catch { avisar('err', 'No se pudo copiar.'); } };
  return (
    <div className="flex flex-col sm:flex-row gap-5 items-center">
      <img src={qr.data.qr} alt="QR del socio" className="w-56 h-56 rounded-lg bg-white p-2" />
      <div className="space-y-2 min-w-0 w-full">
        <div className="text-sm text-muted-foreground">Código de acceso</div>
        <div className="text-3xl font-bold tracking-widest">{qr.data.codigo}</div>
        <div className="text-sm text-muted-foreground">App del socio (cuotas, reservas, rutinas)</div>
        <div className="text-xs break-all bg-muted rounded p-2">{qr.data.link}</div>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm" onClick={copiar}><Copy className="w-4 h-4" /> Copiar link</button>
          <a className="btn-outline btn-sm" href={qr.data.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /> Abrir</a>
        </div>
      </div>
    </div>
  );
}

const EVAL_VACIA = { fecha: '', peso: '', altura: '', grasa_pct: '', masa_muscular: '', cintura: '', cadera: '', pecho: '', brazo: '', pierna: '', notas: '' };
function Evaluaciones({ socioId }) {
  const { api, permisos, avisar } = useGym();
  const lista = useCarga(() => api.evaluaciones(socioId), [api, socioId]);
  const [e, setE] = useState(EVAL_VACIA);
  const set = (k) => (v) => setE(x => ({ ...x, [k]: v }));
  const guardar = async (ev) => {
    ev.preventDefault();
    const body = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== '').map(([k, v]) => [k, ['fecha', 'notas'].includes(k) ? v : Number(v)]));
    try { await api.crearEvaluacion(socioId, body); avisar('ok', 'Evaluación registrada.'); setE(EVAL_VACIA); lista.recargar(); } catch (err) { avisar('err', errMsg(err)); }
  };
  const borrar = async (id) => { if (!window.confirm('¿Eliminar la evaluación?')) return; try { await api.eliminarEvaluacion(id); lista.recargar(); } catch (err) { avisar('err', errMsg(err)); } };
  const datos = lista.data || [];
  return (
    <div className="space-y-4">
      {puede(permisos, 'evaluaciones', 'crear') && (
        <form onSubmit={guardar} className="card grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <Campo label="Fecha" tipo="date" value={e.fecha} onChange={set('fecha')} />
          <Campo label="Peso (kg)" tipo="number" step="0.1" value={e.peso} onChange={set('peso')} />
          <Campo label="Altura (cm)" tipo="number" step="0.1" value={e.altura} onChange={set('altura')} />
          <Campo label="Grasa %" tipo="number" step="0.1" value={e.grasa_pct} onChange={set('grasa_pct')} />
          <Campo label="Masa muscular" tipo="number" step="0.1" value={e.masa_muscular} onChange={set('masa_muscular')} />
          <Campo label="Cintura (cm)" tipo="number" step="0.1" value={e.cintura} onChange={set('cintura')} />
          <Campo label="Cadera (cm)" tipo="number" step="0.1" value={e.cadera} onChange={set('cadera')} />
          <Campo label="Pecho (cm)" tipo="number" step="0.1" value={e.pecho} onChange={set('pecho')} />
          <Campo label="Brazo (cm)" tipo="number" step="0.1" value={e.brazo} onChange={set('brazo')} />
          <Campo label="Pierna (cm)" tipo="number" step="0.1" value={e.pierna} onChange={set('pierna')} />
          <Campo label="Notas" value={e.notas} onChange={set('notas')} className="col-span-2 sm:col-span-1" />
          <button className="btn-primary btn-sm">Registrar</button>
        </form>
      )}
      {datos.length > 1 && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card"><div className="text-sm font-semibold mb-1">Peso</div><Linea puntos={datos.map(x => ({ x: x.fecha, y: x.peso }))} formato={v => `${Number(v)} kg`} /></div>
          <div className="card"><div className="text-sm font-semibold mb-1">IMC</div><Linea puntos={datos.map(x => ({ x: x.fecha, y: x.imc }))} color="#199e70" formato={v => Number(v).toFixed(1)} /></div>
        </div>
      )}
      {lista.cargando && !lista.data ? <Cargando /> : <Tabla filas={[...datos].reverse()} vacio="Sin evaluaciones." columnas={[
        { k: 'fecha', l: 'Fecha', r: x => fechaCorta(x.fecha) }, { k: 'peso', l: 'Peso', r: x => (x.peso ? `${Number(x.peso)} kg` : '—') },
        { k: 'imc', l: 'IMC', r: x => (x.imc ? Number(x.imc).toFixed(1) : '—') }, { k: 'grasa_pct', l: 'Grasa', r: x => (x.grasa_pct ? `${Number(x.grasa_pct)}%` : '—') },
        { k: 'cintura', l: 'Cintura', r: x => x.cintura ?? '—' }, { k: 'notas', l: 'Notas' },
        { k: 'acc', l: '', r: x => (puede(permisos, 'evaluaciones', 'eliminar') ? <button className="btn-ghost btn-sm !text-danger" onClick={() => borrar(x.id)}><Trash2 className="w-4 h-4" /></button> : null) },
      ]} />}
    </div>
  );
}

function RutinasSocio({ socioId }) {
  const { api, permisos, avisar, irVista } = useGym();
  const rutinas = useCarga(() => api.rutinas({ socio_id: socioId }), [api, socioId]);
  const plantillas = useCarga(() => api.rutinas({ plantillas: '1' }), [api]);
  const [pl, setPl] = useState('');
  const asignar = async () => {
    try { await api.asignarPlantilla(Number(pl), socioId); avisar('ok', 'Rutina asignada.'); setPl(''); rutinas.recargar(); } catch (e) { avisar('err', errMsg(e)); }
  };
  return (
    <div className="space-y-3">
      {puede(permisos, 'rutinas', 'crear') && (plantillas.data || []).length > 0 && (
        <div className="flex flex-wrap gap-2 items-end">
          <Campo label="Asignar plantilla" tipo="select" value={pl} onChange={setPl} opciones={[['', 'Elegí una plantilla'], ...plantillas.data.map(p => [p.id, p.nombre])]} className="flex-1 min-w-[12rem]" />
          <button className="btn-primary btn-sm" disabled={!pl} onClick={asignar}>Asignar</button>
        </div>
      )}
      {rutinas.cargando && !rutinas.data ? <Cargando /> : <Tabla filas={rutinas.data || []} vacio="Sin rutinas asignadas." columnas={[
        { k: 'nombre', l: 'Rutina', r: r => <span className="font-medium">{r.nombre}</span> }, { k: 'objetivo', l: 'Objetivo' },
        { k: 'version_actual', l: 'Versión', r: r => `v${r.version_actual}` },
        { k: 'activa', l: 'Estado', r: r => (r.activa ? <span className="badge-green">Activa</span> : <span className="badge-neutral">Inactiva</span>) },
        { k: 'profesor', l: 'Profesor', r: r => (r.profesor ? `${r.profesor.nombre} ${r.profesor.apellido}` : '—') },
      ]} />}
      {irVista && <button className="btn-ghost btn-sm" onClick={() => irVista('rutinas')}>Editar rutinas en la sección Rutinas →</button>}
    </div>
  );
}

function Nutricion({ socioId }) {
  const { api, permisos, avisar } = useGym();
  const planes = useCarga(() => api.nutricion(socioId), [api, socioId]);
  const [n, setN] = useState({ objetivo: '', plan: '', observaciones: '' });
  const [seg, setSeg] = useState({});
  const crear = async (e) => {
    e.preventDefault();
    try { await api.crearNutricion(socioId, n); avisar('ok', 'Plan alimenticio creado.'); setN({ objetivo: '', plan: '', observaciones: '' }); planes.recargar(); } catch (err) { avisar('err', errMsg(err)); }
  };
  const agregarSeg = useCallback(async (planId) => {
    const s = seg[planId] || {};
    try {
      await api.seguimientoNutricion(planId, { ...(s.peso && { peso: Number(s.peso) }), ...(s.observaciones && { observaciones: s.observaciones }) });
      setSeg(x => ({ ...x, [planId]: {} })); planes.recargar();
    } catch (err) { avisar('err', errMsg(err)); }
  }, [api, seg, planes, avisar]);
  return (
    <div className="space-y-4">
      {puede(permisos, 'nutricion', 'crear') && (
        <form onSubmit={crear} className="card space-y-2">
          <div className="font-semibold text-sm">Nuevo plan alimenticio</div>
          <Campo label="Objetivo" value={n.objetivo} onChange={v => setN(x => ({ ...x, objetivo: v }))} />
          <Campo label="Plan" req tipo="textarea" value={n.plan} onChange={v => setN(x => ({ ...x, plan: v }))} />
          <Campo label="Observaciones" tipo="textarea" value={n.observaciones} onChange={v => setN(x => ({ ...x, observaciones: v }))} />
          <p className="hint">Al crear uno nuevo, el plan anterior queda inactivo.</p>
          <button className="btn-primary btn-sm" disabled={!n.plan.trim()}>Crear plan</button>
        </form>
      )}
      {planes.cargando && !planes.data ? <Cargando /> : !(planes.data || []).length ? <Vacio>Sin planes alimenticios.</Vacio> : planes.data.map(p => (
        <div key={p.id} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm mr-auto">{p.objetivo || 'Plan alimenticio'} · desde {fechaCorta(p.fecha_inicio)}</span>
            {p.activo ? <span className="badge-green">Activo</span> : <span className="badge-neutral">Anterior</span>}
          </div>
          <p className="text-sm whitespace-pre-wrap">{p.plan}</p>
          {p.observaciones && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.observaciones}</p>}
          {p.seguimientos?.length > 0 && <ul className="text-xs space-y-1 border-t border-border pt-2">
            {p.seguimientos.map(s => <li key={s.id}>{fechaCorta(s.fecha)}{s.peso ? ` · ${Number(s.peso)} kg` : ''}{s.observaciones ? ` · ${s.observaciones}` : ''}</li>)}
          </ul>}
          {p.activo && puede(permisos, 'nutricion', 'editar') && (
            <div className="flex flex-wrap gap-2 items-end">
              <Campo label="Peso" tipo="number" step="0.1" value={seg[p.id]?.peso || ''} onChange={v => setSeg(x => ({ ...x, [p.id]: { ...x[p.id], peso: v } }))} className="w-24" />
              <Campo label="Seguimiento" value={seg[p.id]?.observaciones || ''} onChange={v => setSeg(x => ({ ...x, [p.id]: { ...x[p.id], observaciones: v } }))} className="flex-1 min-w-[10rem]" />
              <button className="btn-outline btn-sm" onClick={() => agregarSeg(p.id)}>Agregar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

