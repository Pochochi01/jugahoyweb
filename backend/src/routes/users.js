const router = require('express').Router();
const ctrl = require('../controllers/usersController');
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');

router.use(authenticate, requireRole('general_admin'));
router.get('/',     ctrl.getAll);
router.post('/',    ctrl.create);
router.put('/:id',  ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
