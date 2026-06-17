const router = require('express').Router();
const ctrl = require('../controllers/operationsController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.use(authenticate);
router.get('/:complexId', requireComplexAccess, requirePermission('operaciones'), ctrl.getByComplex);

module.exports = router;
