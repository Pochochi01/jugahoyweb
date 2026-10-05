/**
 * routes/escuela.js — Escuelas deportivas (montado en /api/escuela)
 *
 * Un complejo puede tener VARIAS escuelas (fútbol, tenis, pádel…); cada una usa
 * solo las canchas de su deporte. Disponible con al menos una cancha habilitada.
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
 *   GET|POST /club/:complexId/escuelas · PUT|DELETE /club/:complexId/escuelas/:id
 *   /club/:complexId/escuelas/:id/whatsapp[...]      teléfono propio de la escuela (QR, envíos)
 *   /profesor/club/:complexId/escuelas/:id/whatsapp  entrenador asignado: estado / destinatarios / enviar
 *   /club/:complexId/{config, canchas, categorias, alumnos, entrenadores, horarios, pagos, avisos, mensajes}?escuela_id=N
 *     (sin escuela_id → la primera escuela del complejo)
 */
const router = require('express').Router();
const admin = require('../controllers/escuelaController');
const escuelas = require('../controllers/escuelasController');
const { requireDeporteDisponible, listarDeportes } = require('../middlewares/deporteDisponible');
const { Escuela } = require('../models');
const mensajes = require('../controllers/escuelaMensajesController');
const prof = require('../controllers/escuelaProfesorController');
const portal = require('../controllers/escuelaPortalController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission } = require('../middlewares/roles');
const { authProfesor, profesorEnClub } = require('../middlewares/profesorAuth');
const { requireCanchas, requireModulo } = require('../middlewares/canchas');
const { rutasTelefono } = require('../controllers/entityPhoneController');
const { cargarEntidad } = require('../middlewares/entidadTelefono');
const { EscuelaProfesor, EscuelaCategoria, EscuelaProfesorCategoria } = require('../models');

/** El entrenador solo opera el teléfono de una escuela a la que está asignado. */
async function profesorDeEscuela(req, res, next) {
  try {
    const escuelaId = Number(req.params.escuelaId);
    const directo = await EscuelaProfesor.count({ where: { escuela_id: escuelaId, profesor_id: req.profesor.id } });
    const cats = directo ? [] : (await EscuelaCategoria.findAll({ where: { escuela_id: escuelaId }, attributes: ['id'], raw: true })).map(c => c.id);
    const porCategoria = cats.length ? await EscuelaProfesorCategoria.count({ where: { profesor_id: req.profesor.id, categoria_id: cats } }) : 0;
    if (!directo && !porCategoria) return res.status(403).json({ message: 'No estás asignado a esa escuela.' });
    next();
  } catch (err) { next(err); }
}

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
// WhatsApp de la escuela: el entrenador puede ver el estado y enviar (no vincular ni desvincular)
p.use('/escuelas/:escuelaId/whatsapp', profesorDeEscuela, cargarEntidad('escuela', req => req.params.escuelaId), rutasTelefono({ acciones: ['estado', 'destinatarios', 'enviar'] }));

// ── Panel admin / colaborador ─────────────────────────────────
const c = require('express').Router({ mergeParams: true });
router.use('/club/:complexId', authenticate, requireComplexAccess, requirePermission('escuela'), requireCanchas, requireModulo('escuela'), c);

c.get   ('/deportes',     listarDeportes);   // deportes con canchas habilitadas (desplegable)
c.get   ('/escuelas',     escuelas.list);
c.post  ('/escuelas',     requireDeporteDisponible({ actividad: 'escuelas' }), escuelas.create);
c.put   ('/escuelas/:id', requireDeporteDisponible({
  actividad: 'escuelas',
  actual: async (req) => (await Escuela.findOne({ where: { id: req.params.id, complex_id: Number(req.params.complexId) }, attributes: ['deporte'] }))?.deporte,
}), escuelas.update);
c.delete('/escuelas/:id', escuelas.remove);

// WhatsApp propio de la escuela (QR Baileys) → mensajes a los alumnos
c.use('/escuelas/:escuelaId/whatsapp', cargarEntidad('escuela', req => req.params.escuelaId), rutasTelefono());

// Todo lo que sigue es de UNA escuela (?escuela_id=)
c.use(admin.cargarEscuela);
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

// Mensajes a los padres (borrador editable → envío masivo por el WhatsApp de la escuela)
c.get   ('/mensajes/plantillas',          mensajes.plantillas);
c.get   ('/mensajes',                     mensajes.listar);
c.post  ('/mensajes',                     mensajes.crear);
c.put   ('/mensajes/:id',                 mensajes.editar);
c.delete('/mensajes/:id',                 mensajes.borrar);
c.post  ('/mensajes/:id/duplicar',        mensajes.duplicar);
c.get   ('/mensajes/:id/destinatarios',   mensajes.vistaPrevia);
c.post  ('/mensajes/:id/enviar',          mensajes.enviar);

c.get   ('/avisos',     admin.listAvisos);
c.post  ('/avisos',     admin.createAviso);
c.delete('/avisos/:id', admin.deleteAviso);

module.exports = router;
