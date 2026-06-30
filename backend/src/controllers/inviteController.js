'use strict';
/**
 * controllers/inviteController.js
 * Genera y valida links de invitación para que un player acceda a una cancha específica.
 *
 * POST /api/invites/generate  — requiere auth (complex_admin | collaborator | general_admin)
 * GET  /api/invites/:token    — público, valida el token
 * GET  /api/invites/list/:complexId — lista invites activos de un complejo (auth requerido)
 */
const crypto = require('crypto');
const { Op }  = require('sequelize');
const { Invite, Field, Complex, Collaborator } = require('../models');

function buildBaseUrl() {
  return process.env.NODE_ENV === 'production'
    ? (process.env.BASE_URL_PROD || 'https://jugahoyweb.com')
    : (process.env.BASE_URL_DEV  || 'http://localhost:5173');
}

// ── generateLink ──────────────────────────────────────────────
async function generateLink(req, res) {
  try {
    const { field_id, complex_id, expires_in_days = 7 } = req.body;

    if (!field_id || !complex_id) {
      return res.status(400).json({ message: 'field_id y complex_id son requeridos' });
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

    // Verificar que la cancha pertenece al complejo
    const field = await Field.findOne({ where: { id: field_id, complex_id, activa: true } });
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada en este complejo' });

    const token    = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expires_in_days));

    await Invite.create({
      token,
      complex_id,
      field_id,
      created_by : user.id,
      expires_at : expiresAt,
    });

    const link = `${buildBaseUrl()}/invite/${token}`;
    res.json({ link, token, expires_at: expiresAt, field: { id: field.id, nombre: field.nombre } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── validateInvite ────────────────────────────────────────────
async function validateInvite(req, res) {
  try {
    const { token } = req.params;

    const invite = await Invite.findOne({
      where: {
        token,
        usado    : false,
        expires_at: { [Op.gt]: new Date() },
      },
      include: [
        {
          model     : Field,
          as        : 'field',
          attributes: ['id', 'nombre', 'deporte', 'piso', 'techada', 'dimensiones', 'precio_base', 'imagen_url'],
        },
        {
          model     : Complex,
          as        : 'complex',
          attributes: ['id', 'nombre', 'ciudad', 'provincia', 'direccion', 'logo_url'],
        },
      ],
    });

    if (!invite) {
      return res.status(404).json({
        message: 'El link de invitación es inválido o ya expiró',
        expired: true,
      });
    }

    res.json({
      valid     : true,
      field     : invite.field,
      complex   : invite.complex,
      expires_at: invite.expires_at,
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
      where: {
        complex_id: complexId,
        expires_at: { [Op.gt]: new Date() },
        usado: false,
      },
      include: [{ model: Field, as: 'field', attributes: ['id', 'nombre', 'deporte'] }],
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    const baseUrl = buildBaseUrl();
    res.json(invites.map(inv => ({
      id        : inv.id,
      link      : `${baseUrl}/invite/${inv.token}`,
      field     : inv.field,
      expires_at: inv.expires_at,
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

module.exports = { generateLink, validateInvite, listInvites, revokeInvite };
