'use strict';
/**
 * services/torneos/torneoPermisos.js — Permisos granulares del módulo Torneos.
 *
 *  - Administrador General y dueño del complejo: todo.
 *  - Colaborador: necesita el permiso de módulo 'torneos'; cada permiso granular está
 *    habilitado salvo que se haya desactivado explícitamente (permisos[clave] === false),
 *    así los colaboradores existentes conservan lo que ya podían hacer.
 *  - Organizador: torneo_organizadores.permisos (NULL = todos; false = desactivado).
 */
const PERMISOS = {
  'tournament.match.reschedule': 'Reprogramar partidos',
  'tournament.match.change_date': 'Cambiar el día de un partido',
  'tournament.match.change_time': 'Cambiar el horario de un partido',
  'tournament.match.change_court': 'Cambiar la cancha de un partido',
  'tournament.team.edit_players': 'Editar el plantel (parejas)',
  'tournament.team.add_player': 'Agregar jugadores',
  'tournament.team.update_player': 'Modificar jugadores',
  'tournament.team.remove_player': 'Eliminar jugadores',
};

/** Mapa { permiso: boolean } del usuario de la request. */
function permisosDe(req) {
  const rol = req.user?.rol;
  if (rol === 'general_admin' || rol === 'complex_admin') return Object.fromEntries(Object.keys(PERMISOS).map(k => [k, true]));
  const fuente = req.organizador ? (req.organizador.permisos || {}) : (req.collaborator?.permisos || {});
  if (!req.organizador && !req.collaborator?.permisos?.torneos) return Object.fromEntries(Object.keys(PERMISOS).map(k => [k, false]));
  return Object.fromEntries(Object.keys(PERMISOS).map(k => [k, fuente[k] !== false]));
}

const puede = (req, permiso) => permisosDe(req)[permiso] === true;

/** Middleware: exige TODOS los permisos indicados. */
function requireTorneoPermiso(...permisos) {
  return (req, res, next) => {
    const faltan = permisos.filter(p => !puede(req, p));
    if (!faltan.length) return next();
    console.warn(`[torneos][permisos] DENEGADO · ${req.user ? `usuario ${req.user.id}` : `organizador ${req.organizador?.id}`} · ${faltan.join(', ')}`);
    res.status(403).json({ message: `No tenés permiso: ${faltan.map(p => PERMISOS[p]).join(', ')}.`, permisos: faltan });
  };
}

/** Normaliza un objeto de permisos recibido (solo claves conocidas, booleanos). */
function normalizar(body = {}) {
  return Object.fromEntries(Object.keys(PERMISOS).filter(k => body[k] !== undefined).map(k => [k, Boolean(body[k])]));
}

module.exports = { PERMISOS, permisosDe, puede, requireTorneoPermiso, normalizar };
