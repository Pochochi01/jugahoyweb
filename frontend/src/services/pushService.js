import api from './api';

/**
 * Web Push: obtiene la clave pública VAPID y registra/quita la suscripción.
 */
export const pushService = {
  getVapidKey:  ()             => api.get('/notifications/vapid-public-key'),
  subscribe:    (subscription) => api.post('/notifications/subscribe', { subscription }),
  unsubscribe:  (endpoint)     => api.post('/notifications/unsubscribe', { endpoint }),
};
