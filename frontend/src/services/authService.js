/**
 * services/authService.js
 * Todos los endpoints de autenticación y skills relacionados.
 */
import api from './api';

export const authService = {
  // ── Existentes ───────────────────────────────────────────
  login:    (email, password) => api.post('/auth/login',    { email, password }),
  register: (data)            => api.post('/auth/register', data),
  me:       ()                => api.get('/auth/me'),

  // ── authSkill: recuperación de contraseña ────────────────
  requestPasswordReset:  (email)                 =>
    api.post('/auth/reset-password',         { email }),
  confirmPasswordReset:  (token, newPassword)    =>
    api.post('/auth/reset-password/confirm', { token, newPassword }),

  // ── googleAuthSkill: URL de inicio de sesión con Google ──
  // Redirigir directamente (no es llamada AJAX):
  //   window.location.href = authService.googleLoginUrl()
  googleLoginUrl: () =>
    `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/google`,

  // ── phoneAuthSkill: OTP por SMS/WhatsApp ─────────────────
  sendOTP:   (telefono)      => api.post('/auth/phone/send',   { telefono }),
  verifyOTP: (telefono, otp) => api.post('/auth/phone/verify', { telefono, otp }),

  // ── termsSkill ────────────────────────────────────────────
  getTerms:    ()         => api.get('/terms'),
  acceptTerms: (version)  => api.post('/terms/accept', { version }),
};
