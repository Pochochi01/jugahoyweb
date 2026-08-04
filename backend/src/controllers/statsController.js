const { Agenda, CashTransaction, CashRegister, Field, Booking, sequelize } = require('../models');
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

/**
 * GET /api/stats/:complexId/asistencias?desde=&hasta=
 * Estadísticas de asistencia basadas en `bookings` (turnos reales):
 * confirmados, no asistidos, cancelados/rechazados y % de ausencias.
 */
async function getAttendanceStats(req, res) {
  try {
    const { complexId } = req.params;
    const { desde, hasta } = req.query;

    const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
    const fieldIds = fields.map(f => f.id);
    if (fieldIds.length === 0) {
      return res.json({ confirmados: 0, no_asistidos: 0, cancelados: 0, total: 0, porcentaje_ausencias: 0 });
    }

    const where = { field_id: { [Op.in]: fieldIds } };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = desde;
      if (hasta) where.fecha[Op.lte] = hasta;
    }

    // Conteo agrupado por estado en una sola query
    const filas = await Booking.findAll({
      where,
      attributes: ['estado', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['estado'],
      raw: true,
    });
    const porEstado = filas.reduce((acc, f) => (acc[f.estado] = parseInt(f.n), acc), {});

    const confirmados = porEstado.confirmado || 0;
    const noAsistidos = porEstado.no_asistido || 0;
    const cancelados  = (porEstado.cancelado || 0) + (porEstado.rechazado || 0);
    // Base para el % de ausencias: turnos que debían cumplirse (confirmados + ausencias)
    const base = confirmados + noAsistidos;

    res.json({
      confirmados,
      no_asistidos: noAsistidos,
      cancelados,
      total: filas.reduce((s, f) => s + parseInt(f.n), 0),
      porcentaje_ausencias: base > 0 ? Math.round((noAsistidos / base) * 100) : 0,
      por_estado: porEstado,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getStats, getGlobalStats, getAttendanceStats };
