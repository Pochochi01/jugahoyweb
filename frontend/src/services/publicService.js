import api from './api';

export const publicService = {
  getComplexes:    ()                 => api.get('/public/complexes'),
  getComplex:      (id)               => api.get(`/public/complexes/${id}`),
  getSlots:        (id, date)         => api.get(`/public/complexes/${id}/slots`, { params: { date } }),
  reserve:         (complexId, data)  => api.post(`/public/complexes/${complexId}/reservar`, data),
  getMyBookings:   ()                 => api.get('/public/my-bookings'),
  cancelMyBooking: (id)               => api.put(`/public/my-bookings/${id}/cancelar`),
  registerComplex: (data)             => api.post('/public/register-complex', data),
};
