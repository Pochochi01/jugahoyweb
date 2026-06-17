import api from './api';

export const statsService = {
  getGlobal: () => api.get('/stats/global'),
  getByComplex: (complexId, params) => api.get(`/stats/${complexId}`, { params }),
};
