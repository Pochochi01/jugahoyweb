'use strict';
/**
 * controllers/torneoInscripcionesController.js
 * Inscripciones (parejas) desde el panel del organizador y desde la web pública.
 */
const { Op } = require('sequelize');
const { Torneo, TorneoPareja, TorneoJugador, TorneoTicket, TorneoZona, TorneoCategoria } = require('../models');
const inscr = require('../services/torneos/inscripcionesService');
const svc = require('../services/torneos/torneoService');
const fx  = require('../services/torneos/fixtureService');
const mp  = require('./torneoPagosController');

// Además del mensaje, se devuelven los detalles (conflictos de duplicados, datos faltantes, bloqueo)
const send = (res, err) => res.status(err.status || 500).json({
  message: err.message,
  ...(err.conflictos && { conflictos: err.conflictos }), ...(err.faltantes && { faltantes: err.faltantes }),
  ...(err.inconsistencias && { inconsistencias: err.inconsistencias }), ...(err.codigo && { codigo: err.codigo }),
});
const autor = (req) => (req.user
  ? { id: req.user.id, nombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.email }
  : { id: null, nombre: req.organizador ? `Organizador ${req.organizador.nombre || req.organizador.usuario || req.organizador.id}` : null });
const tcDe = (torneo, pareja) => TorneoCategoria.findOne({ where: { torneo_id: torneo.id, categoria_id: pareja.categoria_id || torneo.categoria } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Panel ─────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const where = { torneo_id: req.torneo.id };
    if (req.query.estado_pago) where.estado_pago = req.query.estado_pago;
    if (req.query.categoria_id) where.categoria_id = Number(req.query.categoria_id);
    const parejas = await TorneoPareja.findAll({
      where,
      include: [
        { model: TorneoJugador, as: 'jugadores', include: [{ model: TorneoTicket, as: 'ticket', attributes: ['codigo_qr', 'usado_at'] }] },
        { model: TorneoZona, as: 'zona', attributes: ['id', 'nombre'] },
      ],
      order: [['createdAt', 'ASC']],
    });
    const activas = parejas.filter(p => ['pendiente', 'pagado'].includes(p.estado_pago)).length;
    // Anual: puntos de ranking EN VIVO (suma de ambos jugadores) → así quedarán los cabezas de serie
    // (puntos de la combinación liga + categoría de CADA pareja; nunca se mezclan categorías)
    if (req.torneo.tipo === 'anual') {
      const porCat = new Map();
      for (const p of parejas) {
        const cat = p.categoria_id || req.torneo.categoria;
        if (!porCat.has(cat)) porCat.set(cat, await svc.puntosRanking(req.torneo, cat));
        p.setDataValue('puntos_ranking', p.jugadores.reduce((a, j) => a + (porCat.get(cat).get(j.dni) || 0), 0));
      }
    }
    res.json({
      tipo: req.torneo.tipo,
      cupo: req.torneo.cupo_parejas, ocupados: activas, libres: Math.max(0, req.torneo.cupo_parejas - activas),
      recaudado: parejas.filter(p => p.estado_pago === 'pagado').reduce((a, p) => a + Number(p.monto || 0), 0),
      parejas,
    });
  } catch (err) { send(res, err); }
}

/** Alta manual por el organizador (puede cargar fuera del período de inscripción). */
async function create(req, res) {
  try {
    const pareja = await svc.inscribirPareja(req.torneo, req.body, { porOrganizador: true, metodoPago: req.body.metodo_pago, usuario: autor(req), userId: req.user?.id });
    if (req.body.pagado && pareja.estado_pago !== 'pagado') {
      await svc.confirmarPago(pareja.id, { metodo_pago: req.body.metodo_pago || 'efectivo' });
      await svc.emitirTickets(req.torneo, await TorneoPareja.findByPk(pareja.id, { include: [{ model: TorneoJugador, as: 'jugadores' }] }));
    }
    const out = await TorneoPareja.findByPk(pareja.id, { include: [{ model: TorneoJugador, as: 'jugadores' }] });
    out.setDataValue('autocompletados', pareja.get('autocompletados') || []);
    res.status(201).json(out);
  } catch (err) { send(res, err); }
}

