import api from './api';

/**
 * Verificación del teléfono por WhatsApp (OTP).
 */
export const verificationService = {
  status:      ()            => api.get('/verification/status'),
  sendCode:    (telefono)    => api.post('/verification/phone/send', telefono ? { telefono } : {}),
  confirmCode: (code)        => api.post('/verification/phone/confirm', { code }),
};
