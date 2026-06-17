const router = require('express').Router();
const ctrl = require('../controllers/complexController');
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('general_admin', 'complex_admin', 'player'), ctrl.create);
router.put('/:id', requireRole('general_admin', 'complex_admin'), ctrl.update);
router.delete('/:id', requireRole('general_admin'), ctrl.remove);

module.exports = router;
