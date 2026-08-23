import api from './api';

export const agendaService = {
  getSlots:      (complexId, fieldId, date)      => api.get(`/agenda/${complexId}/cancha/${fieldId}`, { params: { date } }),
  conteoDia:     (complexId, date)               => api.get(`/agenda/${complexId}/conteo`, { params: { date } }),
  // Turnos fijos (recurrentes)
  crearFijo:     (complexId, data)               => api.post(`/agenda/${complexId}/fijos`, data),
  listFijos:     (complexId)                     => api.get(`/agenda/${complexId}/fijos`),
  bajaFijo:      (complexId, id)                 => api.delete(`/agenda/${complexId}/fijos/${id}`),
  // Cobro de turnos + consumos
  getTurno:        (complexId, bid)              => api.get(`/agenda/${complexId}/turno/${bid}`),
  productosTurno:  (complexId)                   => api.get(`/agenda/${complexId}/turno-productos`),
  agregarConsumos: (complexId, bid, items)       => api.post(`/agenda/${complexId}/turno/${bid}/consumos`, { items }),
  quitarConsumo:   (complexId, bid, consumoId)   => api.delete(`/agenda/${complexId}/turno/${bid}/consumos/${consumoId}`),
  cobrarTurno:     (complexId, bid, data)        => api.post(`/agenda/${complexId}/turno/${bid}/cobrar`, data),
  getPendientes: (complexId)                     => api.get(`/agenda/${complexId}/pendientes`),
  reservar:      (complexId, data)               => api.post(`/agenda/${complexId}/reservar`, data),
  cancelar:      (complexId, bookingId)          => api.put(`/agenda/${complexId}/cancelar/${bookingId}`),
  confirmar:     (complexId, bookingId)          => api.put(`/agenda/${complexId}/confirmar/${bookingId}`),
  rechazar:      (complexId, bookingId, motivo)  => api.put(`/agenda/${complexId}/rechazar/${bookingId}`, { motivo }),
  noAsistido:    (complexId, bookingId)          => api.patch(`/agenda/${complexId}/no-asistido/${bookingId}`),
  asistio:       (complexId, bookingId)          => api.patch(`/agenda/${complexId}/asistio/${bookingId}`),
  getIncumplidos:    (complexId)     => api.get(`/agenda/${complexId}/incumplidos`),
  habilitarIncumplido: (complexId, id) => api.patch(`/agenda/${complexId}/incumplidos/${id}/habilitar`),
  getByComplex:  (complexId, params)             => api.get(`/agenda/${complexId}`, { params }),
  create:        (complexId, data)               => api.post(`/agenda/${complexId}`, data),
  update:        (complexId, id, data)           => api.put(`/agenda/${complexId}/${id}`, data),
  remove:        (complexId, id)                 => api.delete(`/agenda/${complexId}/${id}`),
};
