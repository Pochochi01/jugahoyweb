const router = require('express').Router();
const ctrl = require('../controllers/statsController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.get('/global', ctrl.getGlobalStats);
router.use(authenticate);
router.get('/:complexId', requireComplexAccess, requirePermission('estadisticas'), ctrl.getStats);

module.exports = router;
