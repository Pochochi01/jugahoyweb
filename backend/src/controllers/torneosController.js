'use strict';
/**
 * controllers/torneosController.js
 * CRUD de torneos, imagen del evento, gestión de canchas/horarios y armado
 * del fixture (zonas + llave). Todo bajo /api/torneos/club/:complexId.
 */
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { Torneo, TorneoCancha, TorneoPareja, Field } = require('../models');
const svc = require('../services/torneos/torneoService');
const fx  = require('../services/torneos/fixtureService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

const CAMPOS = ['nombre', 'descripcion', 'categoria', 'genero', 'fecha_inicio', 'fecha_fin', 'cupo_parejas',
  'precio_inscripcion', 'parejas_por_zona', 'clasifican_por_zona', 'duracion_partido', 'descanso_minimo'];

// Transiciones de estado que el organizador puede pedir a mano
// (zonas / llaves se alcanzan generando el fixture).
const TRANSICIONES = {
  borrador:    ['inscripcion', 'cancelado'],
  inscripcion: ['borrador', 'cancelado'],
  zonas:       ['cancelado'],
  llaves:      ['cancelado'],
  finalizado:  [],
  cancelado:   ['borrador'],
};

function validarTorneo(body, actual = {}) {
  const d = {};
  for (const k of CAMPOS) if (body[k] !== undefined) d[k] = body[k];
  const v = { ...actual, ...d };
  const err = (m) => Object.assign(new Error(m), { status: 400 });
  if (!v.nombre || String(v.nombre).trim().length < 3) throw err('Nombre requerido.');
  if (!(Number(v.categoria) >= 1 && Number(v.categoria) <= 8)) throw err('Categoría inválida (1ª a 8ª).');
  if (!['masculino', 'femenino', 'mixto'].includes(v.genero)) throw err('Género inválido.');
  if (!v.fecha_inicio || !v.fecha_fin || v.fecha_fin < v.fecha_inicio) throw err('Fechas inválidas.');
  if (Number(v.cupo_parejas) < 2) throw err('El cupo mínimo es 2 parejas.');
  if (Number(v.precio_inscripcion) < 0) throw err('Precio inválido.');
  if (v.parejas_por_zona != null && !(v.parejas_por_zona >= 2 && v.parejas_por_zona <= 6)) throw err('Parejas por zona: 2 a 6.');
  if (v.clasifican_por_zona != null && !(v.clasifican_por_zona >= 1 && v.clasifican_por_zona <= 4)) throw err('Clasifican por zona: 1 a 4.');
  if (v.duracion_partido != null && !(v.duracion_partido >= 30 && v.duracion_partido <= 180)) throw err('Duración de partido: 30 a 180 min.');
  return d;
}

async function clubTienePadel(clubId) {
  return (await Field.count({ where: { complex_id: clubId, deporte: 'padel', activa: true } })) > 0;
}

// ── CRUD ──────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const torneos = await Torneo.findAll({ where: { id_tenant: req.clubId }, order: [['fecha_inicio', 'DESC']] });
    const conteos = await TorneoPareja.findAll({
      where: { torneo_id: torneos.map(t => t.id) },
      attributes: ['torneo_id', 'estado_pago', [Torneo.sequelize.fn('COUNT', '*'), 'n']],
      group: ['torneo_id', 'estado_pago'], raw: true,
    });
    res.json({
      habilitado: await clubTienePadel(req.clubId),
      torneos: torneos.map(t => ({
        ...t.toJSON(),
        inscriptas: conteos.filter(c => c.torneo_id === t.id && ['pendiente', 'pagado'].includes(c.estado_pago)).reduce((a, c) => a + Number(c.n), 0),
        pagadas: conteos.filter(c => c.torneo_id === t.id && c.estado_pago === 'pagado').reduce((a, c) => a + Number(c.n), 0),
      })),
    });
  } catch (err) { send(res, err); }
}

async function get(req, res) {
  res.json(req.torneo);
}

