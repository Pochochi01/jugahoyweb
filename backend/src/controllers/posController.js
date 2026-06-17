const { CashRegister, CashTransaction, sequelize } = require('../models');
const { Op } = require('sequelize');

async function openRegister(req, res) {
  try {
    const { complexId } = req.params;
    const open = await CashRegister.findOne({ where: { complex_id: complexId, estado: 'abierta' } });
    if (open) return res.status(409).json({ message: 'Ya hay una caja abierta', caja: open });

    const caja = await CashRegister.create({
      complex_id: complexId,
      monto_inicial: req.body.monto_inicial || 0,
      usuario_apertura_id: req.user.id,
      notas: req.body.notas,
    });
    res.status(201).json(caja);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function closeRegister(req, res) {
  try {
    const caja = await CashRegister.findOne({
      where: { complex_id: req.params.complexId, estado: 'abierta' },
    });
    if (!caja) return res.status(404).json({ message: 'No hay caja abierta' });

    const [{ total }] = await CashTransaction.findAll({
      where: { cash_register_id: caja.id },
      attributes: [
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN tipo='ingreso' THEN monto ELSE -monto END")), 'total'],
      ],
      raw: true,
    });

    await caja.update({
      estado: 'cerrada',
      fecha_cierre: new Date(),
      monto_final: parseFloat(caja.monto_inicial) + parseFloat(total || 0),
      usuario_cierre_id: req.user.id,
    });
    res.json(caja);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function addTransaction(req, res) {
  try {
    const caja = await CashRegister.findOne({
      where: { complex_id: req.params.complexId, estado: 'abierta' },
    });
    if (!caja) return res.status(404).json({ message: 'No hay caja abierta' });

    const tx = await CashTransaction.create({
      ...req.body,
      cash_register_id: caja.id,
      usuario_id: req.user.id,
    });
    res.status(201).json(tx);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getHistory(req, res) {
  try {
    const { complexId } = req.params;
    const cajas = await CashRegister.findAll({
      where: { complex_id: complexId },
      include: [{ model: CashTransaction, as: 'transactions' }],
      order: [['created_at', 'DESC']],
    });
    res.json(cajas);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getCurrent(req, res) {
  try {
    const caja = await CashRegister.findOne({
      where: { complex_id: req.params.complexId, estado: 'abierta' },
      include: [{ model: CashTransaction, as: 'transactions' }],
    });
    res.json(caja || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { openRegister, closeRegister, addTransaction, getHistory, getCurrent };
