import api from './api';

/**
 * Cliente del módulo Gym (/api/gym).
 *  - gymApi(complexId): panel (requiere login + módulo habilitado + permiso granular).
 *  - gymSocioApi(token): app del socio por link/QR personal (sin login).
 */
export function gymApi(complexId) {
  const b = `/gym/${complexId}`;
  const crud = (path) => ({
    list: (params) => api.get(`${b}/${path}`, { params }),
    create: (d) => api.post(`${b}/${path}`, d),
    update: (id, d) => api.put(`${b}/${path}/${id}`, d),
    remove: (id) => api.delete(`${b}/${path}/${id}`),
  });
  return {
    contexto: () => api.get(`${b}/contexto`),
    guardarConfig: (d) => api.put(`${b}/config`, d),
    roles: () => api.get(`${b}/roles`),
    guardarRol: (d) => api.put(`${b}/roles`, d),
    asignarRol: (colaboradorId, gym_rol) => api.put(`${b}/roles/colaboradores/${colaboradorId}`, { gym_rol }),

    sucursales: crud('sucursales'),
    actividades: crud('actividades'),
    planes: crud('planes'),
    profesores: crud('profesores'),
    equipos: crud('equipos'),

    socios: (params) => api.get(`${b}/socios`, { params }),
    socio: (id) => api.get(`${b}/socios/${id}`),
    crearSocio: (d) => api.post(`${b}/socios`, d),
    actualizarSocio: (id, d) => api.put(`${b}/socios/${id}`, d),
    estadoSocio: (id, estado, motivo) => api.put(`${b}/socios/${id}/estado`, { estado, motivo }),
    qrSocio: (id) => api.get(`${b}/socios/${id}/qr`),
    aptoSocio: (id, d) => api.post(`${b}/socios/${id}/aptos`, d),
    asignarPlan: (id, d) => api.post(`${b}/socios/${id}/membresias`, d),
    cancelarMembresia: (id) => api.delete(`${b}/membresias/${id}`),
    pagar: (id, d) => api.post(`${b}/socios/${id}/pagos`, d),

    acceso: (d) => api.post(`${b}/acceso`, d),
    accesos: (params) => api.get(`${b}/accesos`, { params }),

    pagos: (params) => api.get(`${b}/pagos`, { params }),
    recibo: (id) => api.get(`${b}/pagos/${id}/recibo`),
    anularPago: (id, motivo) => api.put(`${b}/pagos/${id}/anular`, { motivo }),
    morosos: () => api.get(`${b}/morosos`),
    alertas: () => api.get(`${b}/alertas`),

    clases: (params) => api.get(`${b}/clases`, { params }),
    crearClase: (d) => api.post(`${b}/clases`, d),
    actualizarClase: (id, d) => api.put(`${b}/clases/${id}`, d),
    cancelarClase: (id) => api.put(`${b}/clases/${id}/cancelar`),
    reservasClase: (id) => api.get(`${b}/clases/${id}/reservas`),
    reservar: (claseId, socio_id) => api.post(`${b}/clases/${claseId}/reservas`, { socio_id }),
    cancelarReserva: (id) => api.delete(`${b}/reservas/${id}`),
    tomarAsistencia: (claseId, d) => api.put(`${b}/clases/${claseId}/asistencia`, d),
    asistencia: (params) => api.get(`${b}/asistencia`, { params }),

    statsProfesores: (params) => api.get(`${b}/profesores-estadisticas`, { params }),

    rutinas: (params) => api.get(`${b}/rutinas`, { params }),
    rutina: (id, version) => api.get(`${b}/rutinas/${id}`, { params: version ? { version } : {} }),
    crearRutina: (d) => api.post(`${b}/rutinas`, d),
    versionRutina: (id, d) => api.put(`${b}/rutinas/${id}`, d),
    eliminarRutina: (id) => api.delete(`${b}/rutinas/${id}`),
    asignarPlantilla: (id, socio_id) => api.post(`${b}/rutinas/${id}/asignar`, { socio_id }),
    comentarRutina: (id, texto) => api.post(`${b}/rutinas/${id}/comentarios`, { texto }),

    evaluaciones: (socioId) => api.get(`${b}/socios/${socioId}/evaluaciones`),
    crearEvaluacion: (socioId, d) => api.post(`${b}/socios/${socioId}/evaluaciones`, d),
    eliminarEvaluacion: (id) => api.delete(`${b}/evaluaciones/${id}`),
    nutricion: (socioId) => api.get(`${b}/socios/${socioId}/nutricion`),
    crearNutricion: (socioId, d) => api.post(`${b}/socios/${socioId}/nutricion`, d),
    seguimientoNutricion: (planId, d) => api.post(`${b}/nutricion/${planId}/seguimientos`, d),

    eventosEquipo: (id) => api.get(`${b}/equipos/${id}/eventos`),
    eventoEquipo: (id, d) => api.post(`${b}/equipos/${id}/eventos`, d),

    dashboard: (params) => api.get(`${b}/dashboard`, { params }),
    reporte: (tipo, params) => api.get(`${b}/reportes/${tipo}`, { params }),
    /** Descarga/abre un reporte exportado (CSV → archivo; HTML → pestaña para imprimir/PDF). */
    exportar: async (tipo, formato, params) => {
      const blob = await api.get(`${b}/reportes/${tipo}`, { params: { ...params, formato }, responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      if (formato === 'html') window.open(url, '_blank', 'noopener');
      else { const a = document.createElement('a'); a.href = url; a.download = `gym-${tipo}.csv`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    auditoria: (params) => api.get(`${b}/auditoria`, { params }),
  };
}

export function gymSocioApi(token) {
  const b = `/gym/socio/${token}`;
  return {
    resumen: () => api.get(b),
    reservas: () => api.get(`${b}/reservas`),
    disponibilidad: () => api.get(`${b}/disponibilidad`),
    reservar: (claseId) => api.post(`${b}/clases/${claseId}/reservar`),
    cancelar: (reservaId) => api.delete(`${b}/reservas/${reservaId}`),
    rutinas: () => api.get(`${b}/rutinas`),
    comentarRutina: (id, texto) => api.post(`${b}/rutinas/${id}/comentarios`, { texto }),
    evaluaciones: () => api.get(`${b}/evaluaciones`),
    asistencia: () => api.get(`${b}/asistencia`),
  };
}