async function create(req, res) {
  try {
    if (!(await clubTienePadel(req.clubId))) {
      return res.status(400).json({ message: 'El club no tiene canchas de pádel activas: no puede organizar torneos.' });
    }
    const data = validarTorneo(req.body);
    const torneo = await Torneo.create({ ...data, id_tenant: req.clubId, estado: 'borrador' });
    res.status(201).json(torneo);
  } catch (err) { send(res, err); }
}

async function update(req, res) {
  try {
    const t = req.torneo;
    const data = validarTorneo(req.body, t.toJSON());
    // Con fixture armado no se tocan los parámetros que lo determinan
    if (!['borrador', 'inscripcion'].includes(t.estado)) {
      for (const k of ['categoria', 'genero', 'fecha_inicio', 'fecha_fin', 'parejas_por_zona', 'clasifican_por_zona', 'duracion_partido']) {
        if (data[k] !== undefined && String(data[k]) !== String(t[k])) {
          return res.status(409).json({ message: `No se puede cambiar "${k}" con el fixture armado.` });
        }
      }
    }
    await t.update(data);
    res.json(t);
  } catch (err) { send(res, err); }
}

async function remove(req, res) {
  try {
    const t = req.torneo;
    const pagadas = await TorneoPareja.count({ where: { torneo_id: t.id, estado_pago: 'pagado' } });
    if (pagadas > 0) return res.status(409).json({ message: 'Hay inscripciones pagadas: cancelá el torneo y reembolsá en lugar de eliminarlo.' });
    await t.destroy();
    res.json({ ok: true });
  } catch (err) { send(res, err); }
}

async function cambiarEstado(req, res) {
  try {
    const t = req.torneo;
    const { estado } = req.body;
    if (!(TRANSICIONES[t.estado] || []).includes(estado)) {
      return res.status(409).json({ message: `No se puede pasar de "${t.estado}" a "${estado}".` });
    }
    if (estado === 'inscripcion') {
      const canchas = await TorneoCancha.count({ where: { torneo_id: t.id } });
      if (!canchas) return res.status(400).json({ message: 'Asigná canchas y horarios antes de abrir la inscripción.' });
    }
    // Cancelar libera las canchas en la agenda; salir de 'cancelado' las vuelve a bloquear
    await svc.conTransaccion(async (tx) => {
      const eraCancelado = t.estado === 'cancelado';
      await t.update({ estado }, { transaction: tx });
      if (estado === 'cancelado' || eraCancelado) await svc.sincronizarAgenda(t, tx);
    });
    res.json(t);
  } catch (err) { send(res, err); }
}

// ── Imagen del evento (se imprime en los tickets QR) ──────────
async function subirImagen(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'Adjuntá una imagen (campo "imagen").' });
    const t = req.torneo;
    const anterior = t.imagen_evento;
    await t.update({ imagen_evento: `/uploads/torneos/${req.file.filename}` });
    if (anterior?.startsWith('/uploads/torneos/')) {
      fs.unlink(path.join(__dirname, '..', '..', anterior), () => {});
    }
    res.json(t);
  } catch (err) { send(res, err); }
}

// ── Canchas y horarios ────────────────────────────────────────
async function getCanchas(req, res) {
  try {
    const [disponibles, asignadas] = await Promise.all([
      Field.findAll({
        where: { complex_id: req.clubId, deporte: 'padel' },
        attributes: ['id', 'nombre', 'identificador', 'activa', 'hora_apertura', 'hora_cierre', 'techada'],
        order: [['nombre', 'ASC']],
      }),
      TorneoCancha.findAll({ where: { torneo_id: req.torneo.id } }),
    ]);
    const slots = asignadas.length ? await svc.slotsDisponibles(req.torneo) : [];
    res.json({
      canchas_complejo: disponibles.length,
      canchas: disponibles,
      asignadas,
      slots_disponibles: slots.length,
    });
  } catch (err) { send(res, err); }
}

