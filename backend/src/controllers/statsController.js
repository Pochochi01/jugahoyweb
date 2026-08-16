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

    // Conteo + suma de monto agrupados por estado en una sola query
    const filas = await Booking.findAll({
      where,
      attributes: [
        'estado',
        [sequelize.fn('COUNT', sequelize.col('id')), 'n'],
        [sequelize.fn('SUM', sequelize.col('monto')), 'monto'],
      ],
      group: ['estado'],
      raw: true,
    });
    const cnt   = (e) => parseInt(filas.find(f => f.estado === e)?.n || 0);
    const money = (e) => parseFloat(filas.find(f => f.estado === e)?.monto || 0);

    const asistidos    = cnt('confirmado');
    const noAsistidos  = cnt('no_asistido');
    const cancelados   = cnt('cancelado') + cnt('rechazado');
    // "Turnos pedidos" = los que debían cumplirse (asistieron + no asistieron)
    const pedidos      = asistidos + noAsistidos;

    const ingresosAsistidos   = money('confirmado');
    const ingresosNoAsistidos = money('no_asistido');

    res.json({
      // Cantidades
      reservas:      pedidos,          // total de turnos pedidos (asistidos + no asistidos)
      asistidos,                       // "Turnos asistidos" (los que jugaron)
      no_asistidos:  noAsistidos,
      cancelados,
      // Pesos
      ingresos:              ingresosAsistidos + ingresosNoAsistidos, // total de los pedidos
      ingresos_asistidos:    ingresosAsistidos,
      ingresos_no_asistidos: ingresosNoAsistidos,
      // Porcentajes (sobre el total de pedidos)
      ocupacion:             pedidos > 0 ? Math.round((asistidos / pedidos) * 100) : 0,
      porcentaje_ausencias:  pedidos > 0 ? Math.round((noAsistidos / pedidos) * 100) : 0,
      // compat
      confirmados: asistidos,
      total: filas.reduce((s, f) => s + parseInt(f.n), 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * GET /api/stats/:complexId/no-asistidos?desde=&hasta=
 * Lista de turnos marcados como "no asistido" en el rango de fechas.
 */
async function getNoShowList(req, res) {
  try {
    const { complexId } = req.params;
    const { desde, hasta } = req.query;

    const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
    const fieldIds = fields.map(f => f.id);
    if (fieldIds.length === 0) return res.json([]);

    const where = { field_id: { [Op.in]: fieldIds }, estado: 'no_asistido' };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = desde;
      if (hasta) where.fecha[Op.lte] = hasta;
    }

    const list = await Booking.findAll({
      where,
      attributes: ['id', 'fecha', 'hora_inicio', 'hora_fin', 'nombre_cliente', 'telefono_cliente', 'monto'],
      include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador'] }],
      order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getStats, getGlobalStats, getAttendanceStats, getNoShowList };
