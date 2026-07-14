import { pushService } from '../services/pushService';

// Convierte la clave VAPID (base64url) al Uint8Array que espera pushManager.subscribe
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// El navegador soporta push (y estamos en contexto seguro: https o localhost)
export function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// Suscripción existente en este navegador (o null)
export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Pide permiso (si hace falta), crea/reutiliza la suscripción y la registra en el backend.
 * Devuelve la suscripción. Lanza error si el navegador no soporta o el permiso es denegado.
 */
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('Tu navegador no soporta notificaciones push.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado.');

  const { publicKey } = await pushService.getVapidKey();
  if (!publicKey) throw new Error('El servidor no tiene notificaciones push configuradas.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,                       // requerido por los navegadores
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  // Registrar en el backend (idempotente por endpoint)
  await pushService.subscribe(sub.toJSON());
  return sub;
}

// Quita la suscripción del navegador y del backend
export async function unsubscribeFromPush() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await pushService.unsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
