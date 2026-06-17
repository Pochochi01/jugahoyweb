import api from './api';

export const notificationsService = {
  getAll:      ()   => api.get('/notifications'),
  markRead:    (id) => api.put(`/notifications/${id}/leer`),
  markAllRead: ()   => api.put('/notifications/leer-todas'),
};
