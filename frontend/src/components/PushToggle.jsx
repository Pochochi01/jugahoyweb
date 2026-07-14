import { useState, useEffect } from 'react';
import { Bell, BellRing, BellOff } from 'lucide-react';
import { pushSupported, getExistingSubscription, subscribeToPush } from '../utils/push';

/**
 * PushToggle — activa las notificaciones push del navegador para el usuario logueado.
 * Se muestra dentro del panel de la campana (admin y player usan el mismo).
 *
 * - Si el permiso ya está concedido, re-sincroniza la suscripción con el backend.
 * - Si está en 'default', ofrece un botón "Activar avisos".
 * - Si está 'denied' o no hay soporte, muestra un estado informativo.
 */
export default function PushToggle() {
  const [state, setState] = useState('loading'); // loading | unsupported | off | on | denied
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    let alive = true;
    if (!pushSupported()) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }

    if (Notification.permission === 'granted') {
      // Re-sincroniza la suscripción con el servidor (por si cambió de cuenta/equipo)
      subscribeToPush()
        .then(() => alive && setState('on'))
        .catch(() => alive && setState('off'));
    } else {
      getExistingSubscription()
        .then(sub => alive && setState(sub ? 'on' : 'off'))
        .catch(() => alive && setState('off'));
    }
    return () => { alive = false; };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      setState('on');
    } catch {
      setState(Notification.permission === 'denied' ? 'denied' : 'off');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading' || state === 'unsupported') return null;

  if (state === 'on') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <BellRing className="w-3.5 h-3.5" /> Avisos activados
      </span>
    );
  }

  if (state === 'denied') {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-400" title="Habilitalos desde los permisos del navegador">
        <BellOff className="w-3.5 h-3.5" /> Avisos bloqueados
      </span>
    );
  }

  return (
    <button onClick={enable} disabled={busy}
      className="flex items-center gap-1 text-xs text-primary hover:underline font-medium disabled:opacity-60">
      <Bell className="w-3.5 h-3.5" /> {busy ? 'Activando…' : 'Activar avisos'}
    </button>
  );
}