/**
 * PUT canchas cedidas (reemplaza el set completo).
 * body: { canchas: [{ field_id, disponibilidad_horaria: [{fecha|null, desde, hasta}] }] }
 */
async function setCanchas(req, res) {
  try {
    const t = req.torneo;
    if (['llaves', 'finalizado', 'cancelado'].includes(t.estado)) {
      return res.status(409).json({ message: 'No se pueden modificar las canchas en este estado.' });
    }
    const lista = Array.isArray(req.body?.canchas) ? req.body.canchas : [];
    const ids = lista.map(c => Number(c.field_id));
    if (new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Hay canchas repetidas.' });
    const validas = await Field.count({ where: { id: ids, complex_id: req.clubId, deporte: 'padel' } });
    if (validas !== ids.length) return res.status(400).json({ message: 'Alguna cancha no es de pádel o no pertenece al club.' });

    const filas = lista.map(c => ({
      torneo_id: t.id,
      field_id: Number(c.field_id),
      disponibilidad_horaria: fx.validarFranjas(c.disponibilidad_horaria, {
        fechaInicio: t.fecha_inicio, fechaFin: t.fecha_fin, requerida: true,
      }),
    }));

    await Torneo.sequelize.transaction(async (tx) => {
      await TorneoCancha.destroy({ where: { torneo_id: t.id, field_id: { [Op.notIn]: ids.length ? ids : [0] } }, transaction: tx });
      for (const f of filas) {
        const [row, creado] = await TorneoCancha.findOrCreate({ where: { torneo_id: t.id, field_id: f.field_id }, defaults: f, transaction: tx });
        if (!creado) await row.update({ disponibilidad_horaria: f.disponibilidad_horaria }, { transaction: tx });
      }
    });
    req.torneo = t;
    return getCanchas(req, res);
  } catch (err) { send(res, err); }
}

/** GET slots libres (para reprogramar a mano). */
async function getSlots(req, res) {
  try {
    const slots = await svc.slotsDisponibles(req.torneo);
    const fields = await Field.findAll({ where: { id: [...new Set(slots.map(s => s.field_id))] }, attributes: ['id', 'nombre', 'identificador'] });
    const nombre = new Map(fields.map(f => [f.id, svc.canchaLabel(f)]));
    res.json(slots.map(({ field_id, fecha, hora }) => ({ field_id, fecha, hora, cancha: nombre.get(field_id) })));
  } catch (err) { send(res, err); }
}

// ── Fixture ───────────────────────────────────────────────────
async function generarZonas(req, res) {
  try {
    const r = await svc.generarZonas(req.torneo, {
      incluirPendientes: Boolean(req.body?.incluir_pendientes),
      notificar: req.body?.notificar !== false,
    });
    res.json(r);
  } catch (err) { send(res, err); }
}

async function generarLlave(req, res) {
  try {
    const r = await svc.generarLlave(req.torneo, { forzar: Boolean(req.body?.forzar), notificar: req.body?.notificar !== false });
    res.json(r);
  } catch (err) { send(res, err); }
}

async function fixture(req, res) {
  try {
    res.json({ torneo: req.torneo, ...(await svc.fixture(req.torneo, { publico: false })) });
  } catch (err) { send(res, err); }
}

async function ranking(req, res) {
  try { res.json(await svc.rankingJugadores(req.torneo)); } catch (err) { send(res, err); }
}

async function reprogramar(req, res) {
  try {
    const { field_id, fecha, hora, notificar } = req.body || {};
    if (!field_id || !fecha || !hora) return res.status(400).json({ message: 'field_id, fecha y hora son requeridos.' });
    const p = await svc.reprogramarPartido(req.torneo, req.params.partidoId, { field_id: Number(field_id), fecha, hora }, { notificar: notificar !== false });
    res.json(p);
  } catch (err) { send(res, err); }
}

module.exports = {
  list, get, create, update, remove, cambiarEstado, subirImagen,
  getCanchas, setCanchas, getSlots,
  generarZonas, generarLlave, fixture, ranking, reprogramar,
};
