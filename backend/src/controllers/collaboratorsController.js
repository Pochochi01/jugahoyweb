const bcrypt = require('bcryptjs');
const { Collaborator, User } = require('../models');

const PERMISOS_DEFAULT = {
  agenda: false, caja: false, operaciones: false,
  configuracion: false, colaboradores: false, estadisticas: false,
};

async function getAll(req, res) {
  try {
    const list = await Collaborator.findAll({
      where: { complex_id: req.params.complexId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'activo', 'rol'],
      }],
      order: [['created_at', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { nombre, apellido, email, password, telefono, permisos } = req.body;

    if (!nombre || !apellido || !email) {
      return res.status(400).json({ message: 'Nombre, apellido y email son obligatorios.' });
    }

    let user = await User.findOne({ where: { email } });

    if (user) {
      // Usuario existente: actualizar rol y datos, cambiar contraseña si se provee
      const upd = { rol: 'collaborator' };
      if (nombre) upd.nombre = nombre;
      if (apellido) upd.apellido = apellido;
      if (telefono) upd.telefono = telefono;
      if (password) upd.password = await bcrypt.hash(password, 10);
      await user.update(upd);
    } else {
      if (!password) {
        return res.status(400).json({ message: 'La contraseña es obligatoria para usuarios nuevos.' });
      }
      const hash = await bcrypt.hash(password, 10);
      user = await User.create({
        nombre, apellido, email, telefono,
        password: hash,
        rol: 'collaborator',
        activo: true,
      });
    }

    // Verificar si ya existe un registro de colaborador para este complejo
    const existing = await Collaborator.findOne({
      where: { complex_id: req.params.complexId, user_id: user.id },
    });
    if (existing) {
      await existing.update({
        nombre, apellido,
        permisos: permisos || PERMISOS_DEFAULT,
        activo: true,
      });
      const col = await Collaborator.findByPk(existing.id, {
        include: [{ model: User, as: 'user', attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'activo'] }],
      });
      return res.status(200).json(col);
    }

    const col = await Collaborator.create({
      complex_id: req.params.complexId,
      user_id:    user.id,
      nombre,
      apellido,
      permisos:   permisos || PERMISOS_DEFAULT,
      activo:     true,
    });

    const result = await Collaborator.findByPk(col.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'activo'] }],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const col = await Collaborator.findByPk(req.params.id, {
      include: [{ model: User, as: 'user' }],
    });
    if (!col) return res.status(404).json({ message: 'Colaborador no encontrado' });

    const { nombre, apellido, telefono, password, permisos } = req.body;

    // Actualizar datos del colaborador
    await col.update({ nombre, apellido, permisos });

    // Actualizar datos del usuario vinculado
    const userUpd = {};
    if (nombre)    userUpd.nombre   = nombre;
    if (apellido)  userUpd.apellido = apellido;
    if (telefono)  userUpd.telefono = telefono;
    if (password)  userUpd.password = await bcrypt.hash(password, 10);
    if (Object.keys(userUpd).length > 0) await col.user.update(userUpd);

    const result = await Collaborator.findByPk(col.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'activo'] }],
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function toggle(req, res) {
  try {
    const col = await Collaborator.findByPk(req.params.id);
    if (!col) return res.status(404).json({ message: 'Colaborador no encontrado' });
    await col.update({ activo: !col.activo });
    const result = await Collaborator.findByPk(col.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'nombre', 'apellido', 'email', 'telefono', 'activo'] }],
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const col = await Collaborator.findByPk(req.params.id, {
      include: [{ model: User, as: 'user' }],
    });
    if (!col) return res.status(404).json({ message: 'Colaborador no encontrado' });

    // Verificar si el usuario tiene más registros de colaborador en otros complejos
    const otrosComplejos = await Collaborator.count({
      where: { user_id: col.user_id, id: { [require('sequelize').Op.ne]: col.id } },
    });

    // Si no tiene otros complejos como colaborador, volver a 'player'
    if (otrosComplejos === 0 && col.user) {
      await col.user.update({ rol: 'player' });
    }

    await col.destroy();
    res.json({ message: 'Colaborador eliminado definitivamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAll, create, update, toggle, remove };
