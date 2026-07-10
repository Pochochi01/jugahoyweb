import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';

/**
 * PWABadge — registra el Service Worker y muestra un aviso discreto cuando:
 *   - la app quedó lista para funcionar offline, o
 *   - hay una nueva versión disponible (ofrece recargar).
 *
 * El registro es automático (registerType: 'autoUpdate' en vite.config.js);
 * este componente solo agrega la UI de feedback.
 */
export default function PWABadge() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh:  [needRefresh,  setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Chequea actualizaciones cada hora
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });

  const close = () => { setOfflineReady(false); setNeedRefresh(false); };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed z-[9999] bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto sm:max-w-sm
                 bg-card border border-border rounded-xl shadow-2xl p-4 flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        {needRefresh ? <Download className="w-4 h-4 text-primary" /> : <RefreshCw className="w-4 h-4 text-primary" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {needRefresh ? 'Nueva versión disponible' : 'Listo para usar sin conexión'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {needRefresh
            ? 'Actualizá para obtener las últimas mejoras.'
            : 'JugaHoy ya se puede abrir aunque no tengas internet.'}
        </p>

        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="btn-primary text-xs mt-3 py-1.5 px-3"
          >
            Actualizar ahora
          </button>
        )}
      </div>

      <button onClick={close} aria-label="Cerrar"
        className="p-1 -m-1 text-muted-foreground hover:text-foreground shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
