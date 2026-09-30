const router = require('express').Router();
const ctrl = require('../controllers/operationsController');
const { authenticate } = require('../middlewares/auth');
const { requireCanchas } = require('../middlewares/canchas');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.use(authenticate);
// Módulo deportivo: no disponible en complejos sin canchas (modo Almacén)
router.use('/:complexId', requireCanchas);
router.get('/:complexId', requireComplexAccess, requirePermission('operaciones'), ctrl.getByComplex);

module.exports = router;
