/**
 * routes/profesores.js — Módulo Profesores de pádel (montado en /api/profesores)
 *
 * Profesor (login por DNI):
 *   POST   /login                                  { dni, password }
 *   GET    /me/complejos                           complejos donde trabaja
 *   GET    /me/consolidado?desde&dias              clases en todos sus complejos
 *   GET    /me/club/:complexId/grilla?desde&dias   ocupados + disponibles
 *   POST   /me/club/:complexId/clases              { field_id, fecha, hora_inicio, duracion, alumnos[] }
 *   PUT    /me/club/:complexId/clases/:id          { alumnos[], nota }
 *   DELETE /me/club/:complexId/clases/:id
 *
 * Administrador del complejo (permiso 'profesores' para colaboradores):
 *   GET/POST        /club/:complexId/profesores
 *   GET/PUT/DELETE  /club/:complexId/profesores/:id
 *   PUT             /club/:complexId/profesores/:id/disponibilidad
 *   GET             /club/:complexId/profesores/:id/grilla
 *   DELETE          /club/:complexId/profesores/:id/clases/:claseId
 *   GET             /club/:complexId/canchas
 */
const router = require('express').Router();
const admin = require('../controllers/profesoresController');
const panel = require('../controllers/profesorPanelController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');
const { authProfesor, profesorEnClub, requirePadel } = require('../middlewares/profesorAuth');

// ── Profesor ──────────────────────────────────────────────────
router.post('/login', panel.login);
router.get ('/me/complejos',   authProfesor, panel.complejos);
router.get ('/me/consolidado', authProfesor, panel.consolidado);

const me = require('express').Router({ mergeParams: true });
router.use('/me/club/:complexId', authProfesor, profesorEnClub, me);
me.get   ('/grilla',      panel.grilla);
me.post  ('/clases',      panel.crearClase);
me.put   ('/clases/:id',  panel.editarClase);
me.delete('/clases/:id',  panel.cancelarClase);

// ── Administrador del complejo ────────────────────────────────
const club = require('express').Router({ mergeParams: true });
router.use('/club/:complexId', authenticate, requireComplexAccess, requirePermission('profesores'), requirePadel,
  (req, _res, next) => { req.clubId = Number(req.params.complexId); next(); }, club);

club.get   ('/canchas',                            admin.canchas);
club.get   ('/profesores',                         admin.list);
club.post  ('/profesores',                         admin.create);
club.get   ('/profesores/:id',                     admin.get);
club.put   ('/profesores/:id',                     admin.update);
club.delete('/profesores/:id',                     admin.remove);
club.put   ('/profesores/:id/disponibilidad',      admin.setDisponibilidad);
club.get   ('/profesores/:id/grilla',              admin.grilla);
club.delete('/profesores/:id/clases/:claseId',     admin.cancelarClase);

module.exports = router;
