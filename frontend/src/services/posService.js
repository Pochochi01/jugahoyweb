import api from './api';

export const posService = {
  getCurrent: (complexId) => api.get(`/pos/${complexId}/current`),
  getHistory: (complexId) => api.get(`/pos/${complexId}/history`),
  open: (complexId, data) => api.post(`/pos/${complexId}/open`, data),
  close: (complexId) => api.post(`/pos/${complexId}/close`),
  addTransaction: (complexId, data) => api.post(`/pos/${complexId}/transaction`, data),
};
