'use strict';
/**
 * middlewares/tenant.js
 * Resuelve el CLUB (tenant) de la request y deja sus credenciales a mano.
 *
 * Estrategia de resolución (primera que matchee):
 *   1. Explícito en la ruta/body/query  → :complexId | complex_id | club_id
 *   2. Según el rol del usuario logueado:
 *        complex_admin → el complejo del que es dueño
 *        collaborator  → su complejo asignado activo
 *        player        → su complejo por defecto (default_complex_id)
 *        general_admin → sin club fijo (opera sobre el que indique la ruta)
 *
 * Deja en la request:
 *   req.clubId            → number | null
 *   req.getIntegrations() → Promise<fila de club_integrations | null> (lazy + cacheado)
 *
 * No corta la request si no hay club: para eso está `requireTenant`.
 */
const { Complex, Collaborator } = require('../models');
const integrations = require('../services/integrations.service');

async function resolveTenant(req, _res, next) {
  try {
    let clubId =
      req.params?.complexId ?? req.params?.clubId ??
      req.body?.complex_id  ?? req.body?.club_id  ??
      req.query?.complex_id ?? req.query?.club_id ?? null;

    if (!clubId && req.user) {
      const { rol, id } = req.user;

      if (rol === 'complex_admin') {
        const c = await Complex.findOne({ where: { owner_id: id }, attributes: ['id'] });
        clubId = c?.id ?? null;

      } else if (rol === 'collaborator') {
        const col = await Collaborator.findOne({
          where: { user_id: id, activo: true }, attributes: ['complex_id'],
        });
        clubId = col?.complex_id ?? null;

      } else if (rol === 'player') {
        clubId = req.user.default_complex_id ?? null;
      }
      // general_admin: sin club implícito (usa el de la ruta)
    }

    req.clubId = clubId ? Number(clubId) : null;

    // Carga perezosa y memoizada de las credenciales del club
    let cached;
    req.getIntegrations = async () => {
      if (cached !== undefined) return cached;
      cached = req.clubId ? await integrations.getIntegration(req.clubId) : null;
      return cached;
    };

    next();
  } catch (err) {
    next(err);
  }
}

/** Corta con 400 si la request no pudo asociarse a ningún club. */
function requireTenant(req, res, next) {
  if (!req.clubId) {
    return res.status(400).json({
      message: 'No se pudo determinar el club de esta operación.',
      code: 'TENANT_NOT_RESOLVED',
    });
  }
  next();
}

module.exports = { resolveTenant, requireTenant };
