import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, X, CheckCircle, XCircle, CalendarClock } from 'lucide-react';
import { notificationsService } from '../services/notificationsService';

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
  const [notifs,  setNotifs]  = useState([]);
  const [open,    setOpen]    = useState(false);
  const ref = useRef(null);

  const load = useCallback(() => {
    notificationsService.getAll().then(setNotifs).catch(() => {});
  }, []);

  // Polling cada 30 segundos
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifs.filter(n => !n.leida).length;

  const handleOpen = () => {
    setOpen(o => !o);
  };

  const markOne = async (id) => {
    await notificationsService.markRead(id);
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, leida: true } : n));
  };

  const markAll = async () => {
    await notificationsService.markAllRead();
    setNotifs(ns => ns.map(n => ({ ...n, leida: true })));
  };

  return (
    <div ref={ref} className="relative">
      {/* Campana */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        title="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[92vw] bg-white rounded-2xl shadow-xl border border-border z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Notificaciones</span>
              {unread > 0 && (
                <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">{unread} nueva{unread !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex gap-1">
              {unread > 0 && (
                <button onClick={markAll}
                  title="Marcar todas como leídas"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : notifs.map(n => {
              const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.nueva_reserva;
              const Icon = cfg.icon;
              return (
                <div key={n.id}
                  className={`flex gap-3 px-4 py-3 transition-colors ${n.leida ? 'bg-white' : 'bg-blue-50/40'}`}>
                  {/* Icono */}
                  <div className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold leading-tight ${n.leida ? 'text-foreground' : 'text-primary'}`}>
                        {n.titulo}
                      </p>
                      {!n.leida && (
                        <button onClick={() => markOne(n.id)}
                          title="Marcar como leída"
                          className="text-muted-foreground hover:text-primary shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.mensaje}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                  </div>

                  {/* Punto de no leído */}
                  {!n.leida && <div className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
