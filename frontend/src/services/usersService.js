import api from './api';

export const usersService = {
  getAll:  ()           => api.get('/users'),
  create:  (data)       => api.post('/users', data),
  update:  (id, data)   => api.put(`/users/${id}`, data),
  remove:  (id)         => api.delete(`/users/${id}`),
};
