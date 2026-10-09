'use strict';
/**
 * routes/incumplidos.js — Lista GLOBAL de incumplidos por inasistencias (montado en /api/incumplidos)
 *
 *   GET   /api/incumplidos?complex_id=N   lista global activa (opcional: originados en un complejo)
 *   PATCH /api/incumplidos/:id            habilita manualmente a la persona en TODOS los complejos
 *
 * Roles: general_admin ve y habilita todo. complex_admin ve la lista global
 * (impacta en sus reservas) pero solo habilita entradas originadas en SUS complejos.
 */
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');
const { Complex, Blacklist } = require('../models');
const { listarGlobal, habilitarGlobal } = require('../utils/inasistencias');

router.use(authenticate, requireRole('general_admin', 'complex_admin'));

router.get('/', async (req, res) => {
  try {
    const lista = await listarGlobal({ complexId: req.query.complex_id });
    const mios = req.user.rol === 'general_admin' ? null
      : (await Complex.findAll({ where: { owner_id: req.user.id }, attributes: ['id'], raw: true })).map(c => c.id);
    res.json(lista.map(e => ({
      id: e.id, nombre: e.nombre, telefono: e.telefono, user_id: e.user_id,
      complejo_origen: e.complejo ? { id: e.complejo.id, nombre: e.complejo.nombre } : { id: e.complex_id },
      fecha_ultima_inasistencia: e.updatedAt, estado: e.activo ? 'bloqueado' : 'habilitado',
      puede_habilitar: !mios || mios.includes(e.complex_id),
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const entry = await Blacklist.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ message: 'No encontrado' });
    if (req.user.rol !== 'general_admin') {
      const propio = await Complex.count({ where: { id: entry.complex_id, owner_id: req.user.id } });
      if (!propio) return res.status(403).json({ message: 'Solo el complejo donde se originó (o el admin general) puede habilitarlo.' });
    }
    await habilitarGlobal(entry.id);
    res.json({ ok: true, message: `${entry.nombre || 'El jugador'} quedó habilitado en todos los complejos.` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
