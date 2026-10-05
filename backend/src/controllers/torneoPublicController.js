'use strict';
/**
 * controllers/torneoPublicController.js
 * Endpoints sin login: listado de torneos del club, detalle, fixture, posiciones,
 * consulta de "mi pareja" por DNI y ticket QR. Nunca expone DNI ni WhatsApp.
 */
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const {
  Torneo, TorneoPareja, TorneoJugador, TorneoTicket, TorneoPartido, TorneoCancha, Complex,
} = require('../models');
const svc = require('../services/torneos/torneoService');
const notifier = require('../services/torneos/torneoNotifier');
const { frontendUrl } = require('../config/urls');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });
const VISIBLE = { [Op.notIn]: ['borrador'] };

async function torneoVisible(id) {
  const t = await Torneo.findOne({
    where: { id, estado: VISIBLE, deporte: 'padel' },
    include: [{ model: Complex, as: 'club', attributes: ['id', 'nombre', 'ciudad', 'direccion'] }],
  });
  if (!t) throw svc.httpError(404, 'Torneo no encontrado');
  return t;
}

/** GET /public/club/:complexId — torneos del club (y de todos si no se indica). */
async function listar(req, res) {
  try {
    const where = { estado: VISIBLE, deporte: 'padel' };   // torneos exclusivos de pádel
    if (req.params.complexId) where.id_tenant = Number(req.params.complexId);
    const torneos = await Torneo.findAll({
      where,
      include: [{ model: Complex, as: 'club', attributes: ['id', 'nombre', 'ciudad'] }],
      order: [['fecha_inicio', 'ASC']],
    });
    res.json(torneos);
  } catch (err) { send(res, err); }
}

async function detalle(req, res) {
  try {
    const t = await torneoVisible(req.params.torneoId);
    const ocupados = await TorneoPareja.count({ where: { torneo_id: t.id, estado_pago: ['pendiente', 'pagado'] } });
    const canchas = await TorneoCancha.findAll({ where: { torneo_id: t.id }, attributes: ['field_id', 'disponibilidad_horaria'] });
    // Franjas en las que se juega: sirven de guía para los horarios preferidos
    res.json({ ...t.toJSON(), cupos_libres: Math.max(0, t.cupo_parejas - ocupados), franjas_juego: canchas.flatMap(c => c.disponibilidad_horaria) });
  } catch (err) { send(res, err); }
}

async function fixture(req, res) {
  try {
    const t = await torneoVisible(req.params.torneoId);
    res.json({ torneo: t, ...(await svc.fixture(t, { publico: true })) });
  } catch (err) { send(res, err); }
}

async function ranking(req, res) {
  try {
    const t = await torneoVisible(req.params.torneoId);
    res.json(await svc.rankingJugadores(t));
  } catch (err) { send(res, err); }
}

/**
 * GET /public/:torneoId/mi-pareja?dni=&pareja= — el jugador consulta su
 * inscripción (estado de pago) y sus partidos. Requiere DNI de un integrante.
 */
async function miPareja(req, res) {
  try {
    const t = await torneoVisible(req.params.torneoId);
    const dni = String(req.query.dni || '').replace(/\D/g, '');
    if (!dni) return res.status(400).json({ message: 'Ingresá tu DNI.' });
    const jugador = await TorneoJugador.findOne({
      where: { dni },
      include: [{ model: TorneoPareja, as: 'pareja', where: { torneo_id: t.id }, include: [{ model: TorneoJugador, as: 'jugadores' }] }],
      order: [['id', 'DESC']],
    });
    if (!jugador) return res.status(404).json({ message: 'No encontramos una inscripción con ese DNI en este torneo.' });
    const pareja = jugador.pareja;
    const partidos = await TorneoPartido.findAll({
      where: { torneo_id: t.id, es_bye: false, [Op.or]: [{ pareja1_id: pareja.id }, { pareja2_id: pareja.id }] },
      include: svc.incluirPartido(true),
      order: [['fecha', 'ASC'], ['hora', 'ASC']],
    });
    const ticket = await TorneoTicket.findOne({ where: { jugador_id: jugador.id }, attributes: ['codigo_qr'] });
    res.json({
      pareja: {
        id: pareja.id, nombre: notifier.nombrePareja(pareja), estado_pago: pareja.estado_pago,
        horarios_preferidos: pareja.horarios_preferidos,
      },
      ticket_url: ticket ? frontendUrl(`/torneos/ticket/${ticket.codigo_qr}`) : null,
      ticket_codigo: ticket?.codigo_qr || null,
      partidos: partidos.map(p => ({
        id: p.id, ronda: p.ronda, zona: p.zona?.nombre, fecha: p.fecha, hora: p.hora, cancha: svc.canchaLabel(p.field),
        estado: p.estado, rival: notifier.nombrePareja(p.pareja1_id === pareja.id ? p.pareja2 : p.pareja1),
        resultado: p.resultado ? { sets: p.resultado.sets, gano: p.resultado.ganador_id === pareja.id, local: p.pareja1_id === pareja.id } : null,
      })),
    });
  } catch (err) { send(res, err); }
}

/** GET /public/tickets/:codigo — datos del ticket + QR (data URL) + imagen del evento. */
async function ticket(req, res) {
  try {
    const tk = await TorneoTicket.findOne({
      where: { codigo_qr: req.params.codigo },
      include: [
        { model: TorneoJugador, as: 'jugador', attributes: ['id', 'nombre', 'categoria', 'pareja_id'],
          include: [{ model: TorneoPareja, as: 'pareja', include: [{ model: TorneoJugador, as: 'jugadores', attributes: ['id', 'nombre'] }] }] },
        { model: Torneo, as: 'torneo', include: [{ model: Complex, as: 'club', attributes: ['nombre', 'ciudad', 'direccion'] }] },
      ],
    });
    if (!tk) return res.status(404).json({ message: 'Ticket no encontrado' });
    const url = frontendUrl(`/torneos/ticket/${tk.codigo_qr}`);
    res.json({
      codigo: tk.codigo_qr,
      qr: await QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: 'H' }),
      imagen_evento: tk.imagen_evento || tk.torneo.imagen_evento,
      jugador: tk.jugador.nombre,
      pareja: notifier.nombrePareja(tk.jugador.pareja),
      estado_pago: tk.jugador.pareja.estado_pago,
      usado_at: tk.usado_at,
      torneo: {
        id: tk.torneo.id, nombre: tk.torneo.nombre, categoria: tk.torneo.categoria, genero: tk.torneo.genero,
        fecha_inicio: tk.torneo.fecha_inicio, fecha_fin: tk.torneo.fecha_fin, club: tk.torneo.club,
      },
    });
  } catch (err) { send(res, err); }
}

module.exports = { listar, detalle, fixture, ranking, miPareja, ticket };
