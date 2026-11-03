/**
 * routes/gym.js — Módulo GYM / FITNESS CENTER (montado en /api/gym)
 *
 * App del socio (link/QR personal, sin login):
 *   GET  /socio/:token                     resumen: cuotas, pagos, plan, apto, QR
 *   GET  /socio/:token/{reservas, disponibilidad, rutinas, evaluaciones, asistencia}
 *   POST /socio/:token/clases/:claseId/reservar · DELETE /socio/:token/reservas/:reservaId
 *   POST /socio/:token/rutinas/:rutinaId/comentarios
 *
 * Panel (usuario logueado con acceso al complejo + módulo habilitado + permiso granular):
 *   /:complexId/{contexto, config, roles, sucursales, actividades, planes, socios, acceso, accesos,
 *                pagos, morosos, alertas, clases, reservas, asistencia, profesores, rutinas,
 *                evaluaciones, nutricion, equipos, dashboard, reportes, auditoria}
 */
const router = require('express').Router();
const c = require('../controllers/gymController');
const portal = require('../controllers/gymSocioController');
const cat = require('../services/gym/catalogosService');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requireRole } = require('../middlewares/roles');
const { requireGym, gymPermiso: p } = require('../services/gym/permisosGym');

// ── App del socio ──
router.use('/socio/:token', portal.socioPorToken);
router.get('/socio/:token', portal.resumen);
router.get('/socio/:token/reservas', portal.reservas);
router.get('/socio/:token/disponibilidad', portal.disponibilidad);
router.post('/socio/:token/clases/:claseId/reservar', portal.reservar);
router.delete('/socio/:token/reservas/:reservaId', portal.cancelar);
router.get('/socio/:token/rutinas', portal.rutinas);
router.post('/socio/:token/rutinas/:rutinaId/comentarios', portal.comentarRutina);
router.get('/socio/:token/evaluaciones', portal.evaluaciones);
router.get('/socio/:token/asistencia', portal.asistencia);

// ── Panel ──
const base = '/:complexId';
router.use(base, authenticate, requireComplexAccess, requireGym);

router.get(`${base}/contexto`, c.contexto);
router.put(`${base}/config`, p('configuracion', 'editar'), c.guardarConfig);
router.get(`${base}/roles`, p('configuracion', 'ver'), c.roles);
router.put(`${base}/roles`, requireRole('general_admin', 'complex_admin'), c.guardarRol);
router.put(`${base}/roles/colaboradores/:colaboradorId`, requireRole('general_admin', 'complex_admin'), c.asignarRol);

/** Rutas CRUD estándar de un catálogo con su recurso de permisos. */
function catalogo(path, recurso, servicio, entidad) {
  const k = c.crud(entidad, servicio);
  router.get(`${base}/${path}`, p(recurso, 'ver'), k.listar);
  router.post(`${base}/${path}`, p(recurso, 'crear'), k.crear);
  router.put(`${base}/${path}/:id`, p(recurso, 'editar'), k.actualizar);
  router.delete(`${base}/${path}/:id`, p(recurso, 'eliminar'), k.eliminar);
}
catalogo('sucursales', 'configuracion', cat.sucursales, 'sucursal');
catalogo('actividades', 'planes', cat.actividades, 'actividad');
catalogo('planes', 'planes', cat.planes, 'plan');
catalogo('profesores', 'profesores', cat.profesores, 'profesor');
catalogo('equipos', 'equipos', cat.equipos, 'equipo');

// Socios
router.get(`${base}/socios`, p('socios', 'ver'), c.listarSocios);
router.post(`${base}/socios`, p('socios', 'crear'), c.crearSocio);
router.get(`${base}/socios/:id`, p('socios', 'ver'), c.fichaSocio);
router.put(`${base}/socios/:id`, p('socios', 'editar'), c.actualizarSocio);
router.put(`${base}/socios/:id/estado`, p('socios', 'aprobar'), c.estadoSocio);
router.get(`${base}/socios/:id/qr`, p('socios', 'ver'), c.qrSocio);
router.post(`${base}/socios/:id/aptos`, p('socios', 'editar'), c.aptoSocio);
router.post(`${base}/socios/:id/membresias`, p('cobranzas', 'crear'), c.asignarPlan);
router.post(`${base}/socios/:id/pagos`, p('cobranzas', 'crear'), c.pagar);
router.get(`${base}/socios/:id/evaluaciones`, p('evaluaciones', 'ver'), c.evaluaciones);
router.post(`${base}/socios/:id/evaluaciones`, p('evaluaciones', 'crear'), c.crearEvaluacion);
router.get(`${base}/socios/:id/nutricion`, p('nutricion', 'ver'), c.nutricion);
router.post(`${base}/socios/:id/nutricion`, p('nutricion', 'crear'), c.crearNutricion);

