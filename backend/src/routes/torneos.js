/**
 * routes/torneos.js — Módulo Torneos de pádel (montado en /api/torneos)
 *
 * Público (sin login):
 *   GET  /public                                   torneos abiertos de todos los clubes
 *   GET  /public/club/:complexId                   torneos de un club
 *   GET  /public/:torneoId                         detalle + cupos + franjas de juego
 *   GET  /public/:torneoId/fixture                 zonas, tablas, llave
 *   GET  /public/:torneoId/ranking                 posiciones por jugador
 *   GET  /public/:torneoId/mi-pareja?dni=          inscripción y partidos del jugador
 *   POST /public/:torneoId/inscripciones           inscripción de una pareja
 *   POST /public/parejas/:parejaId/pagar           preference de MercadoPago
 *   GET  /public/pagos/sync                        reconciliación al volver de MP
 *   POST /public/pagos/webhook                     webhook de MP
 *   GET  /public/tickets/:codigo                   ticket QR
 *
 * Organizador:
 *   POST /organizador/login
 *
 * Staff del club (admin / colaborador con permiso 'torneos' / organizador):
 *   Torneos EXCLUSIVOS de pádel: /club/* exige canchas de pádel (requireModulo('torneos'));
 *   POST fija deporte='padel' y valida canchas (requireTorneoPadel); PUT no cambia el deporte.
 *   /club/:complexId/torneos/:torneoId/whatsapp[/conectar|/destinatarios|/enviar]   teléfono propio del torneo
 *   /club/:complexId/...  (ver abajo)
 */
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const torneos     = require('../controllers/torneosController');
const orgs        = require('../controllers/torneoOrganizadoresController');
const inscr       = require('../controllers/torneoInscripcionesController');
const pagos       = require('../controllers/torneoPagosController');
const resultados  = require('../controllers/torneoResultadosController');
const comunicacion = require('../controllers/torneoComunicacionController');
const pub         = require('../controllers/torneoPublicController');
const ranking     = require('../controllers/torneoRankingController');
const plantel     = require('../controllers/torneoPlantelController');
const { requireTorneoPermiso: puede } = require('../services/torneos/torneoPermisos');
const { authTorneoStaff, requireClubAdmin, loadTorneo, optionalUser } = require('../middlewares/torneoAuth');
const { requireCanchas, requireModulo } = require('../middlewares/canchas');
const { rutasTelefono } = require('../controllers/entityPhoneController');
const { requireTorneoPadel, deporteFijoPadel } = require('../middlewares/torneoPadel');
const { cargarEntidad } = require('../middlewares/entidadTelefono');

// ── Upload de la imagen del evento ────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads/torneos');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `torneo-${req.params.torneoId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

// ── Público ───────────────────────────────────────────────────
router.get ('/public',                          pub.listar);
router.get ('/public/club/:complexId',          pub.listar);
router.get ('/public/tickets/:codigo',          pub.ticket);
router.get ('/public/pagos/sync',               pagos.sync);
router.post('/public/pagos/webhook',            pagos.webhook);
router.post('/public/parejas/:parejaId/pagar',  pagos.iniciarPago);
router.get ('/public/:torneoId',                pub.detalle);
router.get ('/public/:torneoId/fixture',        pub.fixture);
router.get ('/public/:torneoId/ranking',        pub.ranking);
router.get ('/public/:torneoId/mi-pareja',      pub.miPareja);
router.post('/public/:torneoId/inscripciones',  optionalUser, inscr.inscribirPublico);

// ── Organizador: login ────────────────────────────────────────
router.post('/organizador/login', orgs.login);

// ── Staff del club ────────────────────────────────────────────
const club = require('express').Router({ mergeParams: true });
// Torneos = solo pádel: sin canchas de pádel el módulo responde 403 (MODULO_NO_HABILITADO)
router.use('/club/:complexId', authTorneoStaff, requireCanchas, requireModulo('torneos'), club);

club.get('/organizador/me', orgs.me);
club.get('/torneos-permisos', plantel.misPermisos);

