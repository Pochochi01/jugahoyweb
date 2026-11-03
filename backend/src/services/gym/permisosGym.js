'use strict';
/**
 * services/gym/permisosGym.js — Roles y permisos granulares del módulo Gym.
 *
 *  - Super Administrador (users.rol = general_admin) y dueño del complejo (complex_admin): todo.
 *  - Colaboradores: `collaborators.permisos.gym_rol` = clave de un rol de gym_roles del
 *    complejo (recepcionista, profesor, nutricionista, personal_trainer, admin_gym, o uno
 *    propio). Cada rol tiene { recurso: [acciones] } editable desde el panel.
 *  - Socio: no usa el panel; accede a su app con el link/QR personal (portal).
 *
 * Los roles por defecto se crean la primera vez que se consultan (por complejo).
 */
const { GymRol, Complex } = require('../../models');

const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'];
const RECURSOS = {
  dashboard: 'Dashboard', socios: 'Socios', accesos: 'Control de acceso', planes: 'Planes y actividades',
  cobranzas: 'Cobranzas', clases: 'Agenda de clases', reservas: 'Reservas', profesores: 'Profesores',
  asistencia: 'Asistencia', rutinas: 'Rutinas', evaluaciones: 'Evaluación física', nutricion: 'Nutrición',
  equipos: 'Equipos y mantenimiento', reportes: 'Reportes', configuracion: 'Configuración', auditoria: 'Auditoría',
};
const todo = () => Object.fromEntries(Object.keys(RECURSOS).map(r => [r, [...ACCIONES]]));
const VER = ['ver'];
const ROLES_DEFAULT = [
  { clave: 'admin_gym', nombre: 'Administrador Gym', permisos: todo() },
  { clave: 'recepcionista', nombre: 'Recepcionista', permisos: {
    dashboard: VER, socios: ['ver', 'crear', 'editar'], accesos: ['ver', 'crear'], planes: VER,
    cobranzas: ['ver', 'crear'], clases: VER, reservas: ['ver', 'crear', 'editar', 'eliminar'], profesores: VER,
    asistencia: ['ver', 'crear'], equipos: VER, reportes: VER,
  } },
  { clave: 'profesor', nombre: 'Profesor', permisos: {
    socios: VER, clases: ['ver', 'editar'], reservas: ['ver', 'editar'], asistencia: ['ver', 'crear'],
    rutinas: ['ver', 'crear', 'editar'], evaluaciones: ['ver', 'crear', 'editar'], equipos: VER,
  } },
  { clave: 'personal_trainer', nombre: 'Personal Trainer', permisos: {
    socios: VER, clases: VER, asistencia: VER, rutinas: ['ver', 'crear', 'editar', 'eliminar'], evaluaciones: ['ver', 'crear', 'editar', 'eliminar'],
  } },
  { clave: 'nutricionista', nombre: 'Nutricionista', permisos: {
    socios: VER, evaluaciones: ['ver', 'crear', 'editar'], nutricion: ['ver', 'crear', 'editar', 'eliminar'],
  } },
];

/** Roles del complejo (crea los de fábrica si no hay ninguno). */
async function rolesDe(complexId) {
  let roles = await GymRol.findAll({ where: { complex_id: complexId }, order: [['id', 'ASC']] });
  if (!roles.length) {
    await GymRol.bulkCreate(ROLES_DEFAULT.map(r => ({ ...r, complex_id: complexId })), { ignoreDuplicates: true });
    roles = await GymRol.findAll({ where: { complex_id: complexId }, order: [['id', 'ASC']] });
  }
  return roles;
}

/** Normaliza { recurso: [acciones] } descartando recursos/acciones desconocidos. */
function normalizar(permisos = {}) {
  const out = {};
  for (const [r, acc] of Object.entries(permisos || {})) {
    if (!RECURSOS[r] || !Array.isArray(acc)) continue;
    const validas = [...new Set(acc.filter(a => ACCIONES.includes(a)))];
    if (validas.length) out[r] = validas;
  }
  return out;
}

/** Permisos efectivos del usuario del request. null = acceso total. */
async function permisosDe(req) {
  if (req._gymPermisos !== undefined) return req._gymPermisos;
  const rol = req.user?.rol;
  if (rol === 'general_admin' || rol === 'complex_admin') return (req._gymPermisos = null);
  const clave = req.collaborator?.permisos?.gym_rol;
  if (!clave) return (req._gymPermisos = {});
  const roles = await rolesDe(Number(req.params.complexId));
  return (req._gymPermisos = roles.find(r => r.clave === clave)?.permisos || {});
}

const puede = (permisos, recurso, accion) => permisos === null || (permisos[recurso] || []).includes(accion);

/** Middleware: el módulo Gym debe estar habilitado en el complejo. */
async function requireGym(req, res, next) {
  try {
    const c = await Complex.findByPk(req.params.complexId, { attributes: ['id', 'modulo_gym'] });
    if (!c?.modulo_gym) return res.status(403).json({ message: 'El módulo Gym no está habilitado en este complejo.', code: 'GYM_DESHABILITADO' });
    next();
  } catch (err) { next(err); }
}

/** Middleware de permiso granular: gymPermiso('socios', 'crear'). */
function gymPermiso(recurso, accion = 'ver') {
  return async (req, res, next) => {
    try {
      if (puede(await permisosDe(req), recurso, accion)) return next();
      console.warn(`[gym][permisos] DENEGADO · usuario ${req.user?.id} · complejo ${req.params.complexId} · ${recurso}:${accion}`);
      res.status(403).json({ message: `No tenés permiso para ${accion} en ${RECURSOS[recurso] || recurso}.`, recurso, accion });
    } catch (err) { next(err); }
  };
}

module.exports = { ACCIONES, RECURSOS, ROLES_DEFAULT, rolesDe, normalizar, permisosDe, puede, requireGym, gymPermiso };