// Control de acceso
router.post(`${base}/acceso`, p('accesos', 'crear'), c.acceso);
router.get(`${base}/accesos`, p('accesos', 'ver'), c.accesos);

// Cobranzas
router.delete(`${base}/membresias/:id`, p('cobranzas', 'eliminar'), c.cancelarMembresia);
router.get(`${base}/pagos`, p('cobranzas', 'ver'), c.pagos);
router.get(`${base}/pagos/:id/recibo`, p('cobranzas', 'ver'), c.recibo);
router.put(`${base}/pagos/:id/anular`, p('cobranzas', 'aprobar'), c.anularPago);
router.get(`${base}/morosos`, p('cobranzas', 'ver'), c.morosos);
router.get(`${base}/alertas`, p('dashboard', 'ver'), c.alertas);

// Clases, reservas y asistencia
router.get(`${base}/clases`, p('clases', 'ver'), c.listarClases);
router.post(`${base}/clases`, p('clases', 'crear'), c.crearClase);
router.put(`${base}/clases/:id`, p('clases', 'editar'), c.actualizarClase);
router.put(`${base}/clases/:id/cancelar`, p('clases', 'eliminar'), c.cancelarClase);
router.get(`${base}/clases/:id/reservas`, p('reservas', 'ver'), c.reservasClase);
router.post(`${base}/clases/:id/reservas`, p('reservas', 'crear'), c.reservar);
router.put(`${base}/clases/:id/asistencia`, p('asistencia', 'crear'), c.asistenciaClase);
router.delete(`${base}/reservas/:id`, p('reservas', 'eliminar'), c.cancelarReserva);
router.get(`${base}/asistencia`, p('asistencia', 'ver'), c.asistencia);

// Profesores (estadísticas)
router.get(`${base}/profesores-estadisticas`, p('profesores', 'ver'), c.statsProfesores);

// Rutinas
router.get(`${base}/rutinas`, p('rutinas', 'ver'), c.listarRutinas);
router.post(`${base}/rutinas`, p('rutinas', 'crear'), c.crearRutina);
router.get(`${base}/rutinas/:id`, p('rutinas', 'ver'), c.rutina);
router.put(`${base}/rutinas/:id`, p('rutinas', 'editar'), c.versionRutina);
router.delete(`${base}/rutinas/:id`, p('rutinas', 'eliminar'), c.eliminarRutina);
router.post(`${base}/rutinas/:id/asignar`, p('rutinas', 'crear'), c.asignarPlantilla);
router.post(`${base}/rutinas/:id/comentarios`, p('rutinas', 'ver'), c.comentarRutina);

// Evaluaciones / nutrición
router.put(`${base}/evaluaciones/:id`, p('evaluaciones', 'editar'), c.actualizarEvaluacion);
router.delete(`${base}/evaluaciones/:id`, p('evaluaciones', 'eliminar'), c.eliminarEvaluacion);
router.post(`${base}/nutricion/:id/seguimientos`, p('nutricion', 'editar'), c.seguimientoNutricion);

// Equipos (mantenimiento)
router.get(`${base}/equipos/:id/eventos`, p('equipos', 'ver'), c.eventosEquipo);
router.post(`${base}/equipos/:id/eventos`, p('equipos', 'editar'), c.eventoEquipo);

// Dashboard, reportes y auditoría
router.get(`${base}/dashboard`, p('dashboard', 'ver'), c.dashboard);
router.get(`${base}/reportes/:tipo`, (req, res, next) => p('reportes', req.query.formato && req.query.formato !== 'json' ? 'exportar' : 'ver')(req, res, next), c.reporte);
router.get(`${base}/auditoria`, p('auditoria', 'ver'), c.auditoria);

module.exports = router;
