const bcrypt = require('bcryptjs');
const { User } = require('../models');

async function getAll(req, res) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'rol', 'activo', 'created_at'],
      order: [['created_at', 'DESC']],
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { nombre, apellido, email, password, telefono, rol } = req.body;
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(409).json({ message: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password || Math.random().toString(36).slice(-8), 10);
    const user = await User.create({ nombre, apellido, email, password: hash, telefono, rol: rol || 'player' });
    const { password: _, ...safe } = user.toJSON();
    res.status(201).json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    const { rol, activo, nombre, apellido, telefono, password } = req.body;
    const upd = { rol, activo, nombre, apellido, telefono };
    if (password) upd.password = await bcrypt.hash(password, 10);
    await user.update(upd);
    const { password: _, ...safe } = user.toJSON();
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.id === req.user.id) return res.status(400).json({ message: 'No podés desactivar tu propia cuenta' });
    await user.update({ activo: false });
    res.json({ message: 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAll, create, update, remove };
