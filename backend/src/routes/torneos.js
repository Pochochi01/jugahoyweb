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
const { authTorneoStaff, requireClubAdmin, loadTorneo, optionalUser } = require('../middlewares/torneoAuth');
const { requireCanchas } = require('../middlewares/canchas');
const { rutasTelefono } = require('../controllers/entityPhoneController');
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
router.use('/club/:complexId', authTorneoStaff, requireCanchas, club);

club.get('/organizador/me', orgs.me);

// Organizadores (solo admins del club)
club.get   ('/organizadores',     requireClubAdmin, orgs.list);
club.post  ('/organizadores',     requireClubAdmin, orgs.create);
club.put   ('/organizadores/:id', requireClubAdmin, orgs.update);
club.delete('/organizadores/:id', requireClubAdmin, orgs.remove);

// Ranking anual (base de los cabezas de serie en torneos 'anual')
club.get   ('/ranking',     ranking.list);
club.put   ('/ranking',     ranking.upsert);
club.delete('/ranking/:id', ranking.remove);

// Tickets: validación en la entrada
club.post('/tickets/validar', inscr.validarTicket);

// Torneos
club.get ('/torneos',                         torneos.list);
club.post('/torneos',                         torneos.create);
club.get ('/torneos/:torneoId',               loadTorneo, torneos.get);
club.put ('/torneos/:torneoId',               loadTorneo, torneos.update);
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
club.post('/torneos/:torneoId/zonas/generar',           loadTorneo, torneos.generarZonas);
club.post('/torneos/:torneoId/llave/generar',           loadTorneo, torneos.generarLlave);
club.get ('/torneos/:torneoId/fixture',                 loadTorneo, torneos.fixture);
club.get ('/torneos/:torneoId/ranking',                 loadTorneo, torneos.ranking);
club.put ('/torneos/:torneoId/partidos/:partidoId/programacion', loadTorneo, torneos.reprogramar);

// Resultados
club.get   ('/torneos/:torneoId/partidos',                       loadTorneo, resultados.list);
club.put   ('/torneos/:torneoId/partidos/:partidoId/resultado',  loadTorneo, resultados.upsert);
club.delete('/torneos/:torneoId/partidos/:partidoId/resultado',  loadTorneo, resultados.remove);

// Comunicación
club.get ('/torneos/:torneoId/comunicacion/canal',             loadTorneo, comunicacion.canal);
club.post('/torneos/:torneoId/comunicacion/mensaje',           loadTorneo, comunicacion.difundir);
club.post('/torneos/:torneoId/comunicacion/proximos-partidos', loadTorneo, comunicacion.proximosPartidos);

module.exports = router;
