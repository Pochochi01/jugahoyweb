import { useState, useEffect, useLayoutEffect, useRef, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, ChevronsUpDown, Search, MapPin } from 'lucide-react';

/**
 * Selector del complejo activo (barra lateral del panel).
 *
 * Reemplaza al <select> nativo: su lista desplegada la dibuja el sistema
 * operativo y en tema oscuro quedaba ilegible. Esta lista usa los tokens del
 * tema, se renderiza en un portal con posición fija (no la recorta el scroll
 * de la barra lateral), filtra por nombre/ciudad cuando hay muchos complejos
 * (administrador general) y se maneja con teclado: ↑ ↓ Enter Esc.
 */
export default function ComplexSwitcher({ complexes, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const conBusqueda = complexes.length > 6;

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!t) return complexes;
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return complexes.filter(c => norm(c.nombre).includes(t) || norm(c.ciudad).includes(t));
  }, [complexes, q]);

  // Posición del panel: debajo del botón, mismo ancho (mín. 288px), dentro de la ventana
  const ubicar = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(Math.max(r.width, 288), window.innerWidth - 16);
    const left = Math.min(r.left, window.innerWidth - ancho - 8);
    const abajo = window.innerHeight - r.bottom - 12;
    setPos({ top: r.bottom + 6, left: Math.max(8, left), width: ancho, maxHeight: Math.max(220, Math.min(420, abajo)) });
  };
  useLayoutEffect(() => { if (open) ubicar(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setActivo(Math.max(0, complexes.findIndex(c => c.id === selected?.id)));
    const t = setTimeout(() => (conBusqueda ? searchRef.current : listRef.current)?.focus(), 0);
    const fuera = (e) => {
      if (!panelRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false);
    };
    const reubicar = () => ubicar();
    document.addEventListener('mousedown', fuera);
    window.addEventListener('resize', reubicar);
    window.addEventListener('scroll', reubicar, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('resize', reubicar);
      window.removeEventListener('scroll', reubicar, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // El ítem activo siempre visible al navegar con teclado
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activo, open]);
  useEffect(() => { setActivo(0); }, [q]);

  const elegir = (c) => {
    if (c && c.id !== selected?.id) onSelect(c);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, filtrados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActivo(0); }
    else if (e.key === 'End') { e.preventDefault(); setActivo(filtrados.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(filtrados[activo]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const panel = open && pos && createPortal(
    <div ref={panelRef} onKeyDown={onKey}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-pop animate-pop-in origin-top"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}>
      {conBusqueda && (
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar complejo o ciudad…"
            aria-label="Buscar complejo" aria-controls={listId} aria-activedescendant={filtrados[activo] ? `${listId}-${filtrados[activo].id}` : undefined}
            className="w-full rounded-lg bg-input border border-border pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" />
        </div>
      )}
      <ul ref={listRef} id={listId} role="listbox" aria-label="Complejos" tabIndex={conBusqueda ? -1 : 0}
        aria-activedescendant={filtrados[activo] ? `${listId}-${filtrados[activo].id}` : undefined}
        className="flex-1 overflow-y-auto overscroll-contain p-1.5 focus:outline-none">
        {filtrados.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">Ningún complejo coincide con “{q}”.</li>
        )}
        {filtrados.map((c, i) => {
          const sel = c.id === selected?.id;
          return (
            <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={sel} data-index={i}
              onMouseEnter={() => setActivo(i)} onMouseDown={e => e.preventDefault()} onClick={() => elegir(c)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-100
                ${i === activo ? 'bg-muted' : ''}`}>
              <span className={`grid place-items-center w-8 h-8 shrink-0 rounded-lg ${sel ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Building2 className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${sel ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>{c.nombre}</span>
                {c.ciudad && (
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />{c.ciudad}{c.provincia ? `, ${c.provincia}` : ''}
                  </span>
                )}
              </span>
              {sel && <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />}
            </li>
          );
        })}
      </ul>
      {conBusqueda && (
        <div className="border-t border-border px-3 py-1.5 text-2xs text-muted-foreground tabular">
          {filtrados.length} de {complexes.length} complejos
        </div>
      )}
    </div>,
    document.body,
  );

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={`Complejo activo: ${selected?.nombre || 'ninguno'}. Cambiar complejo`}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}
        className={`group flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-[border-color,background-color] duration-160 ease-out
          hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${open ? 'border-primary/60' : 'border-border'}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{selected?.nombre || 'Elegí un complejo'}</span>
          {selected?.ciudad && <span className="block truncate text-xs text-muted-foreground mt-0.5">{selected.ciudad}</span>}
        </span>
        <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
      </button>
      {panel}
    </>
  );
}
