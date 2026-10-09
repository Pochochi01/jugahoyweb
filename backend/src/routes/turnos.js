'use strict';
/**
 * routes/turnos.js — Confirmación de asistencia (montado en /api/turnos)
 *
 *   GET   /api/turnos/config/:complexId            hora de envío de recordatorios
 *   PUT   /api/turnos/config/:complexId            { hora_recordatorio: 'HH:mm' | null }
 *   GET   /api/turnos/confirmaciones/:complexId    turnos con pedido de confirmación + totales
 *   PATCH /api/turnos/:id/confirmar                confirma asistencia (manual)
 *   PATCH /api/turnos/:id/cancelar                 cancela por falta de confirmación (avisa por WhatsApp)
 *
 * La lógica vive en services/recordatorioService.js.
 */
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { requireRole, requireComplexAccess } = require('../middlewares/roles');
const { Booking, Field } = require('../models');
const svc = require('../services/recordatorioService');

router.use(authenticate);
const admin = requireRole('general_admin', 'complex_admin', 'collaborator');

router.get('/config/:complexId', admin, requireComplexAccess, async (req, res) => {
  try { res.json(await svc.getConfig(req.params.complexId)); } catch (e) { res.status(500).json({ message: e.message }); }
});
router.put('/config/:complexId', requireRole('general_admin', 'complex_admin'), requireComplexAccess, async (req, res) => {
  try { res.json(await svc.setConfig(req.params.complexId, req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});
router.get('/confirmaciones/:complexId', admin, requireComplexAccess, async (req, res) => {
  try { res.json(await svc.resumen(req.params.complexId, req.query)); } catch (e) { res.status(500).json({ message: e.message }); }
});

// Carga el turno y verifica acceso a su complejo (reusa requireComplexAccess).
async function cargarTurno(req, res, next) {
  const b = await Booking.findByPk(req.params.id, { include: [{ model: Field, as: 'field', attributes: ['complex_id'] }] }).catch(() => null);
  if (!b?.field) return res.status(404).json({ message: 'Turno no encontrado' });
  req.params.complexId = String(b.field.complex_id);
  req.turno = b;
  next();
}

router.patch('/:id/confirmar', admin, cargarTurno, requireComplexAccess, async (req, res) => {
  if (['cancelado', 'rechazado'].includes(req.turno.estado)) return res.status(409).json({ message: 'El turno ya está cancelado.' });
  await svc.confirmar(req.turno.id);
  res.json({ ok: true, message: 'Asistencia confirmada.', estado_confirmacion: 'confirmado' });
});
router.patch('/:id/cancelar', admin, cargarTurno, requireComplexAccess, async (req, res) => {
  try {
    const b = await svc.cancelar(req.turno.id, 'admin');
    if (!b) return res.status(409).json({ message: 'No se puede cancelar: ya está cancelado, cobrado o ya comenzó.' });
    res.json({ ok: true, message: 'Turno cancelado. Avisamos al cliente por WhatsApp.', estado_confirmacion: 'cancelado' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
