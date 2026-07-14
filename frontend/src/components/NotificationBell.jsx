import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, X, CheckCircle, XCircle, CalendarClock } from 'lucide-react';
import { notificationsService } from '../services/notificationsService';
import PushToggle from './PushToggle';

const TIPO_CONFIG = {
  nueva_reserva:      { icon: CalendarClock, color: 'text-blue-500',  bg: 'bg-blue-50' },
  reserva_confirmada: { icon: CheckCircle,   color: 'text-green-500', bg: 'bg-green-50' },
  reserva_rechazada:  { icon: XCircle,       color: 'text-red-500',   bg: 'bg-red-50' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
}

export default function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [open,   setOpen]   = useState(false);
  const [coords, setCoords] = useState(null); // posición del panel (fixed)

  const bellRef  = useRef(null);
  const panelRef = useRef(null);

  const load = useCallback(() => {
    notificationsService.getAll().then(setNotifs).catch(() => {});
  }, []);

  // Polling cada 30 segundos
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // ── Posición del panel calculada desde la campana ──────────
  // Se renderiza en un portal a <body> con position:fixed, evitando que el
  // `backdrop-filter` del header (que crea un containing block) lo descoloque.
  const computePosition = useCallback(() => {
    const el = bellRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // Móvil: panel casi full-width, anclado bajo la campana
      setCoords({
        left: 12, right: 12, width: undefined,
        top: r.bottom + gap,
        maxHeight: window.innerHeight - r.bottom - gap - 12,
      });
    } else {
      // Desktop/notebook: centrado en la parte superior de la pantalla.
      // La campana puede estar en un sidebar (abajo a la izquierda) o en la
      // topbar; centrar arriba garantiza que el panel siempre sea visible.
      const width = Math.min(420, window.innerWidth - 32);
      const top   = 72; // debajo de un header típico; en el dashboard queda arriba
      setCoords({
        left: Math.round((window.innerWidth - width) / 2), right: undefined, width,
        top,
        maxHeight: window.innerHeight - top - 24,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const onMove = () => computePosition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, computePosition]);

  // Cerrar al click fuera (campana o panel, que vive en el portal)
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifs.filter(n => !n.leida).length;

  const markOne = async (id) => {
    await notificationsService.markRead(id);
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, leida: true } : n));
  };

  const markAll = async () => {
    await notificationsService.markAllRead();
    setNotifs(ns => ns.map(n => ({ ...n, leida: true })));
  };

  // ── Panel (portal) ─────────────────────────────────────────
  const panel = open && coords ? createPortal(
    <>
      {/* Backdrop translúcido en móvil */}
      <div className="fixed inset-0 bg-black/30 z-[9998] sm:hidden"
        onClick={() => setOpen(false)} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notificaciones"
        className="fixed z-[9999] bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200
                   overflow-hidden flex flex-col"
        style={{
          top: coords.top,
          left: coords.left,
          right: coords.right,
          width: coords.width,
          maxHeight: coords.maxHeight,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm text-slate-900 truncate">Notificaciones</span>
            {unread > 0 && (
              <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full shrink-0">
                {unread} nueva{unread !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {unread > 0 && (
              <button onClick={markAll}
                title="Marcar todas como leídas"
                className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-200/70 transition-colors">
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)}
              title="Cerrar"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de activación de notificaciones push */}
        <div className="px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-500">Notificaciones del dispositivo</span>
          <PushToggle />
        </div>

        {/* Lista — scroll interno, altura fluida */}
        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100">
          {notifs.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin notificaciones</p>
            </div>
          ) : notifs.map(n => {
            const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.nueva_reserva;
            const Icon = cfg.icon;
            return (
              <div key={n.id}
                className={`flex gap-3 px-4 py-3 transition-colors ${n.leida ? 'bg-white hover:bg-slate-50' : 'bg-blue-50'}`}>
                <div className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold leading-snug break-words ${n.leida ? 'text-slate-800' : 'text-slate-900'}`}>
                      {n.titulo}
                    </p>
                    {!n.leida && (
                      <button onClick={() => markOne(n.id)}
                        title="Marcar como leída"
                        className="p-1 -m-1 text-slate-400 hover:text-primary shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">{n.mensaje}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>

                {!n.leida && <div className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />}
              </div>
            );
          })}
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={bellRef}
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        title="Notificaciones"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
