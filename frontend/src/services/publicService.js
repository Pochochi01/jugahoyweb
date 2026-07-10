import api from './api';

export const publicService = {
  // params opcionales: { provincia, ciudad, q }
  getComplexes:    (params = {})      => api.get('/public/complexes', { params }),
  getComplex:      (id)               => api.get(`/public/complexes/${id}`),
  getSlots:        (id, date)         => api.get(`/public/complexes/${id}/slots`, { params: { date } }),
  reserve:         (complexId, data)  => api.post(`/public/complexes/${complexId}/reservar`, data),
  getMyBookings:   ()                 => api.get('/public/my-bookings'),
  cancelMyBooking: (id)               => api.put(`/public/my-bookings/${id}/cancelar`),
  registerComplex: (data)             => api.post('/public/register-complex', data),

  // Catálogo de ubicaciones para el wizard de alta de complejo
  getProvincias:   ()                 => api.get('/public/provincias'),
  getLocalidades:  (provincia)        => api.get('/public/localidades', { params: { provincia } }),
};
