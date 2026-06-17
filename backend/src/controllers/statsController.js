const { Agenda, CashTransaction, CashRegister, Field, sequelize } = require('../models');
const { Op } = require('sequelize');

async function getStats(req, res) {
  try {
    const { complexId } = req.params;
    const { desde, hasta } = req.query;
    const dateFilter = {};
    if (desde) dateFilter[Op.gte] = new Date(desde);
    if (hasta) dateFilter[Op.lte] = new Date(hasta);

    const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
    const fieldIds = fields.map(f => f.id);

    const agendaWhere = { field_id: { [Op.in]: fieldIds } };
    if (desde || hasta) agendaWhere.fecha = dateFilter;

    const [reservas, ingresosTotales, ocupacion] = await Promise.all([
      Agenda.count({ where: { ...agendaWhere, estado: { [Op.in]: ['reservado', 'confirmado'] } } }),
      CashTransaction.findOne({
        attributes: [[sequelize.fn('SUM', sequelize.col('monto')), 'total']],
        include: [{
          model: CashRegister,
          as: 'cashRegister',
          where: { complex_id: complexId },
          attributes: [],
        }],
        where: { tipo: 'ingreso' },
        raw: true,
      }),
      Agenda.count({ where: agendaWhere }),
    ]);

    res.json({
      reservas,
      ingresos: parseFloat(ingresosTotales?.total || 0),
      totalTurnos: ocupacion,
      porcentajeOcupacion: ocupacion > 0 ? Math.round((reservas / ocupacion) * 100) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getGlobalStats(req, res) {
  try {
    const [usuarios, complejos, turnos] = await Promise.all([
      require('../models').User.count({ where: { activo: true } }),
      require('../models').Complex.count({ where: { activo: true } }),
      Agenda.count({ where: { estado: { [Op.in]: ['reservado', 'confirmado'] } } }),
    ]);
    res.json({ usuarios, complejos, turnos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getStats, getGlobalStats };
