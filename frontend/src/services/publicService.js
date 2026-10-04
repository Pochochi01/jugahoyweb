import api from './api';

export const publicService = {
  // params opcionales: { provincia, ciudad, q }
  getComplexes:    (params = {})      => api.get('/public/complexes', { params }),
  getComplex:      (id)               => api.get(`/public/complexes/${id}`),
  getSlots:        (id, date)         => api.get(`/public/complexes/${id}/slots`, { params: { date } }),
  reserve:         (complexId, data)  => api.post(`/public/complexes/${complexId}/reservar`, data),
  opcionesPago:    (complexId, params) => api.get(`/public/complexes/${complexId}/opciones-pago`, { params }),
  // Escuelas, profesores y torneos del complejo (params: { deporte })
  actividades:     (complexId, params = {}) => api.get(`/public/complexes/${complexId}/actividades`, { params }),
  preinscribir:    (complexId, escuelaId, data) => api.post(`/public/complexes/${complexId}/escuelas/${escuelaId}/inscripcion`, data),
  // Verifica el bloqueo por inasistencias ANTES de reservar
  checkBloqueo:    (complexId)        => api.get(`/public/complexes/${complexId}/bloqueo-inasistencias`),
  getMyBookings:   ()                 => api.get('/public/my-bookings'),
  cancelMyBooking: (id)               => api.put(`/public/my-bookings/${id}/cancelar`),
  // Lista de espera
  getOcupados:     (id, date)         => api.get(`/public/complexes/${id}/ocupados`, { params: { date } }),
  addWaitlist:     (complexId, data)  => api.post(`/public/complexes/${complexId}/waitlist`, data),
  registerComplex: (data)             => api.post('/public/register-complex', data),

  // Catálogo de ubicaciones para el wizard de alta de complejo
  getProvincias:   ()                 => api.get('/public/provincias'),
  getLocalidades:  (provincia)        => api.get('/public/localidades', { params: { provincia } }),
};
