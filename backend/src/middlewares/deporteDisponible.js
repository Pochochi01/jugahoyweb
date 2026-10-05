'use strict';
/**
 * middlewares/deporteDisponible.js
 * Rechaza crear (o cambiar de deporte) un torneo o una escuela si el complejo
 * no tiene canchas habilitadas de ese deporte. Va DESPUÉS del guard de acceso
 * al complejo (que ya fijó el tenant).
 *
 *   requireDeporteDisponible({ actividad: 'torneos' })              // POST: deporte del body (obligatorio)
 *   requireDeporteDisponible({ actividad: 'torneos', actual: req => req.torneo?.deporte })  // PUT: solo si cambia
 *
 * Respuesta de error: 400 { code: 'DEPORTE_NO_DISPONIBLE', message, deporte, disponibles: [...] }
 */
const { DEPORTES } = require('../models/Escuela');
const { deportesDisponibles, tieneDeporte, mensajeSinDeporte } = require('../utils/deportesComplejo');

function requireDeporteDisponible({ actividad = 'torneos', actual = null } = {}) {
  return async (req, res, next) => {
    try {
      const complexId = Number(req.clubId ?? req.params.complexId);
      const pedido = req.body?.deporte;
      const anterior = actual ? await actual(req) : null;

      // Edición sin cambio de deporte → nada que validar
      if (actual && (pedido == null || pedido === anterior)) return next();

      if (pedido == null || pedido === '') {
        const disponibles = await deportesDisponibles(complexId);
        return res.status(400).json({
          code: 'DEPORTE_REQUERIDO',
          message: disponibles.length
            ? `Elegí el deporte (${disponibles.map(d => d.label).join(', ')}).`
            : 'El complejo no tiene canchas habilitadas: cargá una antes de organizar.',
          disponibles,
        });
      }
      if (!DEPORTES.includes(pedido)) return res.status(400).json({ code: 'DEPORTE_INVALIDO', message: 'Deporte inválido.' });

      if (!(await tieneDeporte(complexId, pedido))) {
        return res.status(400).json({
          code: 'DEPORTE_NO_DISPONIBLE',
          message: mensajeSinDeporte(pedido, actividad),
          deporte: pedido,
          disponibles: await deportesDisponibles(complexId),
        });
      }
      next();
    } catch (err) { next(err); }
  };
}

/** GET …/deportes → deportes habilitados por las canchas del complejo (para los desplegables). */
async function listarDeportes(req, res) {
  try {
    res.json({ deportes: await deportesDisponibles(Number(req.clubId ?? req.params.complexId)) });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = { requireDeporteDisponible, listarDeportes };
