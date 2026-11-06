import axios from 'axios';

// Cliente del Portal de Jugador: token propio ('jug_token'), independiente del de staff.
// Un 401 (sesión vencida) lleva a /jugador/login. Solo hay GET, salvo las credenciales.
const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
const api = axios.create({ baseURL: `${baseURL}/player`, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jug_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    if (status === 401 && !err.config?.url?.startsWith('/auth/')) {
      localStorage.removeItem('jug_token');
      window.location.href = '/jugador/login';
    }
    if (status === 403 && err.response?.data?.code === 'MUST_CHANGE_PASSWORD') window.location.href = '/jugador/cambiar-clave';
    return Promise.reject({ ...(err.response?.data || { message: 'No se pudo conectar con el servidor.' }), status });
  },
);

export const jugadorAuth = {
  login:        (dni, password) => api.post('/auth/login', { dni, password }),
  cambiarClave: (actual, nueva) => api.post('/auth/change-password', { actual, nueva }),
  olvide:       (dni)           => api.post('/auth/forgot', { dni }),
  restablecer:  (token, nueva)  => api.post('/auth/reset', { token, nueva }),
  salir:        ()              => localStorage.removeItem('jug_token'),
  logueado:     ()              => Boolean(localStorage.getItem('jug_token')),
};

export const jugador = {
  dashboard: ()                => api.get('/dashboard'),
  torneos:   (params)          => api.get('/tournaments', { params }),
  torneo:    (id, params)      => api.get(`/tournament/${id}`, { params }),
  posiciones:(id, params)      => api.get(`/tournament/${id}/standings`, { params }),
  partidos:  (id, params)      => api.get(`/tournament/${id}/matches`, { params }),
  liga:      (id)              => api.get(`/league/${id}`),
  historial: (id, params)      => api.get(`/league/${id}/history`, { params }),
};

// ── Notificaciones push del dispositivo ──
// Firebase Cloud Messaging si están VITE_FIREBASE_CONFIG (JSON) y VITE_FIREBASE_VAPID_KEY;
// si no, Web Push estándar con la clave VAPID del servidor. Solo con la PWA instalada.
const b64aUint8 = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};
const FIREBASE_CONFIG = (() => { try { return JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || 'null'); } catch { return null; } })();
const FIREBASE_VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const usaFcm = () => Boolean(FIREBASE_CONFIG && FIREBASE_VAPID);
const K_TOKEN = 'jug_fcm_token';
export const instaladaComoApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches || window.navigator.standalone === true;

async function tokenFcm(reg) {
  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await isSupported())) return null;
  const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
  // Usa el Service Worker de la PWA (push-sw.js arma la notificación): no hace falta firebase-messaging-sw.js
  return getToken(getMessaging(app), { vapidKey: FIREBASE_VAPID, serviceWorkerRegistration: reg });
}

/** Alta o renovación: el token de FCM puede rotar y la suscripción Web Push puede cambiar. */
async function registrar(reg) {
  const installed = instaladaComoApp();
  if (usaFcm()) {
    const token = await tokenFcm(reg);
    if (token) {
      const anterior = localStorage.getItem(K_TOKEN);
      await api.post('/push/subscribe', { proveedor: 'fcm', fcm_token: token, token_anterior: anterior && anterior !== token ? anterior : undefined, installed });
      localStorage.setItem(K_TOKEN, token);
      return;
    }
  }
  const { key } = await api.get('/push/vapid-public-key');
  if (!key) throw { message: 'Las notificaciones no están disponibles en este momento.' };
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aUint8(key) });
  await api.post('/push/subscribe', { subscription: sub.toJSON(), installed });
}

export const jugadorPush = {
  soportado: () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  permiso: () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'),
  instalada: instaladaComoApp,
  async activo() {
    if (!jugadorPush.soportado() || Notification.permission !== 'granted') return false;
    if (usaFcm() && localStorage.getItem(K_TOKEN)) return true;
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(await reg?.pushManager.getSubscription());
  },
  async activar() {
    if (!jugadorPush.soportado()) throw { message: 'Este navegador no admite notificaciones. En iPhone/iPad instalá la app y abrila desde el ícono.' };
    if (!instaladaComoApp()) throw { message: 'Instalá la app de JugaHoy y abrila desde el ícono para activar las notificaciones.' };
    if (await Notification.requestPermission() !== 'granted') throw { message: 'No diste permiso para las notificaciones. Podés habilitarlo en la configuración del navegador.' };
    await registrar(await navigator.serviceWorker.ready);
  },
  /** Al abrir el portal: renueva el token y el último uso del dispositivo si ya estaba activo (silencioso). */
  async renovar() {
    try {
      if (!(await jugadorPush.activo())) return;
      await registrar(await navigator.serviceWorker.ready);
    } catch { /* sin red o sin permiso: se reintenta en la próxima visita */ }
  },
  async desactivar() {
    const token = localStorage.getItem(K_TOKEN);
    if (token) {
      await api.post('/push/unsubscribe', { fcm_token: token }).catch(() => {});
      localStorage.removeItem(K_TOKEN);
      try {
        const [{ getApps }, { getMessaging, deleteToken }] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
        if (getApps()[0]) await deleteToken(getMessaging(getApps()[0]));
      } catch { /* el token ya no existe */ }
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  },
  preferencias: () => api.get('/push/preferences'),
  estado: () => api.get('/push/estado'),            // dispositivos + últimas notificaciones (diagnóstico)
  prueba: () => api.post('/push/test', {}),          // notificación de prueba a este jugador
  guardarPreferencias: (d) => api.post('/push/preferences', d),
};
