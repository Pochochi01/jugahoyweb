const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');
const { requireRole }  = require('../middlewares/roles');

router.use(authenticate);

// ── Notificaciones in-app ─────────────────────────────────────
router.get('/',            ctrl.getAll);
router.put('/:id/leer',    ctrl.markRead);
router.put('/leer-todas',  ctrl.markAllRead);

// ── Web Push ──────────────────────────────────────────────────
router.get ('/vapid-public-key', ctrl.getVapidKey);
router.post('/subscribe',        ctrl.subscribe);
router.post('/unsubscribe',      ctrl.unsubscribe);
// Envío manual restringido a administradores (los automáticos son server-side)
router.post('/send', requireRole('general_admin', 'complex_admin'), ctrl.send);

module.exports = router;
