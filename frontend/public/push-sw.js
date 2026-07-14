/* ══════════════════════════════════════════════════════════════
   push-sw.js — Handlers de Web Push para la PWA.
   Se importa dentro del Service Worker generado por vite-plugin-pwa
   (Workbox) mediante `workbox.importScripts` en vite.config.js.
   Así conviven el precache/offline (Workbox) y las notificaciones push.
   ══════════════════════════════════════════════════════════════ */

// ── Recepción de un push ──────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.titulo || 'JugaHoy';
  const options = {
    body:  data.body || '',
    icon:  '/pwa-192.png',
    badge: '/pwa-192.png',
    // Agrupa por reserva para no apilar duplicados del mismo turno
    tag:   data.data?.booking_id ? `booking-${data.data.booking_id}` : undefined,
    renotify: true,
    // Los avisos al admin (nueva reserva) quedan hasta que interactúe
    requireInteraction: data.tipo === 'reserva',
    data: { url: data.url || '/', ...(data.data || {}) },
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
