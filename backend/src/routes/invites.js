'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/inviteController');
const { authenticate } = require('../middlewares/auth');
const { requireRole }  = require('../middlewares/roles');

const adminCollab = requireRole('general_admin', 'complex_admin', 'collaborator');

// ── Rutas con auth (rutas específicas primero, antes del wildcard /:token) ──
router.post('/generate',           authenticate, adminCollab, ctrl.generateLink);
router.get ('/list/:complexId',    authenticate, adminCollab, ctrl.listInvites);
router.patch('/:id/revoke',        authenticate, adminCollab, ctrl.revokeInvite);

// Reclamar invitación: cualquier usuario autenticado (típicamente un player)
// queda vinculado al complejo del invite.
router.post('/:token/claim',       authenticate, ctrl.claimInvite);

// ── Público — debe ir último para no capturar las rutas anteriores ─────────
router.get('/:token', ctrl.validateInvite);

module.exports = router;
