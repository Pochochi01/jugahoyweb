const router = require('express').Router();
const ctrl = require('../controllers/agendaController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');

router.use(authenticate);

// Slots y reservas del módulo nuevo
router.get('/:complexId/cancha/:fieldId',     requireComplexAccess, requirePermission('agenda'), ctrl.getSlotsForField);
router.get('/:complexId/pendientes',          requireComplexAccess, requirePermission('agenda'), ctrl.getPendingBookings);
router.post('/:complexId/reservar',           requireComplexAccess, requirePermission('agenda'), ctrl.reserveSlot);
router.put('/:complexId/cancelar/:bookingId', requireComplexAccess, requirePermission('agenda'), ctrl.cancelBooking);
router.put('/:complexId/confirmar/:bookingId', requireComplexAccess, requirePermission('agenda'), ctrl.confirmBooking);
router.put('/:complexId/rechazar/:bookingId', requireComplexAccess, requirePermission('agenda'), ctrl.rejectBooking);

// Legacy
router.get('/:complexId',        requireComplexAccess, requirePermission('agenda'), ctrl.getByComplex);
router.post('/:complexId',       requireComplexAccess, requirePermission('agenda'), ctrl.create);
router.put('/:complexId/:id',    requireComplexAccess, requirePermission('agenda'), ctrl.update);
router.delete('/:complexId/:id', requireComplexAccess, requirePermission('agenda'), ctrl.remove);

module.exports = router;