// Organizadores (solo admins del club)
club.get   ('/organizadores',     requireClubAdmin, orgs.list);
club.post  ('/organizadores',     requireClubAdmin, orgs.create);
club.put   ('/organizadores/:id', requireClubAdmin, orgs.update);
club.delete('/organizadores/:id', requireClubAdmin, orgs.remove);

// Ligas y categorías (cada torneo pertenece a una liga; el ranking nunca mezcla ligas)
club.get   ('/ligas',       ranking.ligas);
club.post  ('/ligas',       requireClubAdmin, ranking.crearLiga);
club.put   ('/ligas/:id',   requireClubAdmin, ranking.actualizarLiga);
club.delete('/ligas/:id',   requireClubAdmin, ranking.eliminarLiga);
club.get   ('/categorias',  ranking.categorias);
// Jugadores del club (todos, también con 0 puntos) para inscribir
club.get   ('/jugadores',   ranking.jugadores);
// Ranking anual por liga + categoría + temporada (consulta: staff del club).
// Editar puntos, configurar puntajes, recalcular y ver auditorías: SOLO Administrador General.
const soloAdminGeneral = (req, res, next) => (req.user?.rol === 'general_admin'
  ? next() : res.status(403).json({ message: 'Solo el Administrador General puede hacer esto.' }));
club.get   ('/ranking',                          ranking.list);
club.get   ('/ranking/temporadas',               ranking.temporadas);
club.post  ('/ranking/temporadas',               soloAdminGeneral, ranking.crearTemporada);
club.put   ('/ranking/temporadas/:id',           soloAdminGeneral, ranking.actualizarTemporada);
club.get   ('/ranking/configuracion',            ranking.config);
club.put   ('/ranking/configuracion/:temporada/:categoriaId', soloAdminGeneral, ranking.guardarConfig);
club.post  ('/ranking/recalcular',               soloAdminGeneral, ranking.recalcular);
club.get   ('/ranking/recalcular/:id',           soloAdminGeneral, ranking.estadoRecalculo);
club.get   ('/ranking/ajustes',                  soloAdminGeneral, ranking.historial);
club.post  ('/ranking/ajustes',                  soloAdminGeneral, ranking.ajuste);
club.put   ('/ranking',                          soloAdminGeneral, ranking.upsert);
club.delete('/ranking/:id',                      soloAdminGeneral, ranking.remove);

// Tickets: validación en la entrada
club.post('/tickets/validar', inscr.validarTicket);

// Torneos
// Administración > Notificaciones push (historial, métricas, reenvío)
const notifAdmin = require('../controllers/notifications/torneoNotificacionesController');
club.get ('/notificaciones',              notifAdmin.listar);
club.get ('/notificaciones/metricas',     notifAdmin.metricas);
club.post('/notificaciones/:id/reenviar', notifAdmin.reenviar);
club.get ('/torneos',                         torneos.list);
club.post('/torneos',                         requireTorneoPadel, torneos.create);
club.get ('/torneos/:torneoId',               loadTorneo, torneos.get);
club.put ('/torneos/:torneoId',               loadTorneo, deporteFijoPadel, torneos.update);
club.delete('/torneos/:torneoId',             requireClubAdmin, loadTorneo, torneos.remove);
club.put ('/torneos/:torneoId/estado',        loadTorneo, torneos.cambiarEstado);
// WhatsApp propio del torneo (QR Baileys) → mensajes a los inscriptos
club.use ('/torneos/:torneoId/whatsapp',      loadTorneo, cargarEntidad('torneo', req => req.torneo.id), rutasTelefono());
club.post('/torneos/:torneoId/imagen',        loadTorneo, upload.single('imagen'), torneos.subirImagen);

// Canchas y horarios
club.get ('/torneos/:torneoId/canchas',       loadTorneo, torneos.getCanchas);
club.put ('/torneos/:torneoId/canchas',       loadTorneo, torneos.setCanchas);
club.get ('/torneos/:torneoId/slots',         loadTorneo, torneos.getSlots);

