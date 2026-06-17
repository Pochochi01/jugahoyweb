const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/',              ctrl.getAll);
router.put('/:id/leer',     ctrl.markRead);
router.put('/leer-todas',   ctrl.markAllRead);

module.exports = router;
