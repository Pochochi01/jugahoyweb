import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { X, Loader2 } from 'lucide-react';

/**
 * Piezas compartidas del módulo Gym: contexto (api + permisos), formato, modal,
 * campos de formulario, tablas, KPIs y gráficos livianos (SVG/CSS, sin librerías).
 */

// ── Contexto: api del complejo, permisos y avisos ──
export const GymCtx = createContext(null);
export const useGym = () => useContext(GymCtx);
/** true si el usuario puede `accion` sobre `recurso` (permisos null = acceso total). */
export const puede = (permisos, recurso, accion = 'ver') => permisos === null || (permisos?.[recurso] || []).includes(accion);

// ── Formato ──
export const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`;
export const num = (n) => Number(n || 0).toLocaleString('es-AR');
export const errMsg = (e) => e?.message || 'Ocurrió un error';
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
export const sumarDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export const fechaCorta = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');
export const nombre = (s) => (s ? `${s.apellido}, ${s.nombre}` : '—');

export const ESTADO_SOCIO = {
  activo: ['Activo', 'badge-green'], suspendido: ['Suspendido', 'badge-yellow'], moroso: ['Moroso', 'badge-red'],
  baja: ['Baja', 'badge-neutral'], congelado: ['Congelado', 'badge-blue'],
};
export const TIPOS_ACT = [['libre', 'Libre'], ['musculacion', 'Musculación'], ['funcional', 'Funcional'], ['crossfit', 'Crossfit'], ['spinning', 'Spinning'], ['natacion', 'Natación'], ['artes_marciales', 'Artes marciales'], ['personalizado', 'Personalizado']];
export const PERIODOS = [['diario', 'Diario'], ['semanal', 'Semanal'], ['mensual', 'Mensual'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual']];
export const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['debito', 'Débito'], ['credito', 'Crédito'], ['mercadopago', 'Mercado Pago']];
export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const label = (lista, v) => lista.find(x => x[0] === v)?.[1] || v || '—';

export function EstadoBadge({ estado, mapa = ESTADO_SOCIO }) {
  const [l, cls] = mapa[estado] || [estado, 'badge-neutral'];
  return <span className={cls}>{l}</span>;
}

/** Carga asíncrona con estado { data, error, cargando, recargar }. */
export function useCarga(fn, deps = []) {
  const [st, setSt] = useState({ data: null, error: '', cargando: true });
  const recargar = useCallback(() => {
    setSt(s => ({ ...s, cargando: true, error: '' }));
    return fn().then(data => setSt({ data, error: '', cargando: false })).catch(e => setSt({ data: null, error: errMsg(e), cargando: false }));
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { recargar(); }, [recargar]);
  return { ...st, recargar };
}

export const Cargando = () => <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
export const Vacio = ({ children }) => <div className="card text-center text-sm text-muted-foreground py-8">{children}</div>;
export const ErrorBox = ({ children }) => (children ? <p className="alert-error text-sm" role="alert">{children}</p> : null);

export function Modal({ titulo, onClose, children, ancho = 'max-w-lg' }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative z-10 bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${ancho} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">{titulo}</h3>
          <button onClick={onClose} className="btn-ghost btn-sm !px-2" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Campo de formulario. tipo: text|number|date|time|email|select|textarea|checkbox */
export function Campo({ label: l, value, onChange, tipo = 'text', opciones = [], req, className = '', ...rest }) {
  if (tipo === 'checkbox') return (
    <label className={`flex items-center gap-2 text-sm ${className}`}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} {...rest} />{l}</label>
  );
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted-foreground">{l}{req && ' *'}</span>
      {tipo === 'select' ? (
        <select className="input text-sm" value={value ?? ''} onChange={e => onChange(e.target.value)} required={req} {...rest}>
          {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      ) : tipo === 'textarea' ? (
        <textarea className="input text-sm min-h-[80px]" value={value ?? ''} onChange={e => onChange(e.target.value)} required={req} {...rest} />
      ) : (
        <input className="input text-sm" type={tipo} value={value ?? ''} onChange={e => onChange(e.target.value)} required={req} {...rest} />
      )}
    </label>
  );
}

/** Tabla responsive: en móvil cada fila es una tarjeta. columnas: [{ k, l, r?: (fila) => node, cls? }] */
export function Tabla({ columnas, filas, onRow, vacio = 'Sin registros.', clave = 'id' }) {
  if (!filas?.length) return <Vacio>{vacio}</Vacio>;
  return (
    <div className="card !p-0 overflow-hidden">
      <table className="w-full text-sm hidden md:table">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{columnas.map(c => <th key={c.k} className={`text-left font-medium px-3 py-2 ${c.cls || ''}`}>{c.l}</th>)}</tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f[clave] ?? i} onClick={onRow ? () => onRow(f) : undefined} className={`border-t border-border ${onRow ? 'cursor-pointer hover:bg-muted/40' : ''}`}>
              {columnas.map(c => <td key={c.k} className={`px-3 py-2 align-middle ${c.cls || ''}`}>{c.r ? c.r(f) : (f[c.k] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="md:hidden divide-y divide-border">
        {filas.map((f, i) => (
          <li key={f[clave] ?? i} onClick={onRow ? () => onRow(f) : undefined} className={`p-3 space-y-1 ${onRow ? 'cursor-pointer active:bg-muted/40' : ''}`}>
            {columnas.map(c => (
              <div key={c.k} className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground text-xs">{c.l}</span><span className="text-right min-w-0">{c.r ? c.r(f) : (f[c.k] ?? '—')}</span></div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Kpi({ label: l, valor, sub, icon: Icon, tono }) {
  return (
    <div className="card !p-4 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${tono || ''}`} />}<span className="truncate">{l}</span></div>
      <div className="text-2xl font-bold mt-1 truncate">{valor}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/** Barras horizontales de una serie con etiqueta directa. items: [{ label, valor, texto? }] */
