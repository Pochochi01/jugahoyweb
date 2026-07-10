import { useState, useRef, useEffect, useMemo, useId, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, Loader2, X } from 'lucide-react';

/**
 * SearchableSelect — dropdown accesible con búsqueda/filtrado.
 *
 * El popup se renderiza en un PORTAL a document.body con posición `fixed`,
 * de modo que nunca queda tapado por tarjetas u otros elementos con
 * stacking context (transform/opacity/AOS). Se reposiciona en scroll/resize
 * y hace "flip" hacia arriba si no hay espacio abajo.
 *
 * Props: ver comentarios en JSX. Accesibilidad: patrón combobox WAI-ARIA con
 * listbox, aria-activedescendant y navegación por teclado (↑ ↓ Enter Esc Home End).
 */
export default function SearchableSelect({
  label,
  value = '',
  onChange,
  options = [],
  placeholder = 'Seleccioná una opción',
  searchPlaceholder = 'Buscar…',
  disabled = false,
  disabledHint = '',
  loading = false,
  required = false,
  emptyMessage = 'Sin resultados',
  error = '',
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(-1);
  const [coords, setCoords] = useState(null); // { left, width, top?|bottom?, maxHeight }

  const triggerRef = useRef(null);
  const popupRef   = useRef(null);
  const searchRef  = useRef(null);
  const listRef    = useRef(null);
  const baseId     = useId();
  const listboxId  = `${baseId}-listbox`;

  // Búsqueda tolerante: sin distinción de mayúsculas ni acentos
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter(o => normalize(o).includes(q));
  }, [options, query]);

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(-1); }, []);

  // ── Posicionamiento del popup (fixed, con flip) ────────────
  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(320, openUp ? spaceAbove : spaceBelow));
    setCoords({
      left  : r.left,
      width : r.width,
      top   : openUp ? undefined : r.bottom + gap,
      bottom: openUp ? window.innerHeight - r.top + gap : undefined,
      maxHeight,
    });
  }, []);

  // Recalcular al abrir y en scroll/resize mientras está abierto
  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const onScroll = () => computePosition();
    window.addEventListener('scroll', onScroll, true); // capture: atrapa scroll de contenedores
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, computePosition]);

  // Click fuera (considera trigger y popup, que vive en el portal)
  useEffect(() => {
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popupRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [close]);

  // Al abrir: foco en el buscador y resaltar la opción seleccionada
  useEffect(() => {
    if (open) {
      const idx = options.indexOf(value);
      setActive(idx >= 0 ? idx : 0);
      // foco tras el paint del portal
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener visible la opción activa
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (opt) => { onChange(opt); close(); };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); e.preventDefault(); return; }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); break;
      case 'ArrowUp':   e.preventDefault(); setActive(i => Math.max(i - 1, 0)); break;
      case 'Home':      e.preventDefault(); setActive(0); break;
      case 'End':       e.preventDefault(); setActive(filtered.length - 1); break;
      case 'Enter':     e.preventDefault(); if (open && filtered[active]) choose(filtered[active]); break;
      case 'Escape':    e.preventDefault(); close(); triggerRef.current?.focus(); break;
      default: break;
    }
  };

  const showClear = !!value && !disabled && !loading;

  // ── Popup (portal) ─────────────────────────────────────────
  const popup = open && coords ? createPortal(
    <div
      ref={popupRef}
      className="fixed z-[9999] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
      style={{
        left: coords.left,
        width: coords.width,
        top: coords.top,
        bottom: coords.bottom,
        maxHeight: coords.maxHeight,
      }}
    >
      {/* Buscador */}
      <div className="p-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={active >= 0 && filtered[active] ? `${baseId}-opt-${active}` : undefined}
            className="w-full bg-input border border-border rounded-md pl-8 pr-3 py-2 text-sm text-foreground
                       placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Lista */}
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={label}
        className="flex-1 overflow-y-auto overscroll-contain py-1"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</li>
        ) : (
          filtered.map((opt, idx) => {
            const selected = opt === value;
            const isActive = idx === active;
            return (
              <li
                key={opt}
                id={`${baseId}-opt-${idx}`}
                data-idx={idx}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer
                  ${isActive ? 'bg-primary/15 text-foreground' : 'text-foreground/90'}
                  ${selected ? 'font-semibold' : ''}`}
              >
                <span className="truncate">{opt}</span>
                {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </li>
            );
          })
        )}
      </ul>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      {label && (
        <label id={`${baseId}-label`} className="label">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        onClick={() => !disabled && !loading && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={label ? `${baseId}-label` : undefined}
        aria-invalid={!!error}
        className={`input flex items-center justify-between gap-2 text-left
          ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
          ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
      >
        <span className={`truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {loading ? 'Cargando…' : (value || placeholder)}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {showClear && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpiar selección"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Hint / error */}
      {disabled && disabledHint && !error && (
        <p className="text-xs text-muted-foreground mt-1">{disabledHint}</p>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

      {popup}
    </div>
  );
}
