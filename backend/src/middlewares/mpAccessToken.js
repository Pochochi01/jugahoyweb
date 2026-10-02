'use strict';
/**
 * middlewares/mpAccessToken.js
 * Inyecta en req.mpAccessToken un access token de MercadoPago VÁLIDO del
 * complejo que corresponde a la request (renovándolo si está por vencer).
 *
 * Uso:  router.post('/x', mpAccessToken(req => req.params.complexId), handler)
 * El resolver puede ser async (ej. buscar el complejo de una reserva).
 *
 * Errores: 400 MP_NOT_CONNECTED (el complejo no conectó su cuenta) ·
 *          401 MP_REVOCADO (perdió la autorización: reconectar).
 */
const mp = require('../services/mercadopagoOAuth.service');

function mpAccessToken(resolverComplexId) {
  return async (req, res, next) => {
    try {
      const complexId = await resolverComplexId(req);
      req.mpComplexId = Number(complexId);
      req.mpAccessToken = await mp.accessTokenValido(complexId);
      next();
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
    }
  };
}

module.exports = { mpAccessToken };
