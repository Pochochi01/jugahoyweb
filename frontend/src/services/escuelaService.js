import api from './api';

const apiBase = api;
import { profApi } from './profesoresService';

/** Escuelas del complejo (N por complejo, cualquier deporte). */
export const escuelasAdmin = (cid) => {
  const b = `/escuela/club/${cid}/escuelas`;
  return {
    list:   ()        => api.get(b),
    create: (d)       => api.post(b, d),
    update: (id, d)   => api.put(`${b}/${id}`, d),
    remove: (id)      => api.delete(`${b}/${id}`),
  };
};

/**
 * Panel admin / colaborador de UNA escuela: todas las llamadas llevan
 * ?escuela_id= (el backend valida que la escuela sea de este complejo).
 */
export const escuelaAdmin = (cid, escuelaId) => {
  const b = `/escuela/club/${cid}`;
  const conEscuela = (params) => ({ params: { ...params, escuela_id: escuelaId } });
  const api = {
    get:    (url, cfg = {}) => apiBase.get(url, conEscuela(cfg.params)),
    delete: (url, cfg = {}) => apiBase.delete(url, conEscuela(cfg.params)),
    post:   (url, d)        => apiBase.post(url, d, conEscuela()),
    put:    (url, d)        => apiBase.put(url, d, conEscuela()),
  };
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

    // Mensajes a los padres (borrador → envío masivo por el WhatsApp de la escuela)
    plantillasMensaje: ()        => api.get(`${b}/mensajes/plantillas`),
    mensajes:          ()        => api.get(`${b}/mensajes`),
    crearMensaje:      (d)       => api.post(`${b}/mensajes`, d),
    editarMensaje:     (id, d)   => api.put(`${b}/mensajes/${id}`, d),
    borrarMensaje:     (id)      => api.delete(`${b}/mensajes/${id}`),
    duplicarMensaje:   (id)      => api.post(`${b}/mensajes/${id}/duplicar`),
    destinatariosMensaje: (id)   => api.get(`${b}/mensajes/${id}/destinatarios`),
    enviarMensaje:     (id, d)   => api.post(`${b}/mensajes/${id}/enviar`, d),   // { alumno_ids?, textos? }

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
