const router = require('express').Router();
const ctrl = require('../controllers/agendaController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission, requireRole } = require('../middlewares/roles');

router.use(authenticate);

// Slots y reservas del módulo nuevo
router.get('/:complexId/cancha/:fieldId',     requireComplexAccess, requirePermission('agenda'), ctrl.getSlotsForField);
router.get('/:complexId/pendientes',          requireComplexAccess, requirePermission('agenda'), ctrl.getPendingBookings);
router.get('/:complexId/conteo',              requireComplexAccess, requirePermission('agenda'), ctrl.getConteoDia);
router.post('/:complexId/reservar',           requireComplexAccess, requirePermission('agenda'), ctrl.reserveSlot);
// Cancelar exige, además del acceso a la agenda, el permiso específico 'cancelar_turnos'.
router.put('/:complexId/cancelar/:bookingId', requireComplexAccess, requirePermission('agenda'), requirePermission('cancelar_turnos'), ctrl.cancelBooking);
router.put('/:complexId/confirmar/:bookingId', requireComplexAccess, requirePermission('agenda'), ctrl.confirmBooking);
router.put('/:complexId/rechazar/:bookingId', requireComplexAccess, requirePermission('agenda'), ctrl.rejectBooking);
router.patch('/:complexId/no-asistido/:bookingId', requireComplexAccess, requirePermission('agenda'), ctrl.markNoShow);
// Corregir asistencia (no_asistido → confirmado): SOLO administradores, no colaboradores.
router.patch('/:complexId/asistio/:bookingId', requireComplexAccess, requireRole('general_admin', 'complex_admin'), ctrl.correctNoShow);

// Turnos fijos (recurrentes): admins y colaboradores con permiso de agenda.
router.get   ('/:complexId/fijos',      requireComplexAccess, requirePermission('agenda'), ctrl.listTurnosFijos);
router.post  ('/:complexId/fijos',      requireComplexAccess, requirePermission('agenda'), ctrl.crearTurnoFijo);
router.delete('/:complexId/fijos/:id',  requireComplexAccess, requirePermission('agenda'), ctrl.bajaTurnoFijo);

// Cobro de turnos y consumos (admins y colaboradores con permiso de agenda).
router.get   ('/:complexId/turno-productos',                 requireComplexAccess, requirePermission('agenda'), ctrl.listProductosDisponibles);
router.get   ('/:complexId/turno/:bookingId',                requireComplexAccess, requirePermission('agenda'), ctrl.getTurnoDetalle);
router.post  ('/:complexId/turno/:bookingId/consumos',       requireComplexAccess, requirePermission('agenda'), ctrl.agregarConsumos);
router.delete('/:complexId/turno/:bookingId/consumos/:consumoId', requireComplexAccess, requirePermission('agenda'), ctrl.quitarConsumo);
router.post  ('/:complexId/turno/:bookingId/cobrar',         requireComplexAccess, requirePermission('agenda'), ctrl.cobrarTurno);

// Lista de incumplidos + habilitación manual (SOLO administradores).
router.get('/:complexId/incumplidos', requireComplexAccess, requireRole('general_admin', 'complex_admin'), ctrl.getIncumplidos);
router.patch('/:complexId/incumplidos/:id/habilitar', requireComplexAccess, requireRole('general_admin', 'complex_admin'), ctrl.habilitarIncumplido);

// Legacy
router.get('/:complexId',        requireComplexAccess, requirePermission('agenda'), ctrl.getByComplex);
router.post('/:complexId',       requireComplexAccess, requirePermission('agenda'), ctrl.create);
router.put('/:complexId/:id',    requireComplexAccess, requirePermission('agenda'), ctrl.update);
router.delete('/:complexId/:id', requireComplexAccess, requirePermission('agenda'), ctrl.remove);

module.exports = router;
