const { Operation, User } = require('../models');

async function getByComplex(req, res) {
  try {
    const { complexId } = req.params;
    const { limit = 50, offset = 0, tipo } = req.query;
    const where = { complex_id: complexId };
    if (tipo) where.tipo = tipo;

    const operations = await Operation.findAndCountAll({
      where,
      include: [{ model: User, as: 'usuario', attributes: ['id', 'nombre', 'apellido'] }],
      order: [['fecha', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    res.json(operations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getByComplex };