/** Edita datos de jugadores y/o horarios preferidos. */
async function update(req, res) {
  try {
    const pareja = await TorneoPareja.findOne({
      where: { id: req.params.parejaId, torneo_id: req.torneo.id },
      include: [{ model: TorneoJugador, as: 'jugadores' }],
    });
    if (!pareja) return res.status(404).json({ message: 'Inscripción no encontrada' });
    // Inscripciones cerradas: no se cambian integrantes (nombre) ni categoría; sí contacto y horarios
    const cerradas = (await tcDe(req.torneo, pareja))?.inscripciones_cerradas;
    const foto = (js) => js.map(j => ({ id: j.id, nombre: j.nombre, whatsapp: j.whatsapp, email: j.email, categoria: j.categoria }));
    const antes = foto(pareja.jugadores);
    for (const j of req.body.jugadores || []) {
      const actual = pareja.jugadores.find(x => x.id === Number(j.id));
      if (!actual) continue;
      if (cerradas && ((j.nombre && String(j.nombre).trim() !== actual.nombre) || (j.categoria && Number(j.categoria) !== actual.categoria))) {
        return res.status(409).json({ message: inscr.MSG_CERRADAS, codigo: 'INSCRIPCIONES_CERRADAS' });
      }
      const email = j.email !== undefined ? inscr.emailLimpio(j.email) : inscr.emailLimpio(actual.email);
      if (email && !EMAIL_RE.test(email)) return res.status(400).json({ message: 'Email inválido.' });
      const whatsapp = j.whatsapp ? inscr.soloDigitos(j.whatsapp) : actual.whatsapp;
      const cambia = email !== inscr.emailLimpio(actual.email) || whatsapp !== actual.whatsapp;
      if (cambia) await inscr.verificarDuplicados(req.torneo, [{ email: email !== inscr.emailLimpio(actual.email) ? email : null, whatsapp: whatsapp !== actual.whatsapp ? whatsapp : null }], { excluirJugadorIds: [actual.id] });
    }
    if (req.body.horarios_preferidos) {
      await pareja.update({
        horarios_preferidos: fx.validarFranjas(req.body.horarios_preferidos, {
          fechaInicio: req.torneo.fecha_inicio, fechaFin: req.torneo.fecha_fin, requerida: true,
        }),
      });
    }
    for (const j of req.body.jugadores || []) {
      const actual = pareja.jugadores.find(x => x.id === Number(j.id));
      if (!actual) continue;
      const patch = {};
      if (j.nombre) patch.nombre = String(j.nombre).trim();
      if (j.whatsapp) patch.whatsapp = String(j.whatsapp).replace(/\D/g, '');
      if (j.email !== undefined) patch.email = inscr.emailLimpio(j.email);
      if (j.categoria) {
        const c = parseInt(j.categoria, 10);
        if (!(c >= (pareja.categoria_id || req.torneo.categoria) && c <= 8)) return res.status(400).json({ message: 'Categoría inválida para la categoría en la que juega la pareja.' });
        patch.categoria = c;
      }
      await actual.update(patch);
    }
    await pareja.reload();
    await inscr.auditar(req.torneo, {
      categoria_id: pareja.categoria_id, pareja_id: pareja.id, accion: 'inscripcion_modificada',
      detalle: { antes, despues: foto(pareja.jugadores), horarios: Boolean(req.body.horarios_preferidos) }, usuario: autor(req),
    });
    res.json(pareja);
  } catch (err) { send(res, err); }
}

/**
 * Cambia el estado de pago a mano: pagado (efectivo/transferencia), cancelado,
 * reembolsado (si se pagó por MP, ejecuta el reembolso en MercadoPago).
 */
async function setPago(req, res) {
  try {
    const { estado_pago, metodo_pago } = req.body || {};
    if (!['pendiente', 'pagado', 'cancelado', 'reembolsado'].includes(estado_pago)) {
      return res.status(400).json({ message: 'estado_pago inválido' });
    }
    const pareja = await TorneoPareja.findOne({
      where: { id: req.params.parejaId, torneo_id: req.torneo.id },
      include: [{ model: TorneoJugador, as: 'jugadores' }],
    });
    if (!pareja) return res.status(404).json({ message: 'Inscripción no encontrada' });
    if (['cancelado', 'reembolsado'].includes(estado_pago) && pareja.zona_id && req.torneo.estado !== 'cancelado') {
      return res.status(409).json({ message: 'La pareja ya está en el fixture: no se puede dar de baja.' });
    }
    if (estado_pago === 'pendiente' && pareja.estado_pago !== 'pendiente') {
      return res.status(409).json({ message: 'No se puede volver a "pendiente".' });
    }
    if (['pendiente', 'pagado'].includes(estado_pago) && !['pendiente', 'pagado'].includes(pareja.estado_pago)) {
      // Reactivar ocupa cupo de nuevo
      const activas = await TorneoPareja.count({ where: { torneo_id: req.torneo.id, estado_pago: { [Op.in]: ['pendiente', 'pagado'] } } });
      if (activas >= req.torneo.cupo_parejas) return res.status(409).json({ message: 'No quedan cupos.' });
    }

    if (estado_pago === 'reembolsado' && pareja.mp_payment_id) {
      await mp.reembolsarMp(req.torneo.id_tenant, pareja.mp_payment_id);
    }
    if (estado_pago === 'pagado') {
      await svc.confirmarPago(pareja.id, { metodo_pago: metodo_pago || 'efectivo' });
      await svc.emitirTickets(req.torneo, pareja);
    } else {
      await pareja.update({ estado_pago });
    }
    if (['cancelado', 'reembolsado'].includes(estado_pago)) {
      await inscr.auditar(req.torneo, { categoria_id: pareja.categoria_id, pareja_id: pareja.id, accion: 'inscripcion_eliminada', detalle: { estado_pago, jugadores: pareja.jugadores.map(j => ({ nombre: j.nombre, dni: j.dni })) }, usuario: autor(req) });
    }
    res.json(await pareja.reload());
  } catch (err) { send(res, err); }
}

