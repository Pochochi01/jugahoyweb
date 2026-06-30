import api from './api';

export const inviteService = {
  // Valida un token y devuelve { field, complex, expires_at } — público
  validate: (token) => api.get(`/invites/${token}`),

  // Genera un nuevo link — requiere auth (complex_admin | collaborator | general_admin)
  generate: (data) => api.post('/invites/generate', data),

  // Lista invites activos de un complejo — requiere auth
  list: (complexId) => api.get(`/invites/list/${complexId}`),

  // Revoca un invite — requiere auth
  revoke: (id) => api.patch(`/invites/${id}/revoke`),
};
