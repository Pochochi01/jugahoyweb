import api from './api';

export const complexService = {
  getAll: () => api.get('/complexes'),
  getOne: (id) => api.get(`/complexes/${id}`),
  create: (data) => api.post('/complexes', data),
  update: (id, data) => api.put(`/complexes/${id}`, data),
  remove: (id) => api.delete(`/complexes/${id}`),
};
