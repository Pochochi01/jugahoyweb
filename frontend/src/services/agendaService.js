import api from './api';

export const agendaService = {
  getSlots:      (complexId, fieldId, date)      => api.get(`/agenda/${complexId}/cancha/${fieldId}`, { params: { date } }),
  getPendientes: (complexId)                     => api.get(`/agenda/${complexId}/pendientes`),
  reservar:      (complexId, data)               => api.post(`/agenda/${complexId}/reservar`, data),
  cancelar:      (complexId, bookingId)          => api.put(`/agenda/${complexId}/cancelar/${bookingId}`),
  confirmar:     (complexId, bookingId)          => api.put(`/agenda/${complexId}/confirmar/${bookingId}`),
  rechazar:      (complexId, bookingId, motivo)  => api.put(`/agenda/${complexId}/rechazar/${bookingId}`, { motivo }),
  getByComplex:  (complexId, params)             => api.get(`/agenda/${complexId}`, { params }),
  create:        (complexId, data)               => api.post(`/agenda/${complexId}`, data),
  update:        (complexId, id, data)           => api.put(`/agenda/${complexId}/${id}`, data),
  remove:        (complexId, id)                 => api.delete(`/agenda/${complexId}/${id}`),
};
