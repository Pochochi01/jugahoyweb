import api from './api';

/**
 * Conexión OAuth de MercadoPago por complejo.
 * El access/refresh token nunca llegan al frontend: solo el estado y el correo.
 */
export const mercadopagoService = {
  estado:      (cid) => api.get(`/auth/mercadopago/${cid}/estado`),
  // Devuelve la URL de autorización de MercadoPago (con `state` firmado) para navegar a ella
  urlConexion: (cid) => api.get('/auth/mercadopago/connect', { params: { complex_id: cid } }),
  renovar:     (cid) => api.post(`/auth/mercadopago/${cid}/renovar`),
  desconectar: (cid) => api.delete(`/auth/mercadopago/${cid}`),
};
