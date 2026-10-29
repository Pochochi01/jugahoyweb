import api from './api';

export const statsService = {
  getGlobal: () => api.get('/stats/global'),
  getByComplex: (complexId, params) => api.get(`/stats/${complexId}`, { params }),
  // Estadísticas de asistencia (basadas en turnos reales)
  getAttendance: (complexId, params) => api.get(`/stats/${complexId}/asistencias`, { params }),
  // Inteligencia de Agenda (analítica operativa, separada de las estadísticas actuales)
  getAgendaAnalitica: (complexId, params) => api.get(`/stats/${complexId}/agenda-analitica`, { params }),
  getAgendaFiltros:   (complexId) => api.get(`/stats/${complexId}/agenda-analitica/filtros`),
  getNoShows:    (complexId, params) => api.get(`/stats/${complexId}/no-asistidos`, { params }),
};
