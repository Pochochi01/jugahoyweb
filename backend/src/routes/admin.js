const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');

router.use(authenticate, requireRole('general_admin'));

router.get('/complexes',              ctrl.getComplexes);
router.get('/stats',                  ctrl.getStats);
router.post('/subscriptions',         ctrl.createSubscription);
router.put('/subscriptions/:id',      ctrl.updateSubscription);
router.patch('/subscriptions/:id/toggle', ctrl.toggleSubscription);
router.delete('/subscriptions/:id',   ctrl.deleteSubscription);

module.exports = router;
