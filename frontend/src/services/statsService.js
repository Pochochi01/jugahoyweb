import api from './api';

export const statsService = {
  getGlobal: () => api.get('/stats/global'),
  getByComplex: (complexId, params) => api.get(`/stats/${complexId}`, { params }),
  // Estadísticas de asistencia (basadas en turnos reales)
  getAttendance: (complexId, params) => api.get(`/stats/${complexId}/asistencias`, { params }),
  getNoShows:    (complexId, params) => api.get(`/stats/${complexId}/no-asistidos`, { params }),
};
