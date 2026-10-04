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
const { modoComplejo, modulosComplejo } = require('../utils/modoComplejo');

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

/**
 * Exige que el módulo esté habilitado por las canchas del complejo
 * (escuela / profesores / torneos → al menos una cancha habilitada, de cualquier deporte).
 */
const MENSAJES = {
  escuela: 'Las escuelas requieren al menos una cancha habilitada.',
  profesores: 'El módulo Profesores requiere al menos una cancha habilitada.',
  torneos: 'Los torneos requieren al menos una cancha habilitada.',
};
function requireModulo(modulo) {
  return async (req, res, next) => {
    try {
      const complexId = req.params.complexId ?? req.body?.complex_id ?? req.query?.complex_id;
      if (!complexId) return next();
      const modulos = await modulosComplejo(complexId);
      if (!modulos[modulo]) {
        return res.status(403).json({ message: MENSAJES[modulo], code: 'MODULO_NO_HABILITADO', modulo });
      }
      req.modulos = modulos;
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { requireCanchas, requireModulo };
