import api from './api';
import { profApi } from './profesoresService';

/** Panel admin / colaborador de la Escuela de fútbol. */
export const escuelaAdmin = (cid) => {
  const b = `/escuela/club/${cid}`;
  return {
    config:        ()          => api.get(`${b}/config`),
    guardarConfig: (d)         => api.put(`${b}/config`, d),
    canchas:       ()          => api.get(`${b}/canchas`),

    categorias:      ()        => api.get(`${b}/categorias`),
    crearCategoria:  (d)       => api.post(`${b}/categorias`, d),
    editarCategoria: (id, d)   => api.put(`${b}/categorias/${id}`, d),
    borrarCategoria: (id)      => api.delete(`${b}/categorias/${id}`),

    alumnos:       (params)    => api.get(`${b}/alumnos`, { params }),
    crearAlumno:   (d)         => api.post(`${b}/alumnos`, d),
    editarAlumno:  (id, d)     => api.put(`${b}/alumnos/${id}`, d),
    borrarAlumno:  (id)        => api.delete(`${b}/alumnos/${id}`),
    contexto:      (id, params) => api.get(`${b}/alumnos/${id}/contexto`, { params }),
    nuevoLink:     (id)        => api.post(`${b}/alumnos/${id}/nuevo-link`),

    entrenadores:      ()      => api.get(`${b}/entrenadores`),
    asignarCategorias: (id, categoria_ids) => api.put(`${b}/entrenadores/${id}/categorias`, { categoria_ids }),

    horarios:       ()         => api.get(`${b}/horarios`),
    crearHorario:   (d)        => api.post(`${b}/horarios`, d),
    editarHorario:  (id, d)    => api.put(`${b}/horarios/${id}`, d),
    borrarHorario:  (id)       => api.delete(`${b}/horarios/${id}`),

    pagos:          (params)   => api.get(`${b}/pagos`, { params }),
    crearPago:      (d)        => api.post(`${b}/pagos`, d),
    generarCuotas:  (periodo)  => api.post(`${b}/pagos/generar`, { periodo }),
    pagar:          (id, metodo_pago) => api.post(`${b}/pagos/${id}/pagar`, { metodo_pago }),
    anular:         (id)       => api.post(`${b}/pagos/${id}/anular`),
    borrarPago:     (id)       => api.delete(`${b}/pagos/${id}`),

    avisos:         (params)   => api.get(`${b}/avisos`, { params }),
    crearAviso:     (d)        => api.post(`${b}/avisos`, d),
    borrarAviso:    (id)       => api.delete(`${b}/avisos/${id}`),
  };
};

/** Entrenador (sesión de profesor, login por DNI). */
export const escuelaProfesor = (cid) => {
  const b = `/escuela/profesor/club/${cid}`;
  return {
    resumen:       ()          => profApi.get(`${b}/resumen`),
    crearHorario:  (d)         => profApi.post(`${b}/horarios`, d),
    editarHorario: (id, d)     => profApi.put(`${b}/horarios/${id}`, d),
    borrarHorario: (id)        => profApi.delete(`${b}/horarios/${id}`),
    crearAviso:    (d)         => profApi.post(`${b}/avisos`, d),
    contexto:      (id)        => profApi.get(`${b}/alumnos/${id}/contexto`),
  };
};

/** Portal del alumno / padre (link personal, sin login). */
export const escuelaPortal = (token) => api.get(`/escuela/portal/${token}`);
