const router = require('express').Router();
const ctrl = require('../controllers/collaboratorsController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.use(authenticate);
router.get('/:complexId',              requireComplexAccess, requirePermission('colaboradores'), ctrl.getAll);
router.post('/:complexId',             requireComplexAccess, requirePermission('colaboradores'), ctrl.create);
router.put('/:complexId/:id',          requireComplexAccess, requirePermission('colaboradores'), ctrl.update);
router.patch('/:complexId/:id/toggle', requireComplexAccess, requirePermission('colaboradores'), ctrl.toggle);
router.delete('/:complexId/:id',       requireComplexAccess, requirePermission('colaboradores'), ctrl.remove);

module.exports = router;
