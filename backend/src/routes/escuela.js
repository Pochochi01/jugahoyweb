/**
 * routes/escuela.js — Escuela de Fútbol (montado en /api/escuela)
 *
 * Disponible solo en complejos con al menos una cancha de FÚTBOL habilitada
 * (requireModulo('escuela')). En complejos con otros deportes, la escuela
 * trabaja únicamente con las canchas de fútbol.
 *
 * Portal alumno/padre (link personal, sin login):
 *   GET  /portal/:token
 *
 * Entrenador (login por DNI, /api/profesores/login):
 *   GET  /profesor/club/:complexId/resumen
 *   POST|PUT|DELETE /profesor/club/:complexId/horarios[/:id]
 *   POST /profesor/club/:complexId/avisos
 *   GET  /profesor/club/:complexId/alumnos/:id/contexto
 *
 * Panel admin / colaborador (permiso 'escuela'):
 *   /club/:complexId/{config, canchas, categorias, alumnos, entrenadores, horarios, pagos, avisos}
 */
const router = require('express').Router();
const admin = require('../controllers/escuelaController');
const prof = require('../controllers/escuelaProfesorController');
const portal = require('../controllers/escuelaPortalController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');
const { authProfesor, profesorEnClub } = require('../middlewares/profesorAuth');
const { requireCanchas, requireModulo } = require('../middlewares/canchas');

// ── Portal alumno / padre ─────────────────────────────────────
router.get('/portal/:token', portal.portal);

// ── Entrenador ────────────────────────────────────────────────
const p = require('express').Router({ mergeParams: true });
router.use('/profesor/club/:complexId', authProfesor, profesorEnClub, requireModulo('escuela'), p);
p.get   ('/resumen',               prof.resumen);
p.post  ('/horarios',              prof.createHorario);
p.put   ('/horarios/:id',          prof.updateHorario);
p.delete('/horarios/:id',          prof.deleteHorario);
p.post  ('/avisos',                prof.createAviso);
p.get   ('/alumnos/:id/contexto',  prof.contextoAlumno);

// ── Panel admin / colaborador ─────────────────────────────────
const c = require('express').Router({ mergeParams: true });
router.use('/club/:complexId', authenticate, requireComplexAccess, requirePermission('escuela'), requireCanchas, requireModulo('escuela'), c);

c.get('/config',  admin.getConfig);
c.put('/config',  admin.updateConfig);
c.get('/canchas', admin.canchas);

c.get   ('/categorias',     admin.listCategorias);
c.post  ('/categorias',     admin.createCategoria);
c.put   ('/categorias/:id', admin.updateCategoria);
c.delete('/categorias/:id', admin.deleteCategoria);

c.get   ('/alumnos',               admin.listAlumnos);
c.post  ('/alumnos',               admin.createAlumno);
c.put   ('/alumnos/:id',           admin.updateAlumno);
c.delete('/alumnos/:id',           admin.deleteAlumno);
c.get   ('/alumnos/:id/contexto',  admin.contextoAlumno);
c.post  ('/alumnos/:id/nuevo-link', admin.nuevoLinkPortal);

c.get('/entrenadores',                 admin.listEntrenadores);
c.put('/entrenadores/:id/categorias',  admin.asignarCategorias);

c.get   ('/horarios',     admin.listHorarios);
c.post  ('/horarios',     admin.createHorario);
c.put   ('/horarios/:id', admin.updateHorario);
c.delete('/horarios/:id', admin.deleteHorario);

c.get   ('/pagos',             admin.listPagos);
c.post  ('/pagos',             admin.createPago);
c.post  ('/pagos/generar',     admin.generarCuotas);
c.post  ('/pagos/:id/pagar',   admin.pagarCuota);
c.post  ('/pagos/:id/anular',  admin.anularPago);
c.delete('/pagos/:id',         admin.deletePago);

c.get   ('/avisos',     admin.listAvisos);
c.post  ('/avisos',     admin.createAviso);
c.delete('/avisos/:id', admin.deleteAviso);

module.exports = router;
