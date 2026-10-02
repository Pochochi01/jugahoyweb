/**
 * routes/mercadopagoAuth.js — OAuth de MercadoPago (montado en /api/auth/mercadopago)
 * Conectar / desconectar: solo el administrador del complejo o el admin general.
 */
const router = require('express').Router();
const ctrl = require('../controllers/mercadopagoAuthController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requireRole } = require('../middlewares/roles');

const admins = requireRole('general_admin', 'complex_admin');
// requireComplexAccess lee :complexId → para /connect se toma de la query
const complexDeQuery = (req, _res, next) => { req.params.complexId = req.query.complex_id; next(); };

// Callback público: MercadoPago redirige el navegador acá (la seguridad la da el `state` firmado)
router.get('/callback', ctrl.callback);

router.get('/connect', authenticate, admins, complexDeQuery, requireComplexAccess, ctrl.connect);
router.get   ('/:complexId/estado',  authenticate, admins, requireComplexAccess, ctrl.estado);
router.post  ('/:complexId/renovar', authenticate, admins, requireComplexAccess, ctrl.renovar);
router.delete('/:complexId',         authenticate, admins, requireComplexAccess, ctrl.desconectar);

module.exports = router;
