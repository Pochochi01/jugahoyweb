const router = require('express').Router();
const ctrl = require('../controllers/statsController');
const { authenticate } = require('../middlewares/auth');
const { requireCanchas } = require('../middlewares/canchas');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.get('/global', ctrl.getGlobalStats);
router.use(authenticate);
// Módulo deportivo: no disponible en complejos sin canchas (modo Almacén)
router.use('/:complexId', requireCanchas);
router.get('/:complexId', requireComplexAccess, requirePermission('estadisticas'), ctrl.getStats);
router.get('/:complexId/asistencias', requireComplexAccess, requirePermission('estadisticas'), ctrl.getAttendanceStats);
router.get('/:complexId/no-asistidos', requireComplexAccess, requirePermission('estadisticas'), ctrl.getNoShowList);

module.exports = router;
