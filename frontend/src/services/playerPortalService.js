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
const b64aUint8 = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};
export const jugadorPush = {
  soportado: () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  permiso: () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'),
  async activo() {
    if (!jugadorPush.soportado()) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(await reg?.pushManager.getSubscription());
  },
  async activar() {
    if (!jugadorPush.soportado()) throw { message: 'Este navegador no admite notificaciones. En iPhone/iPad instalá la app y abrila desde el ícono.' };
    if (await Notification.requestPermission() !== 'granted') throw { message: 'No diste permiso para las notificaciones. Podés habilitarlo en la configuración del navegador.' };
    const { key } = await api.get('/push/vapid-public-key');
    if (!key) throw { message: 'Las notificaciones no están disponibles en este momento.' };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aUint8(key) });
    await api.post('/push/subscribe', { subscription: sub.toJSON() });
  },
  async desactivar() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  },
};
