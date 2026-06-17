const { Complex, Field, User, Collaborator } = require('../models');

async function getAll(req, res) {
  try {
    const { rol, id: userId } = req.user;

    if (rol === 'general_admin') {
      const complexes = await Complex.findAll({
        include: [{ model: Field, as: 'fields' }],
        order: [['nombre', 'ASC']],
      });
      return res.json(complexes);
    }

    if (rol === 'complex_admin') {
      const complexes = await Complex.findAll({
        where: { owner_id: userId },
        include: [{ model: Field, as: 'fields' }],
        order: [['nombre', 'ASC']],
      });
      return res.json(complexes);
    }

    if (rol === 'collaborator') {
      // Solo los complejos donde está asignado y activo
      const assignments = await Collaborator.findAll({
        where: { user_id: userId, activo: true },
        include: [{
          model: Complex,
          as: 'complex',
          where: { activo: true },
          include: [{ model: Field, as: 'fields' }],
        }],
      });
      const complexes = assignments.map(a => a.complex).filter(Boolean);
      return res.json(complexes);
    }

    res.json([]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getOne(req, res) {
  try {
    const complex = await Complex.findByPk(req.params.id, {
      include: [
        { model: Field, as: 'fields' },
        { model: User, as: 'owner', attributes: ['id', 'nombre', 'apellido', 'email'] },
      ],
    });
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });
    res.json(complex);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const complex = await Complex.create({ ...req.body, owner_id: req.user.id });
    if (req.user.rol === 'player') {
      await req.user.update({ rol: 'complex_admin' });
    }
    res.status(201).json(complex);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const complex = await Complex.findByPk(req.params.id);
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });
    await complex.update(req.body);
    res.json(complex);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const complex = await Complex.findByPk(req.params.id);
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });
    await complex.update({ activo: false });
    res.json({ message: 'Complejo desactivado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAll, getOne, create, update, remove };
