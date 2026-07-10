'use strict';
/**
 * controllers/inviteController.js
 * Genera y valida links de invitación para que un player acceda a un COMPLEJO.
 *
 * El link:
 *   - No vence (sin expiración).
 *   - Apunta al complejo completo, no a una cancha específica.
 *   - Al loguearse/registrarse, el player queda vinculado al complejo (claim) y
 *     entra directo a él.
 *
 * POST /api/invites/generate        — requiere auth (complex_admin | collaborator | general_admin)
 * GET  /api/invites/:token          — público, valida el token
 * POST /api/invites/:token/claim    — requiere auth, vincula al usuario con el complejo
 * GET  /api/invites/list/:complexId — lista invites activos de un complejo (auth requerido)
 */
const crypto = require('crypto');
const { Invite, Complex, Collaborator } = require('../models');

function buildBaseUrl() {
  return process.env.NODE_ENV === 'production'
    ? (process.env.BASE_URL_PROD || 'https://jugahoyweb.com')
    : (process.env.BASE_URL_DEV  || 'http://localhost:5173');
}

// ── generateLink ──────────────────────────────────────────────
async function generateLink(req, res) {
  try {
    const { complex_id } = req.body;

    if (!complex_id) {
      return res.status(400).json({ message: 'complex_id es requerido' });
    }

    const { user } = req;

    // Verificar acceso al complejo según rol
    if (user.rol === 'complex_admin') {
      const complex = await Complex.findOne({ where: { id: complex_id, owner_id: user.id } });
      if (!complex) return res.status(403).json({ message: 'Sin acceso a este complejo' });
    } else if (user.rol === 'collaborator') {
      const col = await Collaborator.findOne({
        where: { user_id: user.id, complex_id, activo: true },
      });
      if (!col || !col.permisos?.agenda) {
        return res.status(403).json({ message: 'Necesitás permiso de agenda para generar invitaciones' });
      }
    }
    // general_admin puede generar para cualquier complejo

    // Reutilizar un link activo del complejo si ya existe (evita acumular links)
    let invite = await Invite.findOne({ where: { complex_id, usado: false } });
    if (!invite) {
      invite = await Invite.create({
        token      : crypto.randomUUID(),
        complex_id,
        created_by : user.id,
        // field_id y expires_at quedan null → invite a nivel complejo, sin vencimiento
      });
    }

    const link = `${buildBaseUrl()}/invite/${invite.token}`;
    res.json({ link, token: invite.token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── validateInvite ────────────────────────────────────────────
async function validateInvite(req, res) {
  try {
    const { token } = req.params;

    const invite = await Invite.findOne({
      where: { token, usado: false },
      include: [
        {
          model     : Complex,
          as        : 'complex',
          attributes: ['id', 'nombre', 'ciudad', 'provincia', 'direccion', 'logo_url'],
        },
      ],
    });

    if (!invite) {
      return res.status(404).json({
        message: 'El link de invitación es inválido o fue revocado',
        expired: true,
      });
    }

    res.json({
      valid  : true,
      complex: invite.complex,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── claimInvite ───────────────────────────────────────────────
/**
 * POST /api/invites/:token/claim — requiere auth.
 * Vincula al usuario autenticado con el complejo de la invitación:
 *   - Guarda user.default_complex_id = invite.complex_id
 *   - Registra invite.player_id = user.id (solo el primer jugador que lo usa)
 * Devuelve complex_id para que el front redirija directo al complejo.
 * Es idempotente: reclamar el mismo link varias veces no rompe nada.
 */
async function claimInvite(req, res) {
  try {
    const { token } = req.params;
    const { user }  = req;

    const invite = await Invite.findOne({ where: { token, usado: false } });

    if (!invite) {
      return res.status(404).json({
        message: 'El link de invitación es inválido o fue revocado',
        expired: true,
      });
    }

    // Vincular jugador ↔ complejo (relación explícita, recién al loguearse)
    await user.update({ default_complex_id: invite.complex_id });

    // Registrar al primer jugador que consume el link (trazabilidad)
    if (!invite.player_id) {
      await invite.update({ player_id: user.id });
    }

    res.json({
      ok        : true,
      complex_id: invite.complex_id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── listInvites ───────────────────────────────────────────────
async function listInvites(req, res) {
  try {
    const { complexId } = req.params;
    const { user } = req;

    // Verificar acceso al complejo
    if (user.rol === 'complex_admin') {
      const complex = await Complex.findOne({ where: { id: complexId, owner_id: user.id } });
      if (!complex) return res.status(403).json({ message: 'Sin acceso a este complejo' });
    } else if (user.rol === 'collaborator') {
      const col = await Collaborator.findOne({ where: { user_id: user.id, complex_id: complexId, activo: true } });
      if (!col) return res.status(403).json({ message: 'Sin acceso a este complejo' });
    }

    const invites = await Invite.findAll({
      where: { complex_id: complexId, usado: false },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    const baseUrl = buildBaseUrl();
    res.json(invites.map(inv => ({
      id        : inv.id,
      link      : `${baseUrl}/invite/${inv.token}`,
      created_at: inv.created_at,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── revokeInvite ──────────────────────────────────────────────
async function revokeInvite(req, res) {
  try {
    const { id } = req.params;
    const { user } = req;

    const invite = await Invite.findByPk(id, {
      include: [{ model: Complex, as: 'complex' }],
    });
    if (!invite) return res.status(404).json({ message: 'Invitación no encontrada' });

    // Solo puede revocar el creador o el complex_admin dueño o general_admin
    if (user.rol === 'complex_admin' && invite.complex.owner_id !== user.id) {
      return res.status(403).json({ message: 'Sin acceso' });
    }
    if (user.rol === 'collaborator' && invite.created_by !== user.id) {
      return res.status(403).json({ message: 'Solo podés revocar tus propias invitaciones' });
    }

    await invite.update({ usado: true });
    res.json({ message: 'Invitación revocada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { generateLink, validateInvite, claimInvite, listInvites, revokeInvite };
