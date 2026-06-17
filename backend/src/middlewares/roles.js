const { Collaborator } = require('../models');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'Acceso denegado: rol insuficiente' });
    }
    next();
  };
}

// Verifica acceso al complexId. Para colaboradores, carga sus permisos en req.collaborator
async function requireComplexAccess(req, res, next) {
  const { user } = req;
  const complexId = parseInt(req.params.complexId);

  if (user.rol === 'general_admin') return next();

  if (user.rol === 'complex_admin') {
    const { Complex } = require('../models');
    const complex = await Complex.findOne({ where: { id: complexId, owner_id: user.id } });
    if (!complex) return res.status(403).json({ message: 'Sin acceso a este complejo' });
    req.complex = complex;
    return next();
  }

  if (user.rol === 'collaborator') {
    const col = await Collaborator.findOne({
      where: { user_id: user.id, complex_id: complexId, activo: true },
    });
    if (!col) return res.status(403).json({ message: 'Sin acceso a este complejo' });
    req.collaborator = col;
    return next();
  }

  return res.status(403).json({ message: 'Acceso denegado' });
}

// Verifica que el colaborador tenga permiso para un módulo específico
// Los admins (general y complejo) siempre tienen acceso
function requirePermission(permiso) {
  return (req, res, next) => {
    const { rol } = req.user;

    if (rol === 'general_admin' || rol === 'complex_admin') return next();

    if (rol === 'collaborator') {
      const col = req.collaborator;
      if (!col) {
        return res.status(403).json({ message: 'Sin asignación de complejo' });
      }
      if (!col.permisos?.[permiso]) {
        return res.status(403).json({
          message: `No tenés permiso para acceder al módulo: ${permiso}`,
          permiso,
        });
      }
      return next();
    }

    return res.status(403).json({ message: 'Acceso denegado' });
  };
}

module.exports = { requireRole, requireComplexAccess, requirePermission };
