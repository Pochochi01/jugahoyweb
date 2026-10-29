import { useState, useEffect, useCallback, useMemo } from 'react';
import { statsService } from '../../services/statsService';
import { inicioMes, hoyAR } from '../../utils/fecha';
import {
  Brain, Clock, CalendarDays, Ban, UserCheck, TrendingUp, Gauge, DollarSign, AlertTriangle, Activity, Filter, RotateCcw,
} from 'lucide-react';

/**
 * Inteligencia de Agenda — analítica operativa de turnos, separada de las
 * estadísticas actuales. Todas las métricas llegan agregadas del backend
 * (GET /stats/:id/agenda-analitica); acá solo se dibujan.
 */

const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`;
const num = (n) => Number(n || 0).toLocaleString('es-AR');
// Serie categórica en orden fijo (paleta validada): creados, realizados, cancelados, ausentes
const SERIES = [
  { k: 'creados',    label: 'Creados',    color: '#3987e5' },
  { k: 'realizados', label: 'Realizados', color: '#199e70' },
  { k: 'cancelados', label: 'Cancelados', color: '#d95926' },
  { k: 'ausentes',   label: 'Ausentes',   color: '#c98500' },
];
const ESTADO_LABEL = { pendiente_pago: 'Pendiente de pago', pendiente: 'Pendiente', confirmado: 'Asistido', cancelado: 'Cancelado', rechazado: 'Rechazado', no_asistido: 'Ausente' };
const DEPORTE_LABEL = { futbol: 'Fútbol', padel: 'Pádel', tenis: 'Tenis', basquet: 'Básquet', voley: 'Vóley', squash: 'Squash', otro: 'Otro' };
const DIA_CORTO = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' };
const FILTROS_INI = () => ({ desde: inicioMes(), hasta: hoyAR(), hora_desde: '', hora_hasta: '', field_id: '', deporte: '', estado: '', granularidad: 'diaria' });

export default function InteligenciaAgenda({ complexId }) {
  const [f, setF] = useState(FILTROS_INI);
  const [aplicados, setAplicados] = useState(FILTROS_INI);
  const [opciones, setOpciones] = useState(null);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => { statsService.getAgendaFiltros(complexId).then(setOpciones).catch(() => setOpciones(null)); }, [complexId]);
  const cargar = useCallback(() => {
    setCargando(true); setError('');
    const params = Object.fromEntries(Object.entries(aplicados).filter(([, v]) => v));
    statsService.getAgendaAnalitica(complexId, params)
      .then(setData)
      .catch(e => { setData(null); setError(e?.response?.data?.message || 'No se pudo cargar la analítica.'); })
      .finally(() => setCargando(false));
  }, [complexId, aplicados]);
  useEffect(() => { cargar(); }, [cargar]);

  const aplicar = (e) => { e?.preventDefault(); setAplicados({ ...f }); };
  const limpiar = () => { const x = FILTROS_INI(); setF(x); setAplicados(x); };
  const setGran = (g) => { set('granularidad', g); setAplicados(a => ({ ...a, granularidad: g })); };

  return (
    <section className="mt-10 space-y-5" aria-labelledby="ia-titulo">
      <div className="border-t-2 border-primary/40 pt-6">
        <h2 id="ia-titulo" className="text-xl font-bold flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /> Inteligencia de Agenda</h2>
        <p className="text-sm text-muted-foreground mt-1">Demanda, ocupación, cancelaciones y ausentismo por día y horario, para reorganizar la agenda. Los filtros aplican a todas las métricas de esta sección.</p>
      </div>

      {/* Filtros globales de la sección */}
      <form onSubmit={aplicar} className="card space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Filter className="w-4 h-4" /> Filtros</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Campo label="Fecha desde"><input type="date" className="input text-sm" value={f.desde} max={f.hasta} onChange={e => set('desde', e.target.value)} required /></Campo>
          <Campo label="Fecha hasta"><input type="date" className="input text-sm" value={f.hasta} min={f.desde} onChange={e => set('hasta', e.target.value)} required /></Campo>
          <Campo label="Hora desde"><input type="time" step="3600" className="input text-sm" value={f.hora_desde} onChange={e => set('hora_desde', e.target.value)} /></Campo>
          <Campo label="Hora hasta"><input type="time" step="3600" className="input text-sm" value={f.hora_hasta} onChange={e => set('hora_hasta', e.target.value)} /></Campo>
          <Campo label="Cancha">
            <select className="input text-sm" value={f.field_id} onChange={e => set('field_id', e.target.value)}>
              <option value="">Todas</option>
              {(opciones?.canchas || []).filter(c => !f.deporte || c.deporte === f.deporte).map(c => <option key={c.id} value={c.id}>{c.identificador ? `${c.identificador} · ` : ''}{c.nombre}</option>)}
            </select></Campo>
          <Campo label="Deporte">
            <select className="input text-sm" value={f.deporte} onChange={e => { set('deporte', e.target.value); set('field_id', ''); }}>
              <option value="">Todos</option>
              {(opciones?.deportes || []).map(d => <option key={d} value={d}>{DEPORTE_LABEL[d] || d}</option>)}
            </select></Campo>
          <Campo label="Estado">
            <select className="input text-sm" value={f.estado} onChange={e => set('estado', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></Campo>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary text-sm flex-1">Aplicar</button>
            <button type="button" className="btn-ghost text-sm px-2" onClick={limpiar} title="Restablecer filtros" aria-label="Restablecer filtros"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>
      </form>

      {cargando ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : error ? (
        <div className="card text-center py-8 text-sm text-red-500" role="alert">{error}</div>
      ) : !data || data.vacio ? (
        <div className="card text-center py-8 text-sm text-muted-foreground">No hay canchas que coincidan con los filtros.</div>
      ) : data.resumen.total === 0 ? (
        <div className="card text-center py-8 text-sm text-muted-foreground">No hay turnos en el período y filtros elegidos.</div>
      ) : (
        <Contenido d={data} granularidad={aplicados.granularidad} setGran={setGran} />
      )}
    </section>
  );
}

function Campo({ label, children }) {
  return <label className="text-xs text-muted-foreground flex flex-col gap-1">{label}{children}</label>;
}

function Bloque({ titulo, descripcion, icon: Icon, children, className = '' }) {
  return (
    <div className={`card space-y-3 min-w-0 ${className}`}>
      <div>
        <h3 className="font-semibold flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-primary" />}{titulo}</h3>
        {descripcion && <p className="text-xs text-muted-foreground mt-0.5">{descripcion}</p>}
      </div>
      {children}
    </div>
  );
}

function Contenido({ d, granularidad, setGran }) {
  const k = d.kpis;
  const delta = (actual, previo) => {
    if (!d.anterior || !previo) return null;
    const v = Math.round(((actual - previo) / previo) * 100);
    return `${v > 0 ? '+' : ''}${v}% vs. período anterior`;
  };
  const kpis = [
    { label: 'Horario más solicitado', value: k.horario_mas_solicitado?.hora || '—', sub: k.horario_mas_solicitado && `${num(k.horario_mas_solicitado.turnos)} turnos`, icon: Clock },
    { label: 'Día con más demanda', value: k.dia_mas_demanda?.turnos ? k.dia_mas_demanda.dia : '—', sub: k.dia_mas_demanda?.turnos ? `${num(k.dia_mas_demanda.turnos)} turnos` : null, icon: CalendarDays },
    { label: 'Horario con más cancelaciones', value: k.horario_mas_cancelaciones?.hora || '—', sub: k.horario_mas_cancelaciones && `${num(k.horario_mas_cancelaciones.cancelados)} cancelados`, icon: Ban },
    { label: 'Asistencia', value: `${k.pct_asistencia}%`, sub: `${num(d.ausentismo.asistidos)} asistidos · ${num(d.ausentismo.ausentes)} ausentes`, icon: UserCheck },
    { label: 'Promedio diario', value: num(k.promedio_diario), sub: delta(d.resumen.demanda, d.anterior?.demanda) || 'turnos por día', icon: Activity },
    { label: 'Promedio semanal', value: num(k.promedio_semanal), sub: 'turnos por semana', icon: TrendingUp },
    { label: 'Ocupación global', value: `${k.ocupacion_global}%`, sub: `${num(d.resumen.horas_reservadas)} h de ${num(d.resumen.horas_disponibles)} h`, icon: Gauge },
    { label: 'Franja más rentable', value: k.franja_mas_rentable?.franja || '—', sub: k.franja_mas_rentable ? money(k.franja_mas_rentable.facturado) : 'sin cobros registrados', icon: DollarSign },
  ];

  return (
    <div className="space-y-5">
      {/* Indicadores ejecutivos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="card !p-4 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{label}</span></div>
            <div className="text-2xl font-bold mt-1 truncate">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
          </div>
        ))}
      </div>

      {d.patrones.length > 0 && (
        <div className="card !py-3 text-sm space-y-1" role="note">
          {d.patrones.map(p => <p key={p}>• {p}</p>)}
        </div>
      )}

      <Bloque titulo="Mapa de calor de demanda" icon={CalendarDays} descripcion="Turnos (sin cancelados) por día y hora de inicio. Más oscuro = más demanda: ubicá las horas pico y las ociosas.">
        <Heatmap hm={d.heatmap} />
      </Bloque>

      <div className="grid lg:grid-cols-2 gap-5">
        <Bloque titulo="Top 10 horarios más solicitados" icon={Clock} descripcion="Ranking por cantidad de turnos.">
          <Barras items={d.top_horarios.map((x, i) => ({ label: `${i + 1}. ${x.hora}`, valor: x.demanda, texto: `${num(x.demanda)} turnos` }))} />
        </Bloque>
        <Bloque titulo="Días más concurridos" icon={CalendarDays} descripcion="Turnos y porcentaje del total por día de la semana.">
          <Barras items={d.top_dias.map(x => ({ label: x.dia_nombre, valor: x.demanda, texto: `${num(x.demanda)} · ${x.pct_demanda}%` }))} />
        </Bloque>
      </div>

      <Bloque titulo="Análisis de cancelaciones" icon={Ban} descripcion={`${num(d.cancelaciones.total)} cancelados (${d.cancelaciones.pct}% del total de turnos del período).`}>
        {d.cancelaciones.total === 0 ? <p className="text-sm text-muted-foreground">Sin cancelaciones en el período.</p> : (
          <div className="grid sm:grid-cols-2 gap-5">
            <Sub titulo="Por día"><Barras items={d.cancelaciones.por_dia.map(x => ({ label: x.dia_nombre, valor: x.cancelados, texto: `${num(x.cancelados)} · ${x.pct_cancelaciones}%` }))} /></Sub>
            <Sub titulo="Por horario"><Barras items={d.cancelaciones.por_horario.map(x => ({ label: x.hora, valor: x.cancelados, texto: `${num(x.cancelados)} · ${x.pct_cancelacion}% de sus turnos` }))} /></Sub>
            <Sub titulo="Por cancha"><Barras items={d.cancelaciones.por_cancha.filter(x => x.cancelados).map(x => ({ label: x.nombre, valor: x.cancelados, texto: `${num(x.cancelados)} · ${x.pct_cancelacion}%` }))} /></Sub>
            <Sub titulo="Por deporte"><Barras items={d.cancelaciones.por_deporte.filter(x => x.cancelados).map(x => ({ label: DEPORTE_LABEL[x.deporte] || x.deporte, valor: x.cancelados, texto: `${num(x.cancelados)} · ${x.pct_cancelacion}%` }))} /></Sub>
          </div>
        )}
      </Bloque>

      <Bloque titulo="Análisis de ausentismo" icon={UserCheck} descripcion="Sobre turnos que debían cumplirse (asistidos + ausentes).">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="Asistidos" valor={num(d.ausentismo.asistidos)} />
          <Mini label="Ausentes" valor={num(d.ausentismo.ausentes)} />
          <Mini label="% asistencia" valor={`${d.ausentismo.pct_asistencia}%`} />
          <Mini label="% ausentismo" valor={`${d.ausentismo.pct_ausentismo}%`} />
        </div>
        {d.ausentismo.ausentes > 0 && (
          <div className="grid sm:grid-cols-3 gap-5">
            <Sub titulo="Por día"><Barras items={d.ausentismo.por_dia.filter(x => x.ausentes).map(x => ({ label: x.dia_nombre, valor: x.pct_ausentismo, texto: `${x.pct_ausentismo}% (${num(x.ausentes)})` }))} /></Sub>
            <Sub titulo="Por horario"><Barras items={d.ausentismo.por_horario.filter(x => x.ausentes).map(x => ({ label: x.hora, valor: x.pct_ausentismo, texto: `${x.pct_ausentismo}% (${num(x.ausentes)})` }))} /></Sub>
            <Sub titulo="Por cancha"><Barras items={d.ausentismo.por_cancha.filter(x => x.ausentes).map(x => ({ label: x.nombre, valor: x.pct_ausentismo, texto: `${x.pct_ausentismo}% (${num(x.ausentes)})` }))} /></Sub>
          </div>
        )}
      </Bloque>

      <Bloque titulo="Franjas horarias críticas" icon={AlertTriangle} descripcion="Detectadas automáticamente: ocupación menor al 30% o cancelación del 20% o más (mínimo 3 turnos).">
        {d.criticas.length === 0 ? <p className="text-sm text-muted-foreground">No se detectaron franjas críticas con los filtros actuales.</p> : (
          <ul className="space-y-2">
            {d.criticas.map(c => (
              <li key={`${c.dia}-${c.h}`} className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                <span><strong>{c.motivo.join(' · ')}:</strong> {c.mensaje}</span>
              </li>
            ))}
          </ul>
        )}
        {d.ociosas_total > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{d.ociosas_total} horario(s) abiertos sin ningún turno en el período</summary>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{d.ociosas.join(' · ')}{d.ociosas_total > d.ociosas.length ? ' …' : ''}</p>
          </details>
        )}
      </Bloque>

      <div className="grid lg:grid-cols-2 gap-5">
        <Bloque titulo="Ocupación por franja horaria" icon={Gauge} descripcion="Turnos por franja de 2 horas y su porcentaje del total.">
          <Barras items={d.franjas.map(x => ({ label: x.franja, valor: x.demanda, texto: `${num(x.demanda)} · ${x.pct_demanda}% · ocup. ${x.pct_ocupacion}%` }))} />
        </Bloque>
        <Bloque titulo="Horarios más rentables" icon={DollarSign} descripcion={`Facturación de turnos cobrados: ${money(d.rentabilidad.total)} en el período.`}>
          {d.rentabilidad.total === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay turnos cobrados en el período.</p> : (
            <div className="space-y-4">
              <Sub titulo="Por hora"><Barras items={d.rentabilidad.por_hora.map(x => ({ label: x.hora, valor: x.facturado, texto: money(x.facturado) }))} /></Sub>
              <Sub titulo="Por día"><Barras items={d.rentabilidad.por_dia.filter(x => x.facturado).map(x => ({ label: x.dia_nombre, valor: x.facturado, texto: money(x.facturado) }))} /></Sub>
              <Sub titulo="Por cancha"><Barras items={d.rentabilidad.por_cancha.filter(x => x.facturado).map(x => ({ label: x.nombre, valor: x.facturado, texto: money(x.facturado) }))} /></Sub>
            </div>
          )}
        </Bloque>
      </div>

      <Bloque titulo="Evolución temporal" icon={TrendingUp} descripcion={d.anterior
        ? `Período anterior (${d.periodo.anterior.desde} a ${d.periodo.anterior.hasta}): ${num(d.anterior.total)} turnos, ${d.anterior.pct_cancelacion}% cancelación, ${d.anterior.pct_asistencia}% asistencia.`
        : 'Turnos creados, realizados, cancelados y ausentes.'}>
        <div className="flex gap-1" role="tablist" aria-label="Granularidad">
          {['diaria', 'semanal', 'mensual'].map(g => (
            <button key={g} role="tab" aria-selected={granularidad === g} onClick={() => setGran(g)}
              className={`text-xs px-3 py-1 rounded-full capitalize ${granularidad === g ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{g}</button>
          ))}
        </div>
        {d.anterior && <Comparacion actual={d.resumen} anterior={d.anterior} />}
        <Lineas datos={d.evolucion} />
      </Bloque>
    </div>
  );
}

