import api from './api';

export const settingsService = {
  get:          (complexId)             => api.get(`/settings/${complexId}`),
  update:       (complexId, data)       => api.put(`/settings/${complexId}`, data),
  getFields:    (complexId)             => api.get(`/settings/${complexId}/fields`),
  createField:  (complexId, data)       => api.post(`/settings/${complexId}/fields`, data),
  updateField:  (complexId, id, data)   => api.put(`/settings/${complexId}/fields/${id}`, data),
  toggleField:  (complexId, id)         => api.patch(`/settings/${complexId}/fields/${id}/toggle`),
  deleteField:  (complexId, id)         => api.delete(`/settings/${complexId}/fields/${id}`),
};