/** Valida un ticket QR en la entrada (lo marca como usado). */
async function validarTicket(req, res) {
  try {
    const ticket = await TorneoTicket.findOne({
      where: { codigo_qr: String(req.body?.codigo || '').trim() },
      include: [{ model: Torneo, as: 'torneo', where: { id_tenant: req.clubId } }, { model: TorneoJugador, as: 'jugador' }],
    });
    if (!ticket) return res.status(404).json({ message: 'Ticket inválido para este club.' });
    const yaUsado = ticket.usado_at;
    if (!yaUsado) await ticket.update({ usado_at: new Date() });
    res.json({ ok: true, ya_usado: Boolean(yaUsado), usado_at: ticket.usado_at, jugador: ticket.jugador.nombre, torneo: ticket.torneo.nombre });
  } catch (err) { send(res, err); }
}

// ── Público ───────────────────────────────────────────────────
async function inscribirPublico(req, res) {
  try {
    const torneo = await Torneo.findByPk(req.params.torneoId);
    if (!torneo) return res.status(404).json({ message: 'Torneo no encontrado' });
    const pareja = await svc.inscribirPareja(torneo, req.body, { userId: req.user?.id });
    res.status(201).json({
      pareja_id: pareja.id,
      estado_pago: pareja.estado_pago,
      monto: Number(torneo.precio_inscripcion),
      requiere_pago: pareja.estado_pago !== 'pagado',
    });
  } catch (err) { send(res, err); }
}

// ── Inscripciones inteligentes ────────────────────────────────
/** GET /torneos/:torneoId/jugadores/buscar?q= — sugerencias (registro del club + usuarios). Solo panel. */
async function buscarJugadores(req, res) {
  try { res.json(await inscr.buscarJugadores(req.torneo.id_tenant, req.query.q, { torneo: req.torneo })); } catch (err) { send(res, err); }
}

/** GET /torneos/:torneoId/inscripciones/estado — abiertas / cerradas por categoría y si el usuario puede reabrir. */
async function estadoInscripciones(req, res) {
  try {
    const cats = await TorneoCategoria.findAll({ where: { torneo_id: req.torneo.id }, order: [['categoria_id', 'DESC']] });
    res.json({
      puede_reabrir: inscr.puedeReabrir(req),
      cerradas: cats.length > 0 && cats.every(c => c.inscripciones_cerradas),
      categorias: cats.map(c => ({ categoria_id: c.categoria_id, estado: c.estado, inscripciones_cerradas: Boolean(c.inscripciones_cerradas) })),
    });
  } catch (err) { send(res, err); }
}

/** POST /torneos/:torneoId/inscripciones/reabrir { categoria_id?, motivo } — solo admin general, del club u organizador. */
async function reabrirInscripciones(req, res) {
  try {
    if (!inscr.puedeReabrir(req)) return res.status(403).json({ message: 'Solo el Administrador General o el administrador del torneo pueden reabrir las inscripciones.' });
    res.json(await inscr.reabrir(req.torneo, req.body?.categoria_id, { motivo: req.body?.motivo, usuario: autor(req) }));
  } catch (err) { send(res, err); }
}

/** GET /torneos/:torneoId/inscripciones/auditoria */
async function auditoria(req, res) {
  try { res.json(await inscr.historial(req.torneo, { categoria_id: req.query.categoria_id })); } catch (err) { send(res, err); }
}

module.exports = { list, create, update, setPago, validarTicket, inscribirPublico, buscarJugadores, estadoInscripciones, reabrirInscripciones, auditoria };
