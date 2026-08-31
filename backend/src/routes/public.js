const router = require('express').Router();
const ctrl = require('../controllers/publicController');
const localidadesCtrl = require('../controllers/localidadesController');
const favoritesCtrl = require('../controllers/favoritesController');
const { authenticate } = require('../middlewares/auth');

// Sin autenticación
router.get('/complexes',                ctrl.getComplexes);
router.get('/complexes/:id',            ctrl.getComplex);
router.get('/complexes/:id/slots',      ctrl.getComplexSlots);
router.get('/complexes/:id/ocupados',   ctrl.getOcupados);   // lista de espera: turnos ocupados
router.post('/register-complex',        ctrl.registerComplex);

// Catálogo de ubicaciones (para el wizard de alta de complejo)
router.get('/provincias',               localidadesCtrl.getProvincias);
router.get('/localidades',              localidadesCtrl.getLocalidades);

// Requieren autenticación (cualquier rol)
router.get('/complexes/:complexId/bloqueo-inasistencias', authenticate, ctrl.checkInasistencias);
router.post('/complexes/:complexId/reservar', authenticate, ctrl.playerReserve);
router.post('/complexes/:complexId/waitlist', authenticate, ctrl.addWaitlist);   // anotarse en lista de espera
router.get('/my-bookings',                    authenticate, ctrl.getMyBookings);
router.put('/my-bookings/:id/cancelar',       authenticate, ctrl.cancelMyBooking);

// Favoritos del jugador
router.get   ('/favorites',            authenticate, favoritesCtrl.listFavorites);
router.post  ('/favorites',            authenticate, favoritesCtrl.addFavorite);
router.delete('/favorites/:complexId', authenticate, favoritesCtrl.removeFavorite);

module.exports = router;
