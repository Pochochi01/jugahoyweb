import axios from 'axios';
import api from './api';

// ── Cliente del organizador ───────────────────────────────────
// Token propio (localStorage 'org_token'), separado del de usuarios: un 401
// lleva al login de organizador, no al de la plataforma.
const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
export const orgApi = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });
orgApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('org_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
orgApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/login')) {
      localStorage.removeItem('org_token');
      window.location.href = '/organizador/login';
    }
    return Promise.reject(err.response?.data || err);
  },
);

/** URL absoluta de un archivo subido al backend (/uploads/...). */
export const uploadUrl = (p) => (!p ? null : /^https?:/.test(p) ? p : `${import.meta.env.VITE_API_URL || ''}${p}`);

/**
 * Operaciones del panel de torneos para un club.
 * @param {import('axios').AxiosInstance} client  `api` (admin/colaborador) u `orgApi` (organizador)
 * @param {number} cid  complexId
 */
export function torneosStaff(client, cid) {
  const b = `/torneos/club/${cid}`;
  const t = (tid) => `${b}/torneos/${tid}`;
  return {
    // Organizadores (solo admin del club)
    listOrganizadores:  ()          => client.get(`${b}/organizadores`),
    createOrganizador:  (d)         => client.post(`${b}/organizadores`, d),
    updateOrganizador:  (id, d)     => client.put(`${b}/organizadores/${id}`, d),
    deleteOrganizador:  (id)        => client.delete(`${b}/organizadores/${id}`),
    validarTicket:      (codigo)    => client.post(`${b}/tickets/validar`, { codigo }),

    // Torneos
    list:          ()          => client.get(`${b}/torneos`),
    get:           (tid)       => client.get(t(tid)),
    create:        (d)         => client.post(`${b}/torneos`, d),
    update:        (tid, d)    => client.put(t(tid), d),
    remove:        (tid)       => client.delete(t(tid)),
    setEstado:     (tid, estado) => client.put(`${t(tid)}/estado`, { estado }),
    subirImagen:   (tid, file) => {
      const fd = new FormData(); fd.append('imagen', file);
      return client.post(`${t(tid)}/imagen`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },

    // Canchas y horarios
    getCanchas:    (tid)       => client.get(`${t(tid)}/canchas`),
    setCanchas:    (tid, canchas) => client.put(`${t(tid)}/canchas`, { canchas }),
    getSlots:      (tid)       => client.get(`${t(tid)}/slots`),

    // Inscripciones y pagos
    listParejas:   (tid, params) => client.get(`${t(tid)}/parejas`, { params }),
    createPareja:  (tid, d)    => client.post(`${t(tid)}/parejas`, d),
    updatePareja:  (tid, pid, d) => client.put(`${t(tid)}/parejas/${pid}`, d),
    setPago:       (tid, pid, d) => client.put(`${t(tid)}/parejas/${pid}/pago`, d),

    // Fixture y resultados
    generarZonas:  (tid, d)    => client.post(`${t(tid)}/zonas/generar`, d),
    generarLlave:  (tid, d)    => client.post(`${t(tid)}/llave/generar`, d),
    fixture:       (tid)       => client.get(`${t(tid)}/fixture`),
    ranking:       (tid)       => client.get(`${t(tid)}/ranking`),
    reprogramar:   (tid, pid, d) => client.put(`${t(tid)}/partidos/${pid}/programacion`, d),
    partidos:      (tid, params) => client.get(`${t(tid)}/partidos`, { params }),
    setResultado:  (tid, pid, d) => client.put(`${t(tid)}/partidos/${pid}/resultado`, d),
    borrarResultado: (tid, pid) => client.delete(`${t(tid)}/partidos/${pid}/resultado`),

    // Comunicación
    canal:         (tid)       => client.get(`${t(tid)}/comunicacion/canal`),
    difundir:      (tid, d)    => client.post(`${t(tid)}/comunicacion/mensaje`, d),
    proximos:      (tid)       => client.post(`${t(tid)}/comunicacion/proximos-partidos`, {}),
  };
}

export const organizadorAuth = {
  login: (usuario, password) => orgApi.post('/torneos/organizador/login', { usuario, password }),
  me:    (cid)               => orgApi.get(`/torneos/club/${cid}/organizador/me`),
};

// ── Público ───────────────────────────────────────────────────
export const torneosPublic = {
  list:       (complexId) => api.get(complexId ? `/torneos/public/club/${complexId}` : '/torneos/public'),
  get:        (tid)       => api.get(`/torneos/public/${tid}`),
  fixture:    (tid)       => api.get(`/torneos/public/${tid}/fixture`),
  ranking:    (tid)       => api.get(`/torneos/public/${tid}/ranking`),
  miPareja:   (tid, dni)  => api.get(`/torneos/public/${tid}/mi-pareja`, { params: { dni } }),
  inscribir:  (tid, d)    => api.post(`/torneos/public/${tid}/inscripciones`, d),
  pagar:      (parejaId)  => api.post(`/torneos/public/parejas/${parejaId}/pagar`),
  syncPago:   (params)    => api.get('/torneos/public/pagos/sync', { params }),
  ticket:     (codigo)    => api.get(`/torneos/public/tickets/${codigo}`),
};
