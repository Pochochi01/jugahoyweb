const { Op } = require('sequelize');
const { Complex, Field, User, Subscription, sequelize } = require('../models');

// ── Vista general de complejos con suscripciones ─────────────────────────────
async function getComplexes(req, res) {
  try {
    const complexes = await Complex.findAll({
      include: [
        {
          model: Field,
          as: 'fields',
          attributes: ['id', 'activa'],
          required: false,
        },
        {
          model: Subscription,
          as: 'subscription',
          required: false,
        },
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
        },
      ],
      order: [['nombre', 'ASC']],
    });

    const result = complexes.map(c => {
      const json = c.toJSON();
      return {
        ...json,
        total_canchas:    (json.fields || []).length,
        canchas_activas:  (json.fields || []).filter(f => f.activa).length,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Stats globales de la plataforma ──────────────────────────────────────────
async function getStats(req, res) {
  try {
    const [totalComplejos, activosSubs, ingresosMes] = await Promise.all([
      Complex.count(),
      Subscription.count({ where: { estado: 'activo' } }),
      Subscription.findOne({
        attributes: [[sequelize.fn('SUM', sequelize.col('precio_mensual')), 'total']],
        where: { estado: 'activo' },
        raw: true,
      }),
    ]);

    const totalSubs = await Subscription.count();

    res.json({
      totalComplejos,
      totalSuscripciones: totalSubs,
      suscripcionesActivas: activosSubs,
      suscripcionesInactivas: totalSubs - activosSubs,
      ingresosEstimados: parseFloat(ingresosMes?.total || 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── CRUD Suscripciones ────────────────────────────────────────────────────────
async function createSubscription(req, res) {
  try {
    const { complex_id, precio_mensual, fecha_inicio, fecha_pago, fecha_vencimiento, notas } = req.body;

    if (!complex_id || precio_mensual === undefined) {
      return res.status(400).json({ message: 'complex_id y precio_mensual son obligatorios.' });
    }

    const complex = await Complex.findByPk(complex_id);
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado.' });

    // Si ya existe, actualizar
    const existing = await Subscription.findOne({ where: { complex_id } });
    if (existing) {
      await existing.update({ precio_mensual, fecha_inicio, fecha_pago, fecha_vencimiento, notas, created_by: req.user.id });
      return res.json(existing);
    }

    const sub = await Subscription.create({
      complex_id, precio_mensual, fecha_inicio, fecha_pago, fecha_vencimiento, notas,
      estado: 'activo', created_by: req.user.id,
    });
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateSubscription(req, res) {
  try {
    const sub = await Subscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Suscripción no encontrada.' });
    await sub.update({ ...req.body, created_by: req.user.id });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function toggleSubscription(req, res) {
  const t = await sequelize.transaction();
  try {
    const sub = await Subscription.findByPk(req.params.id, { transaction: t });
    if (!sub) {
      await t.rollback();
      return res.status(404).json({ message: 'Suscripción no encontrada.' });
    }

    const nuevoEstado = sub.estado === 'activo' ? 'inactivo' : 'activo';
    await sub.update({ estado: nuevoEstado }, { transaction: t });

    // Reflejar en el complejo: inactivo → suspende acceso, activo → rehabilita
    await Complex.update(
      { activo: nuevoEstado === 'activo' },
      { where: { id: sub.complex_id }, transaction: t }
    );

    await t.commit();
    res.json({ sub, complexActivo: nuevoEstado === 'activo' });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

async function deleteSubscription(req, res) {
  try {
    const sub = await Subscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Suscripción no encontrada.' });
    await sub.destroy();
    res.json({ message: 'Suscripción eliminada definitivamente.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getComplexes, getStats, createSubscription, updateSubscription, toggleSubscription, deleteSubscription };
