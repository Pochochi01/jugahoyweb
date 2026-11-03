import { useState } from 'react';
import { Users, UserX, UserPlus, UserMinus, Activity, DollarSign, CalendarDays, GraduationCap, TrendingUp, AlertTriangle } from 'lucide-react';
import { useGym, useCarga, Cargando, ErrorBox, Kpi, Columnas, BarrasH, money, num, hoy } from '../../../components/gym/GymUI';

/** Dashboard ejecutivo del gym: tarjetas, KPIs, gráficos y alertas (todo agregado en el backend). */
export default function GymDashboard() {
  const { api, sucursales, irVista } = useGym();
  const [f, setF] = useState({ desde: `${hoy().slice(0, 7)}-01`, hasta: hoy(), sucursal_id: '' });
  const [aplicado, setAplicado] = useState(f);
  const d = useCarga(() => api.dashboard(Object.fromEntries(Object.entries(aplicado).filter(([, v]) => v))), [api, aplicado]);
  const al = useCarga(() => api.alertas(), [api]);

  return (
    <div className="space-y-5">
      <form className="card flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setAplicado(f); }}>
        <label className="text-xs text-muted-foreground">Desde<input type="date" className="input text-sm" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Hasta<input type="date" className="input text-sm" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Sucursal
          <select className="input text-sm" value={f.sucursal_id} onChange={e => setF({ ...f, sucursal_id: e.target.value })}>
            <option value="">Todas</option>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select></label>
        <button className="btn-primary btn-sm">Aplicar</button>
      </form>

      {al.data && <Alertas a={al.data} irVista={irVista} />}

      {d.cargando && !d.data ? <Cargando /> : d.error ? <ErrorBox>{d.error}</ErrorBox> : d.data && <Contenido d={d.data} />}
    </div>
  );
}

function Alertas({ a, irVista }) {
  const items = [
    ['Vencen hoy', a.vence_hoy?.length || 0, 'cobranzas'], ['Vencen mañana', a.vence_manana?.length || 0, 'cobranzas'],
    ['Vencidos sin renovar', a.vencidos?.length || 0, 'cobranzas'], ['Morosos', a.morosos?.length || 0, 'cobranzas'],
    ['Equipos', a.equipos?.length || 0, 'catalogos'],
  ];
  if (!items.some(i => i[1])) return null;
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" /> Alertas</h3>
      <div className="flex flex-wrap gap-2">
        {items.filter(i => i[1]).map(([l, n, v]) => (
          <button key={l} className="btn-outline btn-sm" onClick={() => irVista(v)}>{l}: <strong>{n}</strong></button>
        ))}
      </div>
    </div>
  );
}

function Bloque({ titulo, desc, children }) {
  return <div className="card space-y-3 min-w-0"><div><h3 className="font-semibold">{titulo}</h3><p className="text-xs text-muted-foreground">{desc}</p></div>{children}</div>;
}

function Contenido({ d }) {
  const t = d.tarjetas, k = d.kpis, g = d.graficos;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Socios activos" valor={num(t.socios_activos)} sub={`${num(t.socios_congelados)} congelados · ${num(t.socios_suspendidos)} suspendidos`} icon={Users} />
        <Kpi label="Socios morosos" valor={num(t.socios_morosos)} icon={UserX} />
        <Kpi label="Nuevos socios" valor={num(t.nuevos_socios)} sub="en el período" icon={UserPlus} />
        <Kpi label="Bajas" valor={num(t.bajas)} sub="en el período" icon={UserMinus} />
        <Kpi label="Asistencia hoy" valor={num(t.asistencia_hoy)} sub="socios distintos" icon={Activity} />
        <Kpi label="Facturación hoy" valor={money(t.facturacion_hoy)} icon={DollarSign} />
        <Kpi label="Facturación del mes" valor={money(t.facturacion_mes)} sub={`Período: ${money(t.facturacion_periodo)}`} icon={DollarSign} />
        <Kpi label="Clases" valor={`${num(t.clases_hoy)} hoy`} sub={`${num(t.clases_proximas)} en los próximos 7 días`} icon={CalendarDays} />
        <Kpi label="Profesores activos" valor={num(t.profesores_activos)} icon={GraduationCap} />
        <Kpi label="Rentabilidad" valor={money(t.rentabilidad)} sub={`Costos: ${money(t.costos_periodo)}`} icon={TrendingUp} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="Retención" valor={`${k.retencion}%`} />
        <Kpi label="Churn" valor={`${k.churn}%`} />
        <Kpi label="Ticket promedio" valor={money(k.ticket_promedio)} />
        <Kpi label="Ingreso por socio" valor={money(k.ingreso_por_socio)} />
        <Kpi label="Ocupación clases" valor={`${k.ocupacion_clases}%`} />
        <Kpi label="Morosidad" valor={`${k.morosidad}%`} />
        <Kpi label="Margen" valor={`${k.margen}%`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Bloque titulo="Altas y bajas" desc="Últimos 6 meses.">
          <Columnas datos={g.altas_bajas} x="mes" series={[{ k: 'altas', l: 'Altas', color: '#199e70' }, { k: 'bajas', l: 'Bajas', color: '#d95926' }]} />
        </Bloque>
        <Bloque titulo="Ingresos" desc="Cobros por día en el período.">
          <Columnas datos={g.ingresos} x="fecha" series={[{ k: 'total', l: 'Ingresos', color: '#3987e5' }]} formato={money} />
        </Bloque>
        <Bloque titulo="Asistencia" desc="Ingresos y clases por día.">
          <Columnas datos={g.asistencia} x="fecha" series={[{ k: 'total', l: 'Asistencias', color: '#3987e5' }]} />
        </Bloque>
        <Bloque titulo="Ocupación por horario" desc="Asistencias según la hora.">
          <BarrasH items={g.ocupacion_horaria.map(x => ({ label: x.hora, valor: x.total }))} />
        </Bloque>
        <Bloque titulo="Actividades más utilizadas" desc="Asistencias a clases por actividad.">
          <BarrasH items={g.actividades.map(x => ({ label: x.nombre, valor: x.total }))} />
        </Bloque>
      </div>
    </>
  );
}
