import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { CATEGORIAS, catNombre, ESTADO_CATEGORIA } from '../../utils/torneos';

/**
 * Multiselección de categorías: dropdown con checkboxes + chips quitables.
 * value: number[] (1 = 1ra … 8 = 8va) · onChange(number[]) · bloqueadas: categorías que no se pueden quitar.
 */
export function CategoriasMultiSelect({ value = [], onChange, disabled = false, bloqueadas = [], id = 'categorias' }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    const esc = (e) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const orden = [...CATEGORIAS].reverse();   // 8va → 1ra, como se piensan los niveles
  const toggle = (c) => {
    if (value.includes(c)) { if (!bloqueadas.includes(c)) onChange(value.filter(x => x !== c)); }
    else onChange([...value, c].sort((a, b) => b - a));
  };

  return (
    <div ref={caja} className="relative">
      <button type="button" id={id} disabled={disabled} onClick={() => setAbierto(a => !a)} aria-haspopup="listbox" aria-expanded={abierto}
        className="input flex items-center justify-between text-left disabled:opacity-60">
        <span className={value.length ? '' : 'text-muted-foreground'}>{value.length ? `${value.length} categoría(s)` : 'Elegí una o varias categorías'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <ul role="listbox" aria-multiselectable="true" className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-xl py-1 max-h-64 overflow-y-auto">
          {orden.map(c => {
            const sel = value.includes(c);
            return (
              <li key={c} role="option" aria-selected={sel}>
                <button type="button" onClick={() => toggle(c)} disabled={sel && bloqueadas.includes(c)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">
                  <span className={`grid place-items-center w-4 h-4 rounded border ${sel ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>{sel && <Check className="w-3 h-3" />}</span>
                  {catNombre(c)}
                  {sel && bloqueadas.includes(c) && <span className="ml-auto text-[11px] text-muted-foreground">con inscriptos</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Categorías elegidas">
          {value.map(c => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-xs font-medium pl-2.5 pr-1 py-1">
              {catNombre(c)}
              {!disabled && !bloqueadas.includes(c) && (
                <button type="button" onClick={() => toggle(c)} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Quitar ${catNombre(c)}`}><X className="w-3 h-3" /></button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Selector del cuadro (categoría) en torneos con varias categorías. */
export function CategoriaTabs({ categorias = [], value, onChange }) {
  if (categorias.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Categoría del cuadro">
      <span className="text-xs text-muted-foreground mr-1">Categoría:</span>
      {categorias.map(c => (
        <button key={c.categoria_id} role="tab" aria-selected={value === c.categoria_id} onClick={() => onChange(c.categoria_id)}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border ${value === c.categoria_id ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          {catNombre(c.categoria_id)}
          {c.estado && <span className={`${ESTADO_CATEGORIA[c.estado]?.cls} !text-[10px] !px-1.5 !py-0`}>{ESTADO_CATEGORIA[c.estado]?.label}</span>}
        </button>
      ))}
    </div>
  );
}
