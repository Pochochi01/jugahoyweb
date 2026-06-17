import api from './api';

export const adminService = {
  getComplexes:        ()         => api.get('/admin/complexes'),
  getStats:            ()         => api.get('/admin/stats'),
  createSubscription:  (data)     => api.post('/admin/subscriptions', data),
  updateSubscription:  (id, data) => api.put(`/admin/subscriptions/${id}`, data),
  toggleSubscription:  (id)       => api.patch(`/admin/subscriptions/${id}/toggle`),
  deleteSubscription:  (id)       => api.delete(`/admin/subscriptions/${id}`),
};
