const router = require('express').Router();
const ctrl = require('../controllers/settingsController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.use(authenticate);

// Leer la config completa del complejo — requiere 'configuracion'
router.get('/:complexId', requireComplexAccess, requirePermission('configuracion'), ctrl.getSettings);
router.put('/:complexId', requireComplexAccess, requirePermission('configuracion'), ctrl.updateSettings);

// Leer canchas — NO requiere permiso específico: cualquier colaborador con acceso
// al complejo necesita conocer las canchas (Agenda, etc.)
router.get('/:complexId/fields', requireComplexAccess, ctrl.getFields);

// Modificar canchas — sí requiere 'configuracion'
router.post('/:complexId/fields',                  requireComplexAccess, requirePermission('configuracion'), ctrl.createField);
router.put('/:complexId/fields/:fieldId',          requireComplexAccess, requirePermission('configuracion'), ctrl.updateField);
router.patch('/:complexId/fields/:fieldId/toggle', requireComplexAccess, requirePermission('configuracion'), ctrl.toggleField);
router.delete('/:complexId/fields/:fieldId',       requireComplexAccess, requirePermission('configuracion'), ctrl.deleteField);

module.exports = router;
