import api from './api';

export const collaboratorsService = {
  getAll:  (complexId)           => api.get(`/collaborators/${complexId}`),
  create:  (complexId, data)     => api.post(`/collaborators/${complexId}`, data),
  update:  (complexId, id, data) => api.put(`/collaborators/${complexId}/${id}`, data),
  toggle:  (complexId, id)       => api.patch(`/collaborators/${complexId}/${id}/toggle`),
  remove:  (complexId, id)       => api.delete(`/collaborators/${complexId}/${id}`),
};