const Sub = ({ titulo, children }) => <div className="min-w-0"><h4 className="text-xs font-medium text-muted-foreground mb-2">{titulo}</h4>{children}</div>;
const Mini = ({ label, valor }) => <div className="rounded-lg bg-muted px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{valor}</div></div>;

/** Barras horizontales de una sola serie, con etiqueta directa del valor. */
function Barras({ items }) {
  const max = Math.max(1, ...items.map(i => i.valor));
  if (!items.length) return <p className="text-xs text-muted-foreground">Sin datos.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map(i => (
        <li key={i.label} className="grid grid-cols-[5.5rem_1fr] sm:grid-cols-[7rem_1fr] items-center gap-2 text-xs" title={`${i.label}: ${i.texto}`}>
          <span className="truncate text-muted-foreground">{i.label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-3.5 rounded-r bg-primary shrink-0" style={{ width: `${Math.max(2, (i.valor / max) * 70)}%` }} />
            <span className="whitespace-nowrap font-medium">{i.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Heatmap día × hora (escala secuencial de un solo tono) con tooltip por celda. */
function Heatmap({ hm }) {
  const [hover, setHover] = useState(null);
  const celda = useMemo(() => Object.fromEntries(hm.celdas.map(c => [`${c.dia}|${c.hora}`, c])), [hm]);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="border-separate border-spacing-[2px] text-[10px]" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr><th />{hm.horas.map(h => <th key={h} className="font-normal text-muted-foreground px-0.5">{h.slice(0, 2)}</th>)}</tr>
          </thead>
          <tbody>
            {hm.dias.map(dia => (
              <tr key={dia.dia}>
                <th className="font-normal text-muted-foreground text-left pr-1">{DIA_CORTO[dia.nombre]}</th>
                {hm.horas.map(h => {
                  const c = celda[`${dia.dia}|${h}`];
                  const v = c?.demanda || 0;
                  const t = hm.max ? v / hm.max : 0;
                  return (
                    <td key={h} tabIndex={0} aria-label={`${dia.nombre} ${h}: ${v} turnos`}
                      onMouseEnter={() => setHover({ dia: dia.nombre, h, c })} onFocus={() => setHover({ dia: dia.nombre, h, c })}
                      className="w-7 h-7 min-w-[1.5rem] rounded text-center align-middle cursor-default outline-none focus:ring-2 focus:ring-primary"
                      style={{ background: v ? `rgb(57 135 229 / ${0.15 + t * 0.85})` : 'rgb(var(--muted))', color: t > 0.55 ? '#fff' : 'rgb(var(--muted-foreground))' }}>
                      {v || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground min-h-[1.25rem]">
        <span aria-live="polite">
          {hover ? (hover.c
            ? <><strong className="text-foreground">{hover.dia} {hover.h}</strong> · {hover.c.demanda} turnos · ocupación {hover.c.pct_ocupacion}% · cancelación {hover.c.pct_cancelacion}%</>
            : <><strong className="text-foreground">{hover.dia} {hover.h}</strong> · sin turnos</>) : 'Pasá el mouse o tocá una celda para ver el detalle.'}
        </span>
        <span className="flex items-center gap-1">Menos
          {[0.15, 0.4, 0.65, 1].map(a => <span key={a} className="w-4 h-3 rounded-sm" style={{ background: `rgb(57 135 229 / ${a})` }} />)}
          Más</span>
      </div>
    </div>
  );
}

/** Tarjetas de comparación con el período anterior de igual duración. */
function Comparacion({ actual, anterior }) {
  const filas = [
    ['Turnos', actual.total, anterior.total, false],
    ['Cancelados', actual.cancelados, anterior.cancelados, true],
    ['Ausentes', actual.ausentes, anterior.ausentes, true],
    ['Facturado', actual.facturado, anterior.facturado, false, money],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {filas.map(([l, a, p, menosEsMejor, fmt = num]) => {
        const v = p ? Math.round(((a - p) / p) * 100) : null;
        const bueno = v === null || v === 0 ? null : (v < 0) === menosEsMejor;
        return (
          <div key={l} className="rounded-lg bg-muted px-3 py-2 text-xs">
            <div className="text-muted-foreground">{l}</div>
            <div className="text-base font-bold text-foreground">{fmt(a)}</div>
            <div className="text-muted-foreground">antes {fmt(p)}{v !== null && <span className={bueno === null ? '' : bueno ? 'text-emerald-500' : 'text-red-500'}> · {v > 0 ? '▲' : v < 0 ? '▼' : ''} {Math.abs(v)}%</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Líneas (SVG) de 4 series con leyenda y crosshair + tooltip al pasar el mouse. */
function Lineas({ datos }) {
  const [i, setI] = useState(null);
  if (!datos.length) return <p className="text-sm text-muted-foreground">Sin datos.</p>;
  const W = 640, H = 220, P = { l: 32, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...datos.flatMap(x => SERIES.map(s => x[s.k])));
  const x = (j) => P.l + (datos.length === 1 ? (W - P.l - P.r) / 2 : (j * (W - P.l - P.r)) / (datos.length - 1));
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const ticks = [0, Math.round(max / 2), max];
  const cadaN = Math.ceil(datos.length / 8);
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setI(Math.max(0, Math.min(datos.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (datos.length - 1)))));
  };
  const sel = i !== null ? datos[i] : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs">
        {SERIES.map(s => <span key={s.k} className="flex items-center gap-1.5 text-muted-foreground"><span className="w-3 h-0.5 rounded" style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolución de turnos" onMouseMove={mover} onMouseLeave={() => setI(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--muted-foreground) / 0.2)" />
              <text x={P.l - 4} y={y(t) + 3} textAnchor="end" fontSize="10" fill="rgb(var(--muted-foreground))">{t}</text>
            </g>
          ))}
          {datos.map((dx, j) => j % cadaN === 0 && <text key={dx.periodo} x={x(j)} y={H - 6} textAnchor="middle" fontSize="10" fill="rgb(var(--muted-foreground))">{dx.periodo.length === 10 ? dx.periodo.slice(5) : dx.periodo}</text>)}
          {sel && <line x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} stroke="rgb(var(--muted-foreground) / 0.5)" />}
          {SERIES.map(s => (
            <g key={s.k}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={datos.map((dx, j) => `${x(j)},${y(dx[s.k])}`).join(' ')} />
              {(datos.length === 1 || sel) && <circle cx={x(i ?? 0)} cy={y((sel || datos[0])[s.k])} r="4" fill={s.color} stroke="rgb(var(--card))" strokeWidth="2" />}
            </g>
          ))}
        </svg>
        {sel && (
          <div className="absolute top-1 pointer-events-none rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs"
            style={{ left: `${(x(i) / W) * 100}%`, transform: `translateX(${i > datos.length / 2 ? '-105%' : '5%'})` }}>
            <div className="font-semibold mb-1">{sel.periodo}</div>
            {SERIES.map(s => <div key={s.k} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} /><span className="text-muted-foreground">{s.label}</span><span className="ml-auto pl-3 font-medium">{sel[s.k]}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
