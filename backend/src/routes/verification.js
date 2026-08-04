'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);   // cada usuario verifica su propio teléfono

router.get ('/status',        ctrl.status);
router.post('/phone/send',    ctrl.sendPhone);
router.post('/phone/confirm', ctrl.confirmPhone);

module.exports = router;
