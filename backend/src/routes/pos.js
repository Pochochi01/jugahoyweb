const router = require('express').Router();
const ctrl = require('../controllers/posController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.use(authenticate);
router.get('/:complexId/current',     requireComplexAccess, requirePermission('caja'), ctrl.getCurrent);
router.get('/:complexId/history',     requireComplexAccess, requirePermission('caja'), ctrl.getHistory);
router.post('/:complexId/open',       requireComplexAccess, requirePermission('caja'), ctrl.openRegister);
router.post('/:complexId/close',      requireComplexAccess, requirePermission('caja'), ctrl.closeRegister);
router.post('/:complexId/transaction',requireComplexAccess, requirePermission('caja'), ctrl.addTransaction);

module.exports = router;
