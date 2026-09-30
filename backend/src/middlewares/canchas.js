'use strict';
/**
 * middlewares/canchas.js
 * Bloquea los módulos DEPORTIVOS (agenda, invitaciones, operaciones,
 * estadísticas, torneos, profesores) en complejos sin canchas cargadas.
 * Esos complejos operan en modo "almacén": solo el comercio (Almacén), la caja,
 * la configuración y los colaboradores.
 *
 * El complejo se toma de :complexId (o complex_id en body/query).
 * Deja req.modoComplejo para quien lo necesite.
 */
const { modoComplejo } = require('../utils/modoComplejo');

async function requireCanchas(req, res, next) {
  try {
    const complexId = req.params.complexId ?? req.body?.complex_id ?? req.query?.complex_id;
    if (!complexId) return next();   // la ruta no es de un complejo puntual
    const modo = await modoComplejo(complexId);
    req.modoComplejo = modo;
    if (!modo.tiene_canchas) {
      return res.status(403).json({
        message: 'Este complejo no tiene canchas cargadas: solo está disponible el módulo Almacén.',
        code: 'SIN_CANCHAS',
        modo: modo.modo,
      });
    }
    next();
  } catch (err) { next(err); }
}

module.exports = { requireCanchas };
