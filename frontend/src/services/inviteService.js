import api from './api';

export const inviteService = {
  // Valida un token y devuelve { field, complex, expires_at } — público
  validate: (token) => api.get(`/invites/${token}`),

  // Vincula al usuario autenticado con el complejo del invite — requiere auth.
  // Devuelve { ok, complex_id, field_id }
  claim: (token) => api.post(`/invites/${token}/claim`),

  // Genera un nuevo link — requiere auth (complex_admin | collaborator | general_admin)
  generate: (data) => api.post('/invites/generate', data),

  // Lista invites activos de un complejo — requiere auth
  list: (complexId) => api.get(`/invites/list/${complexId}`),

  // Revoca un invite — requiere auth
  revoke: (id) => api.patch(`/invites/${id}/revoke`),
};
