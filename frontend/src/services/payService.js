import api from './api';

const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

/** Jugahoy Pay — página pública /pay/:token (sin sesión). */
export const payPublico = {
  orden: (token) => fetch(`${baseURL}/pay/public/${token}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw { ...d, status: r.status }; return d; }),
  checkout: (token, monto) => fetch(`${baseURL}/pay/public/${token}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(monto ? { monto } : {}) })
    .then(async (r) => { const d = await r.json(); if (!r.ok) throw { ...d, status: r.status }; return d; }),
  qrUrl: (token, w = 600) => `${baseURL}/pay/public/${token}/qr?w=${w}`,
  /** Estado en tiempo real (SSE). Devuelve la función para cerrar. */
  escuchar: (token, onEvento) => {
    const es = new EventSource(`${baseURL}/pay/public/${token}/events`);
    es.onmessage = (e) => { try { onEvento(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => es.close();
  },
};

/** Jugahoy Pay — panel del club. */
export const payClub = (cid) => {
  const b = `/pay/club/${cid}`;
  return {
    crearOrden:     (d)           => api.post(`${b}/ordenes`, d),
    ordenes:        (params)      => api.get(`${b}/ordenes`, { params }),
    orden:          (id)          => api.get(`${b}/ordenes/${id}`),
    confirmar:      (id, d)       => api.post(`${b}/ordenes/${id}/confirmar`, d),
    cancelar:       (id, motivo)  => api.post(`${b}/ordenes/${id}/cancelar`, { motivo }),
    reembolsar:     (id)          => api.post(`${b}/ordenes/${id}/reembolsar`, {}),
    recordatorio:   (id)          => api.post(`${b}/ordenes/${id}/recordatorio`, {}),
    liquidar:       (bookingId, d) => api.post(`${b}/reservas/${bookingId}/liquidacion`, d),
    liquidacion:    (bookingId)   => api.get(`${b}/reservas/${bookingId}/liquidacion`),
    ordenCuota:     (pagoId)      => api.post(`${b}/escuela/cuotas/${pagoId}/orden`, {}),
    clientes:       (params)      => api.get(`${b}/cuenta`, { params }),
    cliente:        (key)         => api.get(`${b}/cuenta/${encodeURIComponent(key)}`),
    cobrarSaldo:    (key)         => api.post(`${b}/cuenta/${encodeURIComponent(key)}/cobrar-saldo`, {}),
    dashboard:      (params)      => api.get(`${b}/dashboard`, { params }),
    /** Eventos del club en tiempo real (SSE; el token va por query porque EventSource no manda headers). */
    escuchar: (onEvento) => {
      const es = new EventSource(`${baseURL}${b}/events?access_token=${encodeURIComponent(localStorage.getItem('token') || '')}`);
      es.onmessage = (e) => { try { onEvento(JSON.parse(e.data)); } catch { /* ignore */ } };
      return () => es.close();
    },
  };
};

export const ESTADO_PAY = {
  pendiente:   { label: 'Pendiente', cls: 'badge-yellow' },
  procesando:  { label: 'Procesando', cls: 'badge-blue' },
  parcial:     { label: 'Pago parcial', cls: 'badge-blue' },
  aprobado:    { label: 'Pagado', cls: 'badge-green' },
  rechazado:   { label: 'Rechazado', cls: 'badge-red' },
  vencido:     { label: 'Vencido', cls: 'badge-red' },
  cancelado:   { label: 'Anulado', cls: '' },
  reembolsado: { label: 'Reembolsado', cls: '' },
};
export const MODULO_PAY = {
  reserva: 'Reservas', cantina: 'Cantina', buffet: 'Buffet', escuela: 'Escuelas', torneo: 'Torneos', gym: 'Gimnasio',
  porteria: 'Portería', clase: 'Clases', clinica: 'Clínicas', evento: 'Eventos', alquiler: 'Alquiler', producto: 'Productos',
  multa: 'Multas', cuenta: 'Saldo de cuenta', otro: 'Otros',
};
export const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
