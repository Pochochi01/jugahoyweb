const router = require('express').Router();
const ctrl = require('../controllers/settingsController');
const integrationsCtrl = require('../controllers/integrationsController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission, requireRole } = require('../middlewares/roles');
const { resolveTenant } = require('../middlewares/tenant');

router.use(authenticate);
router.use(resolveTenant);   // deja req.clubId + req.getIntegrations() disponibles

// Leer la config completa del complejo — requiere 'configuracion'
router.get('/:complexId', requireComplexAccess, requirePermission('configuracion'), ctrl.getSettings);
router.put('/:complexId', requireComplexAccess, requirePermission('configuracion'), ctrl.updateSettings);

// ── Integraciones por club (WhatsApp/Meta): SOLO el administrador general ──
// Tokens enmascarados al leer; se escriben pero no se leen completos.
router.get ('/:complexId/integrations',            requireComplexAccess, requireRole('general_admin'), integrationsCtrl.getIntegrations);
router.put ('/:complexId/integrations',            requireComplexAccess, requireRole('general_admin'), integrationsCtrl.updateIntegrations);
router.post('/:complexId/integrations/renew-meta', requireComplexAccess, requireRole('general_admin'), integrationsCtrl.renewMeta);

// ── Plantillas de Meta (ventana de 24 h): SOLO el administrador general ──
router.get('/:complexId/wa-templates', requireComplexAccess, requireRole('general_admin'), ctrl.getWaTemplates);
router.put('/:complexId/wa-templates', requireComplexAccess, requireRole('general_admin'), ctrl.updateWaTemplates);

// Leer canchas — NO requiere permiso específico: cualquier colaborador con acceso
// al complejo necesita conocer las canchas (Agenda, etc.)
router.get('/:complexId/fields', requireComplexAccess, ctrl.getFields);

// Modificar canchas — sí requiere 'configuracion'
router.post('/:complexId/fields',                  requireComplexAccess, requirePermission('configuracion'), ctrl.createField);
router.put('/:complexId/fields/:fieldId',          requireComplexAccess, requirePermission('configuracion'), ctrl.updateField);
router.patch('/:complexId/fields/:fieldId/toggle', requireComplexAccess, requirePermission('configuracion'), ctrl.toggleField);
router.delete('/:complexId/fields/:fieldId',       requireComplexAccess, requirePermission('configuracion'), ctrl.deleteField);

module.exports = router;