// Inscripciones y pagos
club.get ('/torneos/:torneoId/parejas',                 loadTorneo, inscr.list);
club.post('/torneos/:torneoId/parejas',                 loadTorneo, inscr.create);
club.put ('/torneos/:torneoId/parejas/:parejaId',       loadTorneo, inscr.update);
club.put ('/torneos/:torneoId/parejas/:parejaId/pago',  loadTorneo, inscr.setPago);

// Fixture
club.post('/torneos/:torneoId/zonas/preview',           loadTorneo, torneos.previewZonas);   // siembra en serpiente, sin guardar
club.post('/torneos/:torneoId/zonas/generar',           loadTorneo, torneos.generarZonas);
club.get ('/torneos/:torneoId/zonas/historial',         loadTorneo, torneos.historialZonas);
club.post('/torneos/:torneoId/llave/generar',           loadTorneo, torneos.generarLlave);
club.put ('/torneos/:torneoId/categorias/:categoriaId/llave-inicio', loadTorneo, torneos.inicioLlave);   // día y hora de inicio de la llave
club.put ('/torneos/:torneoId/categorias/:categoriaId/llave-prevista/:clave', loadTorneo, puede('tournament.match.reschedule'), torneos.programarPrevista);   // fijar horario en la llave de referencia
club.get ('/torneos/:torneoId/fixture',                 loadTorneo, torneos.fixture);
club.get ('/torneos/:torneoId/ranking',                 loadTorneo, torneos.ranking);
// Puntaje manual en las posiciones (solo administrador del club; queda en torneo_puntajes_historial)
club.put ('/torneos/:torneoId/jugadores/:jugadorId/puntaje', requireClubAdmin, loadTorneo, torneos.modificarPuntaje);
club.get ('/torneos/:torneoId/puntajes/historial',      requireClubAdmin, loadTorneo, torneos.historialPuntajes);
// Reprogramación auditada (permisos granulares; día / hora / cancha se validan en el servicio)
club.put  ('/torneos/:torneoId/partidos/:partidoId/programacion', loadTorneo, puede('tournament.match.reschedule'), torneos.reprogramar);
club.patch('/torneos/:torneoId/partidos/:partidoId/reschedule',   loadTorneo, puede('tournament.match.reschedule'), torneos.reprogramar);
club.get  ('/torneos/:torneoId/partidos/:partidoId/historial',    loadTorneo, torneos.historialPartido);

// Editar plantel de una inscripción (pareja)
const pl = '/torneos/:torneoId/parejas/:parejaId/jugadores';
club.get   (pl,                   loadTorneo, puede('tournament.team.edit_players'), plantel.listar);
club.get   (`${pl}/historial`,     loadTorneo, puede('tournament.team.edit_players'), plantel.historial);
club.post  (pl,                   loadTorneo, puede('tournament.team.edit_players', 'tournament.team.add_player'), plantel.agregar);
club.put   (`${pl}/:jugadorId`,   loadTorneo, puede('tournament.team.edit_players', 'tournament.team.update_player'), plantel.modificar);
club.delete(`${pl}/:jugadorId`,   loadTorneo, puede('tournament.team.edit_players', 'tournament.team.remove_player'), plantel.eliminar);

// Resultados
club.get   ('/torneos/:torneoId/partidos',                       loadTorneo, resultados.list);
club.put   ('/torneos/:torneoId/partidos/:partidoId/resultado',  loadTorneo, resultados.upsert);
club.delete('/torneos/:torneoId/partidos/:partidoId/resultado',  loadTorneo, resultados.remove);

// Comunicación
club.get ('/torneos/:torneoId/comunicacion/canal',             loadTorneo, comunicacion.canal);
club.post('/torneos/:torneoId/comunicacion/mensaje',           loadTorneo, comunicacion.difundir);
club.post('/torneos/:torneoId/comunicacion/proximos-partidos', loadTorneo, comunicacion.proximosPartidos);

module.exports = router;
