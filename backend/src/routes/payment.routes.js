'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth');

// Iniciar pago: requiere jugador autenticado
router.post('/init-mp', authenticate, ctrl.initMp);

// Sync de retorno: público (idempotente; consulta a MP con token de backend)
router.get('/sync', ctrl.sync);

// Webhook de MP: público (server-to-server). Responde 200 y procesa async.
router.post('/webhook', ctrl.webhook);

module.exports = router;