export function BarrasH({ items, formato = num }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground">Sin datos.</p>;
  const max = Math.max(1, ...items.map(i => i.valor));
  return (
    <ul className="space-y-1.5">
      {items.map(i => (
        <li key={i.label} className="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs" title={`${i.label}: ${i.texto ?? formato(i.valor)}`}>
          <span className="truncate text-muted-foreground">{i.label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-3.5 rounded-r bg-primary shrink-0" style={{ width: `${Math.max(2, (i.valor / max) * 70)}%` }} />
            <span className="whitespace-nowrap font-medium">{i.texto ?? formato(i.valor)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Columnas verticales (serie temporal corta) con tooltip nativo y valor al pasar el mouse. */
export function Columnas({ datos, x, series, formato = num, alto = 160 }) {
  const [hover, setHover] = useState(null);
  if (!datos?.length) return <p className="text-xs text-muted-foreground">Sin datos.</p>;
  const max = Math.max(1, ...datos.flatMap(d => series.map(s => Number(d[s.k] || 0))));
  return (
    <div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
          {series.map(s => <span key={s.k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.l}</span>)}
        </div>
      )}
      <div className="flex items-end gap-[3px] overflow-x-auto" style={{ height: alto }} onMouseLeave={() => setHover(null)}>
        {datos.map((d, i) => (
          <div key={d[x] ?? i} className="flex-1 min-w-[10px] h-full flex items-end gap-px" onMouseEnter={() => setHover(i)}
            title={`${d[x]}: ${series.map(s => `${s.l} ${formato(d[s.k])}`).join(' · ')}`}>
            {series.map(s => (
              <div key={s.k} className="flex-1 rounded-t" style={{ height: `${Math.max(1, (Number(d[s.k] || 0) / max) * 100)}%`, background: s.color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>{datos[0][x]}</span><span aria-live="polite">{hover !== null ? `${datos[hover][x]} · ${series.map(s => `${s.l}: ${formato(datos[hover][s.k])}`).join(' · ')}` : ''}</span><span>{datos.at(-1)[x]}</span></div>
    </div>
  );
}

/** Línea simple (SVG) para evolución, p. ej. peso o IMC. puntos: [{ x, y }] */
export function Linea({ puntos, formato = (v) => v, color = '#3987e5', alto = 140 }) {
  const [i, setI] = useState(null);
  const ps = (puntos || []).filter(p => p.y !== null && p.y !== undefined && p.y !== '');
  if (ps.length < 2) return <p className="text-xs text-muted-foreground">Se necesitan al menos 2 registros para graficar.</p>;
  const W = 400, P = 14, ys = ps.map(p => Number(p.y)), min = Math.min(...ys), max = Math.max(...ys), rango = max - min || 1;
  const X = (j) => P + (j * (W - 2 * P)) / (ps.length - 1), Y = (v) => alto - P - ((v - min) / rango) * (alto - 2 * P);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${alto}`} className="w-full h-auto" role="img" aria-label="Evolución" onMouseLeave={() => setI(null)}>
        <polyline fill="none" stroke={color} strokeWidth="2" points={ps.map((p, j) => `${X(j)},${Y(Number(p.y))}`).join(' ')} />
        {ps.map((p, j) => <circle key={j} cx={X(j)} cy={Y(Number(p.y))} r={i === j ? 6 : 4} fill={color} stroke="rgb(var(--card))" strokeWidth="2" onMouseEnter={() => setI(j)} />)}
      </svg>
      <p className="text-xs text-muted-foreground text-center" aria-live="polite">{i !== null ? `${fechaCorta(ps[i].x)}: ${formato(ps[i].y)}` : `${formato(ys[0])} → ${formato(ys.at(-1))}`}</p>
    </div>
  );
}
