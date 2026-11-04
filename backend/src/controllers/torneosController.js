'use strict';
/**
 * controllers/torneosController.js
 * CRUD de torneos, imagen del evento, gestión de canchas/horarios y armado
 * del fixture (zonas + llave). Todo bajo /api/torneos/club/:complexId.
 */
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { Torneo, TorneoCancha, TorneoPareja, TorneoCategoria, TorneoLiga, Field, Profesor, sequelize } = require('../models');
const rk = require('../services/torneos/rankingService');
const { DEPORTES } = require('../models/Escuela');
const svc = require('../services/torneos/torneoService');
const fx  = require('../services/torneos/fixtureService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

const CAMPOS = ['nombre', 'deporte', 'descripcion', 'categoria', 'genero', 'fecha_inicio', 'fecha_fin', 'cupo_parejas', 'tipo', 'tercer_set',
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
  if (v.deporte != null && !DEPORTES.includes(v.deporte)) throw err('Deporte inválido.');
  if (!['masculino', 'femenino', 'mixto'].includes(v.genero)) throw err('Género inválido.');
  if (!v.fecha_inicio || !v.fecha_fin || v.fecha_fin < v.fecha_inicio) throw err('Fechas inválidas.');
  if (Number(v.cupo_parejas) < 2) throw err('El cupo mínimo es 2 parejas.');
  if (Number(v.precio_inscripcion) < 0) throw err('Precio inválido.');
  if (v.parejas_por_zona != null && !(v.parejas_por_zona >= 2 && v.parejas_por_zona <= 6)) throw err('Parejas por zona: 2 a 6.');
  if (v.clasifican_por_zona != null && !(v.clasifican_por_zona >= 1 && v.clasifican_por_zona <= 4)) throw err('Clasifican por zona: 1 a 4.');
  if (v.duracion_partido != null && !(v.duracion_partido >= 30 && v.duracion_partido <= 180)) throw err('Duración de partido: 30 a 180 min.');
  if (v.tipo != null && !['unico', 'anual'].includes(v.tipo)) throw err('Tipo de torneo inválido (único o anual).');
  if (v.tercer_set != null && !['set', 'super_tiebreak'].includes(v.tercer_set)) throw err('Tercer set inválido.');
  return d;
}

/**
 * Liga + categorías del body. Compatibilidad: un cliente viejo que manda solo
 * `categoria` (número) se toma como categorias = [categoria].
 */
async function validarLigaYCategorias(clubId, body, actual = null) {
  const out = {};
  if (body.liga_id !== undefined || !actual) out.liga = await rk.ligaDelClub(clubId, body.liga_id, { activa: !actual || Number(body.liga_id) !== actual.liga_id });
  const lista = body.categorias ?? (body.categoria != null ? [body.categoria] : (actual ? undefined : []));
  if (lista !== undefined) out.categorias = await rk.validarCategorias(lista);
  return out;
}

/** Agrega categorías (con su estado) y liga a cada torneo de la respuesta. */
async function conCategorias(torneos) {
  const lista = Array.isArray(torneos) ? torneos : [torneos];
  const ids = lista.map(t => t.id);
  const [cats, ligas] = await Promise.all([
    TorneoCategoria.findAll({ where: { torneo_id: ids }, order: [['categoria_id', 'DESC']], raw: true }),
    TorneoLiga.findAll({ where: { id: [...new Set(lista.map(t => t.liga_id))] }, attributes: ['id', 'nombre', 'estado'], raw: true }),
  ]);
  const out = lista.map(t => ({
    ...(t.toJSON ? t.toJSON() : t),
    liga: ligas.find(l => l.id === t.liga_id) || null,
    categorias: cats.filter(c => c.torneo_id === t.id).map(c => ({ categoria_id: c.categoria_id, nombre: rk.nombreCat(c.categoria_id), estado: c.estado, puntos_asignados: !!c.puntos_asignados })),
  }));
  return Array.isArray(torneos) ? out : out[0];
}

/** Reemplaza las categorías del torneo (solo si ninguna armó fixture; no se quita una con parejas). */
async function guardarCategorias(torneo, categorias, transaction) {
  const actuales = await TorneoCategoria.findAll({ where: { torneo_id: torneo.id }, transaction });
  const quitar = actuales.filter(c => !categorias.includes(c.categoria_id));
  const agregar = categorias.filter(n => !actuales.some(c => c.categoria_id === n));
  if (!quitar.length && !agregar.length) return;
  if (actuales.some(c => c.estado !== 'pendiente') && quitar.length) throw Object.assign(new Error('No se pueden quitar categorías con el fixture armado.'), { status: 409 });
  for (const c of quitar) {
    const n = await TorneoPareja.count({ where: { torneo_id: torneo.id, categoria_id: c.categoria_id }, transaction });
    if (n) throw Object.assign(new Error(`La categoría ${rk.nombreCat(c.categoria_id)} tiene ${n} pareja(s) inscripta(s): no se puede quitar.`), { status: 409 });
    await c.destroy({ transaction });
  }
  if (agregar.length) await TorneoCategoria.bulkCreate(agregar.map(n => ({ torneo_id: torneo.id, categoria_id: n, estado: 'pendiente' })), { transaction });
  // categoria = principal (compatibilidad: mensajes, listados viejos)
  await torneo.update({ categoria: Math.max(...categorias) }, { transaction });
}

/** ¿El club tiene canchas activas del deporte? (sin deporte: de cualquiera) */
async function clubTieneDeporte(clubId, deporte = null) {
  return (await Field.count({ where: { complex_id: clubId, activa: true, ...(deporte ? { deporte } : {}) } })) > 0;
}

// ── CRUD ──────────────────────────────────────────────────────
async function list(req, res) {
  try {
    // Torneos exclusivos de pádel: el listado nunca muestra otros deportes
    const where = { id_tenant: req.clubId, deporte: 'padel' };
    const torneos = await Torneo.findAll({
      where,
      include: [{ model: Profesor, as: 'profesores', attributes: ['id', 'nombre', 'apellido'], through: { attributes: ['rol'] } }],
      order: [['fecha_inicio', 'DESC']],
    });
    const conteos = await TorneoPareja.findAll({
      where: { torneo_id: torneos.map(t => t.id) },
      attributes: ['torneo_id', 'estado_pago', [Torneo.sequelize.fn('COUNT', '*'), 'n']],
      group: ['torneo_id', 'estado_pago'], raw: true,
    });
    const enriquecidos = await conCategorias(torneos);
    res.json({
      habilitado: await clubTieneDeporte(req.clubId, 'padel'),
      torneos: enriquecidos.map(t => ({
        ...t,
        inscriptas: conteos.filter(c => c.torneo_id === t.id && ['pendiente', 'pagado'].includes(c.estado_pago)).reduce((a, c) => a + Number(c.n), 0),
        pagadas: conteos.filter(c => c.torneo_id === t.id && c.estado_pago === 'pagado').reduce((a, c) => a + Number(c.n), 0),
      })),
    });
  } catch (err) { send(res, err); }
}

async function get(req, res) {
  try { res.json(await conCategorias(req.torneo)); } catch (err) { send(res, err); }
}

async function create(req, res) {
  try {
    // Deporte fijo en pádel y canchas de pádel validadas por requireTorneoPadel
    const data = { ...validarTorneo(req.body), deporte: 'padel' };
    const { liga, categorias } = await validarLigaYCategorias(req.clubId, req.body);
    const torneo = await sequelize.transaction(async (t) => {
      const nuevo = await Torneo.create({ ...data, categoria: Math.max(...categorias), liga_id: liga.id, id_tenant: req.clubId, estado: 'borrador' }, { transaction: t });
      await guardarCategorias(nuevo, categorias, t);
      return nuevo;
    });
    console.log(`[torneos] torneo ${torneo.id} creado · liga "${liga.nombre}" · categorías ${categorias.map(rk.nombreCat).join(', ')}`);
    res.status(201).json(await conCategorias(torneo));
  } catch (err) { send(res, err); }
}

async function update(req, res) {
  try {
    const t = req.torneo;
    const data = validarTorneo(req.body, t.toJSON());
    const { liga, categorias } = await validarLigaYCategorias(req.clubId, req.body, t);
    // La liga define el ranking: no se cambia una vez asignados puntos
    if (liga && liga.id !== t.liga_id && t.puntos_asignados) return res.status(409).json({ message: 'El torneo ya asignó puntos en su liga: no se puede cambiar de liga.' });
    // Con fixture armado no se tocan los parámetros que lo determinan
    if (!['borrador', 'inscripcion'].includes(t.estado)) {
      if (liga && liga.id !== t.liga_id) return res.status(409).json({ message: 'No se puede cambiar la liga con el fixture armado.' });
      for (const k of ['deporte', 'genero', 'fecha_inicio', 'fecha_fin', 'parejas_por_zona', 'clasifican_por_zona', 'duracion_partido', 'tipo', 'tercer_set']) {
        if (data[k] !== undefined && String(data[k]) !== String(t[k])) {
          return res.status(409).json({ message: `No se puede cambiar "${k}" con el fixture armado.` });
        }
      }
    }
    if (data.deporte && data.deporte !== t.deporte) {
      // (que haya canchas del nuevo deporte lo valida requireDeporteDisponible)
      if (await TorneoCancha.count({ where: { torneo_id: t.id } })) return res.status(409).json({ message: 'Quitá las canchas asignadas antes de cambiar el deporte.' });
    }
    delete data.categoria;   // se deriva de las categorías del torneo
    await sequelize.transaction(async (tx) => {
      await t.update({ ...data, ...(liga && { liga_id: liga.id }) }, { transaction: tx });
      if (categorias) await guardarCategorias(t, categorias, tx);
    });
    res.json(await conCategorias(t));
  } catch (err) { send(res, err); }
}

async function remove(req, res) {
  try {
    const t = req.torneo;
    const pagadas = await TorneoPareja.count({ where: { torneo_id: t.id, estado_pago: 'pagado' } });
    if (pagadas > 0) return res.status(409).json({ message: 'Hay inscripciones pagadas: cancelá el torneo y reembolsá en lugar de eliminarlo.' });
    await svc.eliminarTorneo(t);
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
        where: { complex_id: req.clubId, deporte: req.torneo.deporte || 'padel' },
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
    const deporte = t.deporte || 'padel';
    const validas = await Field.count({ where: { id: ids, complex_id: req.clubId, deporte } });
    if (validas !== ids.length) return res.status(400).json({ message: `Alguna cancha no es de ${deporte} o no pertenece al club.` });

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
      categoria_id: req.body?.categoria_id,
      incluirPendientes: Boolean(req.body?.incluir_pendientes),
      notificar: req.body?.notificar !== false,
    });
    res.json(r);
  } catch (err) { send(res, err); }
}

