const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token requerido' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(payload.id);
    if (!user || !user.activo) return res.status(401).json({ message: 'Usuario no válido' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

module.exports = { authenticate };
