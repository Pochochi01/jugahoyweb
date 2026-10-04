/**
 * routes/profesores.js — Módulo Profesores, cualquier deporte (montado en /api/profesores)
 *
 * Profesor (login por DNI):
 *   POST   /login                                  { dni, password }
 *   GET    /me/complejos                           complejos donde trabaja
 *   GET    /me/consolidado?desde&dias              clases en todos sus complejos
 *   GET    /me/actividades                         escuelas, horarios de escuela y torneos asignados (todos sus complejos)
 *   GET    /me/club/:complexId/grilla?desde&dias   ocupados + disponibles
 *   POST   /me/club/:complexId/clases              { field_id, fecha, hora_inicio, duracion, alumnos[] }
 *   PUT    /me/club/:complexId/clases/:id          { alumnos[], nota }
 *   DELETE /me/club/:complexId/clases/:id
 *   /me/club/:complexId/whatsapp[/conectar|/destinatarios|/enviar]   su teléfono propio (QR Baileys)
 *
 * Administrador del complejo (permiso 'profesores' para colaboradores):
 *   GET/POST        /club/:complexId/profesores
 *   GET/PUT/DELETE  /club/:complexId/profesores/:id
 *   PUT             /club/:complexId/profesores/:id/disponibilidad
 *   GET             /club/:complexId/profesores/:id/grilla
 *   DELETE          /club/:complexId/profesores/:id/clases/:claseId
 *   GET|PUT         /club/:complexId/profesores/:id/asignaciones   { escuela_ids, torneos:[{torneo_id, rol}] }
 *   GET             /club/:complexId/canchas
 */
const router = require('express').Router();
const admin = require('../controllers/profesoresController');
const panel = require('../controllers/profesorPanelController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');
const { authProfesor, profesorEnClub } = require('../middlewares/profesorAuth');
const { requireCanchas, requireModulo } = require('../middlewares/canchas');
const { rutasTelefono } = require('../controllers/entityPhoneController');
const { cargarEntidad } = require('../middlewares/entidadTelefono');

// ── Profesor ──────────────────────────────────────────────────
router.post('/login', panel.login);
router.get ('/me/complejos',   authProfesor, panel.complejos);
router.get ('/me/consolidado', authProfesor, panel.consolidado);
router.get ('/me/actividades', authProfesor, panel.actividades);

const me = require('express').Router({ mergeParams: true });
router.use('/me/club/:complexId', authProfesor, profesorEnClub, me);
me.get   ('/grilla',      panel.grilla);
me.post  ('/clases',      panel.crearClase);
me.put   ('/clases/:id',  panel.editarClase);
me.delete('/clases/:id',  panel.cancelarClase);
// Su propio WhatsApp en ese complejo (QR Baileys) → mensajes a sus alumnos
me.use('/whatsapp', cargarEntidad('profesor', req => req.profesor.id), rutasTelefono());

// ── Administrador del complejo ────────────────────────────────
const club = require('express').Router({ mergeParams: true });
router.use('/club/:complexId', authenticate, requireComplexAccess, requirePermission('profesores'), requireCanchas, requireModulo('profesores'),
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
club.get   ('/profesores/:id/asignaciones',        admin.getAsignaciones);
club.put   ('/profesores/:id/asignaciones',        admin.setAsignaciones);
club.use   ('/profesores/:id/whatsapp',            cargarEntidad('profesor', req => req.params.id), rutasTelefono({ acciones: ['estado', 'desconectar', 'destinatarios'] }));

module.exports = router;