async function generarLlave(req, res) {
  try {
    const r = await svc.generarLlave(req.torneo, { categoria_id: req.body?.categoria_id, forzar: Boolean(req.body?.forzar), notificar: req.body?.notificar !== false });
    res.json(r);
  } catch (err) { send(res, err); }
}

async function fixture(req, res) {
  try {
    res.json({ torneo: await conCategorias(req.torneo), ...(await svc.fixture(req.torneo, { publico: false, categoria_id: req.query.categoria_id })) });
  } catch (err) { send(res, err); }
}

async function ranking(req, res) {
  try { res.json(await svc.rankingJugadores(req.torneo, req.query.categoria_id)); } catch (err) { send(res, err); }
}

/** Quién modifica (para la auditoría). */
const autor = (req) => (req.user ? { id: req.user.id, nombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.email } : {});

/** PUT /torneos/:torneoId/jugadores/:jugadorId/puntaje  { puntaje: number|null, motivo? } — solo admin del club. */
async function modificarPuntaje(req, res) {
  try {
    if (req.body?.puntaje === undefined) return res.status(400).json({ message: 'Indicá el puntaje nuevo.' });
    res.json(await svc.modificarPuntaje(req.torneo, req.params.jugadorId, req.body, autor(req)));
  } catch (err) { send(res, err); }
}

/** GET /torneos/:torneoId/puntajes/historial?jugador_id= */
async function historialPuntajes(req, res) {
  try { res.json(await svc.historialPuntajes(req.torneo, { jugadorId: req.query.jugador_id })); } catch (err) { send(res, err); }
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
  conCategorias, modificarPuntaje, historialPuntajes,
  list, get, create, update, remove, cambiarEstado, subirImagen,
  getCanchas, setCanchas, getSlots,
  generarZonas, generarLlave, fixture, ranking, reprogramar,
};
