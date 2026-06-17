const router = require('express').Router();
const ctrl = require('../controllers/publicController');
const { authenticate } = require('../middlewares/auth');

// Sin autenticación
router.get('/complexes',                ctrl.getComplexes);
router.get('/complexes/:id',            ctrl.getComplex);
router.get('/complexes/:id/slots',      ctrl.getComplexSlots);
router.post('/register-complex',        ctrl.registerComplex);

// Requieren autenticación (cualquier rol)
router.post('/complexes/:complexId/reservar', authenticate, ctrl.playerReserve);
router.get('/my-bookings',                    authenticate, ctrl.getMyBookings);
router.put('/my-bookings/:id/cancelar',       authenticate, ctrl.cancelMyBooking);

module.exports = router;
