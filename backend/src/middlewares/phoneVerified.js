'use strict';
/**
 * middlewares/phoneVerified.js
 * Corta el acceso a funcionalidades críticas si el teléfono no está verificado.
 *
 * Uso:
 *   router.post('/reservar', authenticate, requirePhoneVerified, ctrl.reservar);
 *
 * Nota: se aplica SOLO a acciones críticas (reservar, pagar), no al login,
 * para no dejar afuera a los usuarios ya existentes.
 */
function requirePhoneVerified(req, res, next) {
  if (req.user?.phone_verified) return next();
  return res.status(403).json({
    message: 'Verificá tu número de WhatsApp para poder continuar.',
    code: 'PHONE_NOT_VERIFIED',
  });
}

module.exports = { requirePhoneVerified };
