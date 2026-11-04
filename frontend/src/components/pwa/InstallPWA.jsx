/**
 * InstallPWA — invitación a instalar JugaHoy como app (PWA).
 *
 * - Ya instalada (display-mode standalone / iOS navigator.standalone / pwa_installed) → no muestra nada.
 * - Chrome / Edge / Samsung Internet (Android y escritorio): botón "Instalar App" con el
 *   prompt nativo (beforeinstallprompt).
 * - iPhone / iPad Safari: instrucciones "Compartir → Agregar a pantalla de inicio".
 * - Tras 3 rechazos ("Ahora no" o cancelar el prompt nativo) no vuelve a invitar.
 *
 * Uso: <InstallPWA />  (banner)  ·  <InstallPWA variante="boton" />  (solo el botón)
 */
import { useState, useEffect, useSyncExternalStore } from 'react';
import { Download, X, Share, PlusSquare, CheckCircle2, Smartphone } from 'lucide-react';

const K_INSTALADA = 'pwa_installed';
const K_RECHAZOS = 'pwa_install_dismissals';
const MAX_RECHAZOS = 3;

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
};

// El evento llega a veces antes de montar el componente: se captura a nivel de módulo
let promptDiferido = null;
let instaladaAhora = false;
const subs = new Set();
const avisar = () => subs.forEach(fn => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptDiferido = e; avisar(); });
  window.addEventListener('appinstalled', () => { promptDiferido = null; instaladaAhora = true; ls.set(K_INSTALADA, 'true'); avisar(); });
}
const suscribir = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const snapshot = () => `${Boolean(promptDiferido)}|${instaladaAhora}`;

/** Navegador / sistema (para el mensaje adecuado). */
export function detectarPlataforma(ua = navigator.userAgent, nav = navigator) {
  const iPadOS = /Macintosh/.test(ua) && nav.maxTouchPoints > 1;   // iPad con iPadOS 13+ se presenta como Mac
  const ios = /iPhone|iPod/.test(ua) ? 'iphone' : (/iPad/.test(ua) || iPadOS ? 'ipad' : null);
  const android = /Android/i.test(ua);
  const navegador = /SamsungBrowser/i.test(ua) ? 'samsung'
    : /EdgA?\/|Edg\//.test(ua) ? 'edge'
      : /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-otro'
        : /Chrome\//.test(ua) && !/OPR\//.test(ua) ? 'chrome'
          : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'safari'
            : /Firefox\//.test(ua) ? 'firefox' : 'otro';
  return { ios, android, escritorio: !ios && !android && !/Mobi/i.test(ua), navegador };
}

export const estaInstalada = () =>
  ls.get(K_INSTALADA) === 'true'
  || window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: window-controls-overlay)').matches
  || window.navigator.standalone === true;

/** Hook: estado de instalación + acción instalar. */
export function usePWAInstall() {
  useSyncExternalStore(suscribir, snapshot, snapshot);
  const [rechazos, setRechazos] = useState(() => Number(ls.get(K_RECHAZOS)) || 0);
  const plataforma = detectarPlataforma();
  const instalada = instaladaAhora || estaInstalada();
  // Si el usuario la desinstaló, el navegador vuelve a ofrecer el prompt: se limpia la marca
  useEffect(() => { if (promptDiferido && ls.get(K_INSTALADA) === 'true' && !instaladaAhora) localStorage.removeItem(K_INSTALADA); });
  const rechazar = () => { const n = rechazos + 1; ls.set(K_RECHAZOS, String(n)); setRechazos(n); };
  const instalar = async () => {
    if (!promptDiferido) return null;
    const e = promptDiferido;
    promptDiferido = null; avisar();
    e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') { instaladaAhora = true; ls.set(K_INSTALADA, 'true'); avisar(); } else rechazar();
    return outcome;
  };
  const iosSafari = Boolean(plataforma.ios) && plataforma.navegador === 'safari';
  return {
    instalada, plataforma, instalar, rechazar, rechazos,
    puedeNativo: Boolean(promptDiferido),
    iosSafari,
    agotado: rechazos >= MAX_RECHAZOS,
    recienInstalada: instaladaAhora,
  };
}

function Exito() {
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-500" role="status">
      <CheckCircle2 className="w-4 h-4 shrink-0" /> JugaHoy fue instalada correctamente
    </div>
  );
}

export default function InstallPWA({ variante = 'banner', className = '' }) {
  const pwa = usePWAInstall();
  const [cerrado, setCerrado] = useState(false);
  const [verIOS, setVerIOS] = useState(false);

  if (pwa.recienInstalada) {
    return <div className={`${variante === 'banner' ? 'card' : ''} ${className}`}><Exito /></div>;
  }
  if (pwa.instalada) return null;
  const disponible = pwa.puedeNativo || pwa.iosSafari;
  if (!disponible) return null;

  const accion = () => (pwa.puedeNativo ? pwa.instalar() : setVerIOS(v => !v));
  const instruccionesIOS = (
    <ol className="text-sm space-y-1.5 mt-2">
      <li className="flex items-center gap-2">1. Presioná <Share className="w-4 h-4 text-primary" aria-label="Compartir" /> <strong>Compartir</strong> {pwa.plataforma.ios === 'ipad' ? '(arriba a la derecha)' : '(abajo, en la barra de Safari)'}</li>
      <li className="flex items-center gap-2">2. Elegí <PlusSquare className="w-4 h-4 text-primary" /> <strong>Agregar a pantalla de inicio</strong></li>
      <li>3. Tocá <strong>Agregar</strong>. Para recibir notificaciones, abrí JugaHoy desde el ícono.</li>
    </ol>
  );

  // Botón suelto: siempre visible mientras se pueda instalar (aunque se haya rechazado el banner)
  if (variante === 'boton') {
    return (
      <div className={className}>
        <button type="button" className="btn-outline w-full text-sm" onClick={accion}><Download className="w-4 h-4" /> Instalar App</button>
        {verIOS && <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">{instruccionesIOS}</div>}
      </div>
    );
  }

  if (cerrado || pwa.agotado) return null;
  const ahoraNo = () => { pwa.rechazar(); setCerrado(true); };
  return (
    <div role="region" aria-label="Instalar aplicación"
      className={`fixed z-40 inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 bg-card text-foreground border border-border rounded-2xl shadow-2xl p-4 ${className}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <button type="button" onClick={ahoraNo} className="absolute top-2 right-2 p-1 rounded hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
      <div className="flex gap-3 pr-5">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold">Instalá JugaHoy</div>
          <p className="text-sm text-muted-foreground">
            {pwa.iosSafari
              ? 'Agregala a tu pantalla de inicio para entrar con un toque y recibir avisos de tus partidos.'
              : `Acceso directo desde ${pwa.plataforma.escritorio ? 'tu escritorio' : 'el inicio de tu celular'} y notificaciones de tus partidos.`}
          </p>
        </div>
      </div>
      {pwa.iosSafari && instruccionesIOS}
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" className="btn-ghost text-sm" onClick={ahoraNo}>Ahora no</button>
        {pwa.iosSafari
          ? <button type="button" className="btn-primary text-sm" onClick={() => setCerrado(true)}><Smartphone className="w-4 h-4" /> Entendido</button>
          : <button type="button" className="btn-primary text-sm" onClick={accion}><Download className="w-4 h-4" /> Instalar App</button>}
      </div>
    </div>
  );
}
