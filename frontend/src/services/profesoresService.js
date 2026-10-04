import axios from 'axios';
import api from './api';

// Cliente del profesor: token propio ('prof_token'); un 401 lleva a /profesor/login.
const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
export const profApi = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });
profApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('prof_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
profApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/login')) {
      localStorage.removeItem('prof_token');
      window.location.href = '/profesor/login';
    }
    return Promise.reject(err.response?.data || err);
  },
);

/** Panel del administrador del complejo. */
export const profesoresAdmin = (cid) => {
  const b = `/profesores/club/${cid}`;
  return {
    canchas:           ()        => api.get(`${b}/canchas`),
    list:              ()        => api.get(`${b}/profesores`),
    create:            (d)       => api.post(`${b}/profesores`, d),
    update:            (id, d)   => api.put(`${b}/profesores/${id}`, d),
    remove:            (id)      => api.delete(`${b}/profesores/${id}`),
    setDisponibilidad: (id, ventanas) => api.put(`${b}/profesores/${id}/disponibilidad`, { ventanas }),
    grilla:            (id, params) => api.get(`${b}/profesores/${id}/grilla`, { params }),
    cancelarClase:     (id, claseId) => api.delete(`${b}/profesores/${id}/clases/${claseId}`),
    asignaciones:      (id)      => api.get(`${b}/profesores/${id}/asignaciones`),
    setAsignaciones:   (id, d)   => api.put(`${b}/profesores/${id}/asignaciones`, d),   // { escuela_ids, torneos:[{torneo_id, rol}] }
  };
};

/** Panel del profesor. */
export const profesorPanel = {
  login:       (dni, password) => profApi.post('/profesores/login', { dni, password }),
  complejos:   ()              => profApi.get('/profesores/me/complejos'),
  consolidado: (params)        => profApi.get('/profesores/me/consolidado', { params }),
  actividades: ()              => profApi.get('/profesores/me/actividades'),   // escuelas y torneos asignados
  grilla:      (cid, params)   => profApi.get(`/profesores/me/club/${cid}/grilla`, { params }),
  crearClase:  (cid, d)        => profApi.post(`/profesores/me/club/${cid}/clases`, d),
  editarClase: (cid, id, d)    => profApi.put(`/profesores/me/club/${cid}/clases/${id}`, d),
  cancelarClase: (cid, id)     => profApi.delete(`/profesores/me/club/${cid}/clases/${id}`),
};
