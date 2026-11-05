/* ══════════════════════════════════════════════════════════════
   push-sw.js — Handlers de Web Push para la PWA.
   Se importa dentro del Service Worker generado por vite-plugin-pwa
   (Workbox) mediante `workbox.importScripts` en vite.config.js.
   Así conviven el precache/offline (Workbox) y las notificaciones push.

   Formatos aceptados:
   - Web Push (VAPID):  { titulo, body, url, tipo, log_id, t, actions, data }
   - Firebase (FCM):    { data: { titulo, body, url, ... }, from, fcmMessageId }   (mensaje de datos)
   Notificaciones de torneos (log_id + t): el SW avisa "entregado" al recibir y "abierto" al tocar.
   ══════════════════════════════════════════════════════════════ */

const TRACKING_URL = '/api/push-tracking';

function seguimiento(d, evento) {
  if (!d || !d.log_id || !d.t) return Promise.resolve();
  return fetch(TRACKING_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ id: d.log_id, t: d.t, evento }),
  }).catch(() => { /* sin red: no bloquea la notificación */ });
}

function normalizar(raw) {
  // FCM entrega los campos dentro de `data` (todos como string)
  const d = raw && raw.data && !raw.titulo && !raw.body ? raw.data : (raw || {});
  let actions = d.actions;
  if (typeof actions === 'string') { try { actions = JSON.parse(actions); } catch { actions = []; } }
  return { ...d, actions: Array.isArray(actions) ? actions.slice(0, 2) : [] };
}

// ── Recepción de un push ──────────────────────────────────────
self.addEventListener('push', (event) => {
  let raw = {};
  try {
    raw = event.data ? event.data.json() : {};
  } catch {
    raw = { body: event.data ? event.data.text() : '' };
  }
  const data = normalizar(raw);

  const title = data.titulo || data.title || 'JugaHoy';
  const extra = (data.data && typeof data.data === 'object') ? data.data : {};
  const options = {
    body:  data.body || '',
    icon:  '/icons/icon-192.png',
    badge: '/pwa-192.png',
    // Agrupa por reserva / partido para no apilar duplicados del mismo evento
    tag:   data.tag || (extra.booking_id ? `booking-${extra.booking_id}` : undefined),
    renotify: Boolean(data.tag || extra.booking_id),
    // Los avisos al admin (nueva reserva) quedan hasta que interactúe
    requireInteraction: data.tipo === 'reserva',
    data: { url: data.url || '/', log_id: data.log_id, t: data.t, ...extra },
    actions: data.actions,
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    seguimiento(data, 'entregado'),
  ]));
});

// ── Click en la notificación (o en una acción) ────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};

  // Deep-link según la acción. La confirmación/rechazo real se hace dentro de
  // la app (con la sesión del usuario), no desde el SW.
  let url = d.url || '/';
  if (event.action === 'confirmar' || event.action === 'rechazar') url = '/dashboard';
  if (event.action === 'ver') url = '/mis-turnos';

  event.waitUntil((async () => {
    await seguimiento(d, 'abierto');
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of wins) {
      // Si ya hay una ventana de la app abierta, enfocarla y navegar
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(url); } catch { /* noop */ } }
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
