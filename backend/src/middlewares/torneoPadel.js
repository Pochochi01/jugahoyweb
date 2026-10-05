'use strict';
/**
 * middlewares/torneoPadel.js — Los torneos son EXCLUSIVOS de pádel.
 *
 *   - El deporte de un torneo es siempre 'padel' (TORNEO_DEPORTE). Si el body
 *     trae otro, 400; si no trae, se completa.
 *   - Crear un torneo exige que el complejo tenga canchas de pádel (y al menos
 *     una habilitada para poder programar partidos).
 *   - El módulo entero (panel, organizador) se oculta/bloquea en complejos sin
 *     canchas de pádel: ver requireModulo('torneos') y utils/modoComplejo.
 */
const { Field } = require('../models');

const TORNEO_DEPORTE = 'padel';
const MSG_SIN_PADEL = 'Este complejo no tiene canchas de pádel, no puede organizar torneos de pádel.';
const MSG_SIN_PADEL_HABILITADA = 'Este complejo no tiene canchas de pádel habilitadas: habilitá una en Configuración para organizar torneos.';
const MSG_SOLO_PADEL = 'Los torneos son exclusivamente de pádel.';

/** POST: deporte fijo en pádel + el complejo debe tener canchas de pádel. */
async function requireTorneoPadel(req, res, next) {
  try {
    const pedido = req.body?.deporte;
    if (pedido != null && pedido !== '' && pedido !== TORNEO_DEPORTE) {
      return res.status(400).json({ code: 'SOLO_PADEL', message: MSG_SOLO_PADEL });
    }
    req.body = { ...(req.body || {}), deporte: TORNEO_DEPORTE };
    const complexId = Number(req.clubId ?? req.params.complexId);
    const [total, habilitadas] = await Promise.all([
      Field.count({ where: { complex_id: complexId, deporte: TORNEO_DEPORTE } }),
      Field.count({ where: { complex_id: complexId, deporte: TORNEO_DEPORTE, activa: true } }),
    ]);
    if (!total) return res.status(400).json({ code: 'SIN_PADEL', message: MSG_SIN_PADEL });
    if (!habilitadas) return res.status(400).json({ code: 'SIN_PADEL_HABILITADA', message: MSG_SIN_PADEL_HABILITADA });
    next();
  } catch (err) { next(err); }
}

/** PUT: no se puede cambiar el deporte de un torneo. */
function deporteFijoPadel(req, res, next) {
  const pedido = req.body?.deporte;
  if (pedido != null && pedido !== '' && pedido !== TORNEO_DEPORTE) {
    return res.status(400).json({ code: 'SOLO_PADEL', message: MSG_SOLO_PADEL });
  }
  if (req.body) delete req.body.deporte;
  next();
}

module.exports = { TORNEO_DEPORTE, MSG_SIN_PADEL, requireTorneoPadel, deporteFijoPadel };
