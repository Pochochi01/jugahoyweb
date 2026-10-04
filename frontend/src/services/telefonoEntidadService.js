import api from './api';
import { profApi } from './profesoresService';

/**
 * WhatsApp propio de una entidad (torneo, escuela o profesor) vinculado por QR.
 * Todas las rutas comparten la misma forma; cambia la base y el cliente HTTP
 * (api = admin/colaborador, orgApi = organizador, profApi = profesor).
 */
export function telefonoApi(client, base) {
  return {
    estado:        ()        => client.get(base),
    conectar:      ()        => client.post(`${base}/conectar`),
    desconectar:   ()        => client.delete(base),
    destinatarios: (params)  => client.get(`${base}/destinatarios`, { params }),
    enviar:        (d)       => client.post(`${base}/enviar`, d),   // { mensaje, numeros?, categoria_id? }
    red:           (forzar)  => client.get(`${base}/red`, { params: forzar ? { forzar: 1 } : {} }),   // diagnóstico de salida a WhatsApp Web
  };
}

export const telefonoTorneo  = (client, cid, tid) => telefonoApi(client, `/torneos/club/${cid}/torneos/${tid}/whatsapp`);
export const telefonoEscuela = (cid, eid) => telefonoApi(api, `/escuela/club/${cid}/escuelas/${eid}/whatsapp`);
export const telefonoEscuelaEntrenador = (cid, eid) => telefonoApi(profApi, `/escuela/profesor/club/${cid}/escuelas/${eid}/whatsapp`);
export const telefonoProfesor = (cid) => telefonoApi(profApi, `/profesores/me/club/${cid}/whatsapp`);
export const telefonoProfesorAdmin = (cid, pid) => telefonoApi(api, `/profesores/club/${cid}/profesores/${pid}/whatsapp`);
