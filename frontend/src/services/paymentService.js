import api from './api';

/**
 * Pagos con MercadoPago (Checkout Pro).
 *  - initMp: crea la preference y devuelve init_point para redirigir.
 *  - sync:   al volver de MP, confirma el estado real (no confía en query params).
 */
export const paymentService = {
  // { reserva_id, cancha_id, player_id, tipoPago } → { init_point, sandbox_init_point, ... }
  initMp: (data) => api.post('/payments/init-mp', data),

  // Confirma el pago al regresar. reserva_id ayuda a resolver el complejo.
  sync: (paymentId, reservaId) =>
    api.get('/payments/sync', { params: { payment_id: paymentId, reserva_id: reservaId } }),
};
