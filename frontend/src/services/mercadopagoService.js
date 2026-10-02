import api from './api';

/**
 * Conexión OAuth (PKCE) de MercadoPago por complejo.
 * El access/refresh token nunca llegan al frontend: solo el estado y el correo.
 */
export const mercadopagoService = {
  estado:      (cid) => api.get(`/auth/mercadopago/${cid}/estado`),
  // URL de autorización con el code_challenge PKCE (el verifier queda en el navegador)
  urlConexion: (cid, codeChallenge) => api.get('/auth/mercadopago/connect', { params: { complex_id: cid, code_challenge: codeChallenge } }),
  // Termina la conexión: código de MP + state + code_verifier
  canjear:     (d)   => api.post('/auth/mercadopago/callback', d),
  complejoDelState: (state) => api.get('/auth/mercadopago/state', { params: { state } }),
  renovar:     (cid) => api.post(`/auth/mercadopago/${cid}/renovar`),
  desconectar: (cid) => api.delete(`/auth/mercadopago/${cid}`),
};
