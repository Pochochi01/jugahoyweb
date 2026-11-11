'use strict';
/**
 * services/torneos/torneoService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Casos de uso del torneo con acceso a BD. Los controllers son finos y delegan acá.
 *
 *   inscribirPareja()      validaciones de cupo / categoría / género + alta
 *   confirmarPago()        pareja → 'pagado', genera tickets QR y avisa
 *   generarZonas()         zonas por sorteo (único) o ranking en serpentina (anual) + cruces
 *   generarLlave()         cruces eliminatorios con byes a partir de las zonas
 *   registrarResultado()   valida sets/tie-breaks, avanza ganador (y perdedor en zonas de 4),
 *                          recalcula la tabla persistida y dispara los avisos
 *   reprogramarPartido()   cambio manual de cancha / horario con control de choques
 *   fixture()              vista completa (zonas, tablas, llave) para las pantallas
 *
 * MULTI-CATEGORÍA: un torneo juega 1..N categorías (torneo_categorias). Cada categoría
 * arma su propio cuadro (zonas → llave → final) con su estado y sus puntos; las canchas
 * del torneo se comparten (los partidos de una categoría bloquean los horarios de las
 * otras). El estado global del torneo se deriva de sus categorías (sincronizarEstado).
 * Los puntos anuales van a ranking_puntos por liga + categoría (services/torneos/rankingService).
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Torneo, TorneoCancha, TorneoZona, TorneoPareja, TorneoJugador,
  TorneoPartido, TorneoResultado, TorneoTicket, Field, Booking, TimeSlot,
  TorneoTablaPosicion, TorneoCategoria, TorneoPuntajeHistorial, TorneoZonaHistorial,
  TorneoReprogramacion, TorneoNotificacion, TorneoLlaveProgramacion,
} = require('../../models');
const rk = require('./rankingService');
const fx = require('./fixtureService');
const notifier = require('./torneoNotifier');
const brackets = require('../brackets/bracketService');
const { validarLlave } = brackets;
const { validateResult } = require('./resultValidation');
const fmt = require('./formatoPartido');
const { frontendUrl } = require('../../config/urls');

const PAREJAS_ACTIVAS = { [Op.in]: ['pendiente', 'pagado'] };
const JUGADORES_PUBLICOS = ['id', 'nombre', 'categoria', 'puntos_manual'];

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// ── Carga ─────────────────────────────────────────────────────
const incluirPareja = (as, publico) => ({
  model: TorneoPareja, as,
  include: [{ model: TorneoJugador, as: 'jugadores', ...(publico ? { attributes: JUGADORES_PUBLICOS } : {}) }],
});

function incluirPartido(publico = false) {
  return [
    incluirPareja('pareja1', publico),
    incluirPareja('pareja2', publico),
    { model: Field, as: 'field', attributes: ['id', 'nombre', 'identificador'] },
    { model: TorneoZona, as: 'zona', attributes: ['id', 'nombre'] },
    { model: TorneoResultado, as: 'resultado' },
  ];
}

async function cargarPartido(id, transaction) {
  return TorneoPartido.findByPk(id, { include: incluirPartido(false), transaction });
}

const canchaLabel = (field) => field ? `${field.nombre}${field.identificador ? ` (${field.identificador})` : ''}` : null;

// ── Categorías del torneo ─────────────────────────────────────
/** Categorías del torneo (8va → 1ra). */
function categoriasDe(torneo, transaction) {
  return TorneoCategoria.findAll({ where: { torneo_id: torneo.id }, order: [['categoria_id', 'DESC']], transaction });
}

/**
 * Categoría sobre la que se opera: la pedida (debe ser del torneo) o, si el torneo
 * tiene una sola, esa. Con varias categorías es obligatorio indicarla.
 */
async function resolverCategoria(torneo, categoriaId, transaction) {
  const cats = await categoriasDe(torneo, transaction);
  if (!cats.length) throw httpError(409, 'El torneo no tiene categorías asignadas.');
  if (categoriaId == null || categoriaId === '') {
    if (cats.length === 1) return cats[0];
    throw httpError(400, `Indicá la categoría: el torneo juega ${cats.map(c => rk.nombreCat(c.categoria_id)).join(', ')}.`);
  }
  const tc = cats.find(c => c.categoria_id === Number(categoriaId));
  if (!tc) throw httpError(400, `El torneo no juega la categoría ${rk.nombreCat(Number(categoriaId))}.`);
  return tc;
}

/** Estado global del torneo según sus categorías (no toca borrador/inscripción/cancelado salvo al empezar). */
async function sincronizarEstado(torneo, transaction) {
  if (torneo.estado === 'cancelado') return;
  const estados = (await categoriasDe(torneo, transaction)).map(c => c.estado);
  let estado = torneo.estado;
  if (estados.length && estados.every(e => e === 'finalizado')) estado = 'finalizado';
  else if (estados.includes('zonas')) estado = 'zonas';
  else if (estados.includes('llaves')) estado = 'llaves';
  else if (['zonas', 'llaves', 'finalizado'].includes(torneo.estado)) estado = 'inscripcion';
  if (estado !== torneo.estado) await torneo.update({ estado }, { transaction });
}

// ── Inscripción ───────────────────────────────────────────────
const GENERO_OK = {
  masculino: (g) => g.every(x => x === 'masculino'),
  femenino:  (g) => g.every(x => x === 'femenino'),
  mixto:     (g) => g.includes('masculino') && g.includes('femenino'),
};

/**
 * Inscribe una pareja.
 * @param {Torneo} torneo
 * @param {{jugadores: Array, horarios_preferidos: Array}} data
 * @param {{userId?:number, porOrganizador?:boolean, metodoPago?:string}} opts
 */
async function inscribirPareja(torneo, data, opts = {}) {
  if (torneo.estado !== 'inscripcion' && !opts.porOrganizador) {
    throw httpError(409, 'La inscripción de este torneo no está abierta.');
  }
  if (['finalizado', 'cancelado'].includes(torneo.estado)) throw httpError(409, 'El torneo ya no admite inscripciones.');

  const jugadores = Array.isArray(data.jugadores) ? data.jugadores : [];
  if (jugadores.length !== 2) throw httpError(400, 'Una pareja son exactamente 2 jugadores.');
  // Categoría del torneo en la que juega la pareja (obligatoria si el torneo tiene varias)
  const tc = await resolverCategoria(torneo, data.categoria_id);
  if (tc.estado !== 'pendiente' && !opts.porOrganizador) throw httpError(409, `La categoría ${rk.nombreCat(tc.categoria_id)} ya armó su fixture.`);
  const catTorneo = tc.categoria_id;

  const limpios = jugadores.map((j, i) => {
    const nombre = String(j.nombre || '').trim();
    const dni = String(j.dni || '').replace(/\D/g, '');
    const whatsapp = String(j.whatsapp || '').replace(/\D/g, '');
    const categoria = parseInt(j.categoria, 10);
    if (nombre.length < 3) throw httpError(400, `Jugador ${i + 1}: nombre y apellido requeridos.`);
    if (!/^\d{7,9}$/.test(dni)) throw httpError(400, `Jugador ${i + 1}: DNI inválido.`);
    if (!/^\d{10,15}$/.test(whatsapp)) throw httpError(400, `Jugador ${i + 1}: WhatsApp inválido (con código de país, ej. 549381...).`);
    if (!(categoria >= 1 && categoria <= 8)) throw httpError(400, `Jugador ${i + 1}: categoría inválida (1ª a 8ª).`);
    if (!['masculino', 'femenino'].includes(j.genero)) throw httpError(400, `Jugador ${i + 1}: género inválido.`);
    // Se puede jugar la categoría propia o una superior (número menor), nunca una inferior
    if (categoria < catTorneo) {
      throw httpError(400, `${nombre} es de ${categoria}ª y no puede jugar la categoría ${catTorneo}ª.`);
    }
    return { nombre, dni, whatsapp, categoria, genero: j.genero, email: j.email?.trim() || null };
  });
  if (limpios[0].dni === limpios[1].dni) throw httpError(400, 'Los dos jugadores no pueden tener el mismo DNI.');
  if (!GENERO_OK[torneo.genero](limpios.map(j => j.genero))) {
    throw httpError(400, torneo.genero === 'mixto'
      ? 'En un torneo mixto la pareja debe ser un hombre y una mujer.'
      : `Este torneo es ${torneo.genero}.`);
  }

  const horarios = fx.validarFranjas(data.horarios_preferidos, {
    fechaInicio: torneo.fecha_inicio, fechaFin: torneo.fecha_fin, requerida: true,
  });

  const gratis = Number(torneo.precio_inscripcion) <= 0;

  const pareja = await sequelize.transaction(async (t) => {
    // Lock del torneo → serializa inscripciones concurrentes (control de cupo)
    await Torneo.findByPk(torneo.id, { lock: t.LOCK.UPDATE, transaction: t });
    const ocupados = await TorneoPareja.count({ where: { torneo_id: torneo.id, estado_pago: PAREJAS_ACTIVAS }, transaction: t });
    if (ocupados >= torneo.cupo_parejas) throw httpError(409, 'No quedan cupos disponibles.');

    const repetido = await TorneoJugador.findOne({
      where: { dni: limpios.map(j => j.dni) },
      include: [{ model: TorneoPareja, as: 'pareja', where: { torneo_id: torneo.id, estado_pago: PAREJAS_ACTIVAS } }],
      transaction: t,
    });
    if (repetido) throw httpError(409, `El DNI ${repetido.dni} ya está inscripto en este torneo.`);

    const p = await TorneoPareja.create({
      torneo_id: torneo.id,
      categoria_id: catTorneo,
      horarios_preferidos: horarios,
      estado_pago: gratis ? 'pagado' : 'pendiente',
      metodo_pago: gratis ? 'sin_cargo' : (opts.metodoPago || null),
      monto: torneo.precio_inscripcion,
      user_id: opts.userId || null,
    }, { transaction: t });
    // Registro único del jugador en el club (base del ranking por liga)
    const registros = [];
    for (const j of limpios) registros.push(await rk.upsertJugador(torneo.id_tenant, j, t));
    await TorneoJugador.bulkCreate(limpios.map((j, i) => ({ ...j, pareja_id: p.id, jugador_id: registros[i].id })), { transaction: t });
    return p;
  });

  const completa = await TorneoPareja.findByPk(pareja.id, { include: [{ model: TorneoJugador, as: 'jugadores' }] });
  notifier.aPareja(torneo.id_tenant, completa, notifier.mensajes.inscripcion(torneo, completa));
  if (gratis) await emitirTickets(torneo, completa);
  return completa;
}

// ── Pagos + tickets ───────────────────────────────────────────
/** Crea (idempotente) los tickets QR de la pareja y los envía por WhatsApp. */
async function emitirTickets(torneo, pareja) {
  const QRCode = require('qrcode');
  for (const j of pareja.jugadores) {
    const [ticket, creado] = await TorneoTicket.findOrCreate({
      where: { jugador_id: j.id },
      defaults: {
        jugador_id: j.id, torneo_id: torneo.id,
        codigo_qr: crypto.randomBytes(16).toString('hex'),
        imagen_evento: torneo.imagen_evento,     // snapshot de la imagen al emitir
      },
    });
    if (!creado) continue;
    const url = frontendUrl(`/torneos/ticket/${ticket.codigo_qr}`);
    const png = await QRCode.toBuffer(url, { width: 480, margin: 1 });
    notifier.enviar(torneo.id_tenant, j.whatsapp, notifier.mensajes.pagoConfirmado(torneo, pareja, j, url), { imagen: png, torneoId: torneo.id });
  }
}

/**
 * Marca la pareja como pagada (idempotente) → tickets + aviso.
 * @param {object} extra  { metodo_pago, mp_payment_id, monto }
 */
async function confirmarPago(parejaId, extra = {}, transaction) {
  const pareja = await TorneoPareja.findByPk(parejaId, {
    include: [{ model: TorneoJugador, as: 'jugadores' }, { model: Torneo, as: 'torneo' }],
    transaction,
  });
  if (!pareja) throw httpError(404, 'Inscripción no encontrada');
  if (pareja.estado_pago !== 'pagado') {
    await pareja.update({ estado_pago: 'pagado', ...extra }, { transaction });
  }
  return pareja;
}

// ── Canchas / slots ───────────────────────────────────────────
async function slotsDisponibles(torneo) {
  const canchas = await TorneoCancha.findAll({ where: { torneo_id: torneo.id } });
  if (canchas.length === 0) throw httpError(400, 'Asigná canchas y horarios al torneo antes de armar el fixture.');
  const fieldIds = canchas.map(c => c.field_id);

  // Turnos ocupados de la agenda (reservas, clases de profesores, otros torneos).
  // Los del PROPIO torneo se ignoran: se reescriben al (re)programar.
  const propios = (await TorneoPartido.findAll({ where: { torneo_id: torneo.id }, attributes: ['id'], raw: true })).map(p => p.id);
  const turnos = await TimeSlot.findAll({
    where: {
      field_id: fieldIds,
      fecha: { [Op.between]: [torneo.fecha_inicio, torneo.fecha_fin] },
      estado: 'ocupado',
      ...(propios.length ? { [Op.or]: [{ torneo_partido_id: null }, { torneo_partido_id: { [Op.notIn]: propios } }] } : {}),
    },
    attributes: ['field_id', 'fecha', 'hora'],
    raw: true,
  });
  // Reservas (compatibilidad con reservas sin time_slots)
  const reservas = await Booking.findAll({
    where: {
      field_id: fieldIds,
      fecha: { [Op.between]: [torneo.fecha_inicio, torneo.fecha_fin] },
      estado: { [Op.notIn]: ['cancelado', 'rechazado'] },
    },
    attributes: ['field_id', 'fecha', 'hora_inicio', 'hora_fin'],
    raw: true,
  });
  // Partidos de OTROS torneos del club en las mismas canchas
  const otros = await TorneoPartido.findAll({
    where: { torneo_id: { [Op.ne]: torneo.id }, field_id: fieldIds, fecha: { [Op.between]: [torneo.fecha_inicio, torneo.fecha_fin] } },
    include: [{ model: Torneo, as: 'torneo', attributes: ['duracion_partido'] }],
  });
  const ocupados = [
    ...reservas,
    ...turnos.map(s => ({ field_id: s.field_id, fecha: s.fecha, hora_inicio: s.hora, hora_fin: fx.toHHMM(fx.toMin(s.hora) + 60) })),
    ...otros.map(p => ({
      field_id: p.field_id, fecha: p.fecha, hora_inicio: p.hora,
      hora_fin: fx.toHHMM(fx.toMin(p.hora) + p.torneo.duracion_partido),
    })),
  ];
  return fx.generarSlots(canchas, torneo, ocupados);
}

/**
 * Sincroniza la agenda general (time_slots) con la programación del torneo:
 * borra los turnos del torneo y escribe uno 'ocupado' por cada hora que toca
 * cada partido programado, para que los jugadores no puedan reservar encima.
 *
 * Se reescribe el torneo COMPLETO (no partido por partido) porque la agenda es
 * horaria: dos partidos de 90 min seguidos (09:00 y 10:30) comparten la hora
 * 10:00 y una fila solo puede apuntar a un partido.
 *
 * @throws 409 si alguna hora ya la tomó una reserva / clase / otro torneo
 */
async function sincronizarAgenda(torneo, transaction) {
  const partidos = await TorneoPartido.findAll({ where: { torneo_id: torneo.id }, transaction });
  const ids = partidos.map(p => p.id);
  if (ids.length) await TimeSlot.destroy({ where: { torneo_partido_id: ids }, transaction });
  if (torneo.estado === 'cancelado') return;

  const escritas = new Set();
  const campos = await Field.findAll({ where: { id: [...new Set(partidos.map(p => p.field_id).filter(Boolean))] }, attributes: ['id', 'nombre', 'identificador'], transaction });
  for (const p of partidos) {
    if (!p.field_id || !p.fecha || !p.hora || p.es_bye) continue;
    const ini = fx.toMin(p.hora), fin = ini + torneo.duracion_partido;
    for (let m = Math.floor(ini / 60) * 60; m < fin && m < 1440; m += 60) {
      const hora = fx.toHHMM(m);
      const k = `${p.field_id}|${p.fecha}|${hora}`;
      if (escritas.has(k)) continue;
      escritas.add(k);
      const fila = await TimeSlot.findOne({ where: { field_id: p.field_id, fecha: p.fecha, hora }, lock: transaction.LOCK.UPDATE, transaction });
      if (fila?.estado === 'ocupado') {
        throw httpError(409, `${canchaLabel(campos.find(f => f.id === p.field_id))} el ${p.fecha} a las ${hora} ya está reservada: reprogramá ese partido o volvé a armar el fixture.`);
      }
      if (fila) await fila.update({ estado: 'ocupado', booking_id: null, horario_profesor_id: null, torneo_partido_id: p.id }, { transaction });
      else await TimeSlot.create({ field_id: p.field_id, fecha: p.fecha, hora, estado: 'ocupado', torneo_partido_id: p.id }, { transaction });
    }
  }
}

/**
 * Borra partidos (y sus resultados / turnos de agenda) sin depender del
 * ON DELETE CASCADE: primero corta los vínculos entre partidos.
 */
async function borrarPartidos(where, transaction) {
  const ids = (await TorneoPartido.findAll({ where, attributes: ['id'], transaction })).map(p => p.id);
  if (!ids.length) return;
  await TimeSlot.destroy({ where: { torneo_partido_id: ids }, transaction });
  await TorneoResultado.destroy({ where: { partido_id: ids }, transaction });
  // Cualquier partido (de este lote o no) que apunte a los que se borran
  await TorneoPartido.update({ siguiente_partido_id: null }, { where: { siguiente_partido_id: ids }, transaction });
  await TorneoPartido.update({ perdedor_partido_id: null }, { where: { perdedor_partido_id: ids }, transaction });
  await TorneoPartido.destroy({ where: { id: ids }, transaction });
}

/**
 * Elimina un torneo y todo lo que cuelga de él.
 * Se borra en orden desde la aplicación: dejar todo al ON DELETE CASCADE de MySQL
 * supera el límite de 30 tablas por cascada (partidos se autorreferencian por
 * siguiente/perdedor y cuelgan resultados, tabla, time_slots…).
 */
async function eliminarTorneo(torneo) {
  await sequelize.transaction(async (transaction) => {
    const o = { transaction };
    const parejas = (await TorneoPareja.findAll({ where: { torneo_id: torneo.id }, attributes: ['id'], ...o })).map(p => p.id);
    await borrarPartidos({ torneo_id: torneo.id }, transaction);
    await TorneoTablaPosicion.destroy({ where: { torneo_id: torneo.id }, ...o });
    await TorneoTicket.destroy({ where: { torneo_id: torneo.id }, ...o });
    if (parejas.length) await TorneoJugador.destroy({ where: { pareja_id: parejas }, ...o });
    await TorneoPareja.destroy({ where: { torneo_id: torneo.id }, ...o });
    await TorneoZona.destroy({ where: { torneo_id: torneo.id }, ...o });
    await TorneoCancha.destroy({ where: { torneo_id: torneo.id }, ...o });
    await TorneoCategoria.destroy({ where: { torneo_id: torneo.id }, ...o });
    await Torneo.destroy({ where: { id: torneo.id }, ...o });
  });
}

/** Ejecuta fn en una transacción y traduce el choque del índice único de time_slots. */
async function conTransaccion(fn) {
  try { return await sequelize.transaction(fn); } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') throw httpError(409, 'Una cancha se reservó mientras se programaba el torneo: intentá de nuevo.');
    throw err;
  }
}

/** Agenda y slots ya usados por los partidos programados de este torneo. */
async function estadoAgenda(torneo, slots, whereExtra = {}) {
  const dias = fx.diasEntre(torneo.fecha_inicio, torneo.fecha_fin);
  const partidos = await TorneoPartido.findAll({ where: { torneo_id: torneo.id, fecha: { [Op.ne]: null }, ...whereExtra } });
  const agenda = new Map();
  const usados = new Set();
  let maxAbs = 0;
  for (const p of partidos) {
    const abs = dias.indexOf(p.fecha) * 1440 + fx.toMin(p.hora);
    usados.add(`${p.field_id}|${abs}`);
    maxAbs = Math.max(maxAbs, abs + torneo.duracion_partido);
    for (const pid of [p.pareja1_id, p.pareja2_id]) {
      if (!pid) continue;
      if (!agenda.has(pid)) agenda.set(pid, []);
      agenda.get(pid).push([abs, abs + torneo.duracion_partido]);
    }
  }
  return { agenda, usados, maxAbs, dias };
}

// ── Zonas ─────────────────────────────────────────────────────
/**
 * Arma zonas + partidos de zona y los programa.
 * Sólo entran las parejas PAGADAS (o también pendientes con incluirPendientes).
 */
/**
 * Prepara la siembra de una categoría (sin escribir nada): valida, junta las parejas con
 * sus puntos y criterios de desempate (consultas agregadas, sin N+1) y arma las zonas en
 * serpiente (fx.generateSnakeSeedingZones). La `firma` identifica el resultado: si entre
 * la vista previa y la confirmación cambian las parejas o sus puntos, cambia la firma.
 */
async function prepararSiembra(torneo, { categoria_id, incluirPendientes = false } = {}) {
  if (['finalizado', 'cancelado'].includes(torneo.estado)) throw httpError(409, `El torneo está ${torneo.estado}.`);
  const tc = await resolverCategoria(torneo, categoria_id);
  const cat = tc.categoria_id;
  if (!['pendiente', 'zonas'].includes(tc.estado)) {
    throw httpError(409, `Las zonas de ${rk.nombreCat(cat)} sólo se pueden (re)armar antes de la fase de llaves.`);
  }
  const jugados = await TorneoPartido.count({ where: { torneo_id: torneo.id, categoria_id: cat, estado: ['jugado', 'walkover'], es_bye: false } });
  if (jugados > 0) throw httpError(409, 'Ya hay resultados cargados: no se pueden rearmar las zonas.');

  const parejas = await TorneoPareja.findAll({
    where: { torneo_id: torneo.id, categoria_id: cat, estado_pago: incluirPendientes ? PAREJAS_ACTIVAS : 'pagado' },
    include: [{ model: TorneoJugador, as: 'jugadores' }],
    order: [['id', 'ASC']],
  });
  if (parejas.length < 2) throw httpError(409, `${rk.nombreCat(cat)}: se necesitan al menos 2 parejas ${incluirPendientes ? 'inscriptas' : 'pagadas'}.`);

  // Validaciones: parejas completas y sin jugadores repetidos entre parejas
  const incompletas = parejas.filter(p => p.jugadores.length !== 2 || p.jugadores.some(j => !j.dni || !String(j.nombre || '').trim()));
  if (incompletas.length) throw httpError(409, `Hay parejas con jugadores faltantes o sin datos: ${incompletas.map(p => notifier.nombrePareja(p) || `#${p.id}`).join(', ')}.`);
  const vistos = new Map();
  for (const p of parejas) for (const j of p.jugadores) {
    if (vistos.has(j.dni) && vistos.get(j.dni) !== p.id) throw httpError(409, `El DNI ${j.dni} (${j.nombre}) está inscripto en dos parejas: corregí las inscripciones.`);
    vistos.set(j.dni, p.id);
  }

  // Puntos (ranking de la liga + categoría + año, en todos los tipos de torneo) y desempates
  const puntosPorDni = await puntosRanking(torneo, cat);
  const combinacion = { liga_id: torneo.liga_id, categoria_id: cat, genero: torneo.genero, temporada: temporadaDe(torneo) };
  const stats = await require('./rankingAnualService').statsPorJugador(torneo.id_tenant, combinacion, parejas.flatMap(p => p.jugadores.map(j => j.jugador_id)).filter(Boolean));
  const suma = (p, f) => p.jugadores.reduce((acc, j) => acc + f(j), 0);
  const st = (j, k) => stats.get(j.jugador_id)?.[k] || 0;
  const conDatos = parejas.map(p => ({
    id: p.id,
    nombre: notifier.nombrePareja(p),
    horarios_preferidos: p.horarios_preferidos,
    puntos_totales: suma(p, j => puntosPorDni.get(j.dni) || 0),
    titulos: suma(p, j => st(j, 'titulos')),
    finales: suma(p, j => st(j, 'finales')),
    torneos_jugados: suma(p, j => st(j, 'torneos')),
    jugadores: p.jugadores.map(j => ({ nombre: j.nombre, puntos: puntosPorDni.get(j.dni) || 0 })),
    inscripcion: p.createdAt,
  }));
  const zonas = fx.generateSnakeSeedingZones(conDatos, { parejasPorZona: torneo.parejas_por_zona });
  const firma = crypto.createHash('sha1')
    .update(zonas.map(z => `${z.zona}:${z.parejas.map(p => `${p.id}/${p.puntos_totales}`).join(',')}`).join('|'))
    .digest('hex').slice(0, 16);
  return { tc, cat, parejas, zonas, firma };
}

/** Vista previa de las zonas (no guarda nada). */
async function previsualizarZonas(torneo, opts = {}) {
  const { cat, zonas, firma, parejas } = await prepararSiembra(torneo, opts);
  return {
    categoria_id: cat, metodo: 'ranking_anual_snake', firma,
    ranking: { liga_id: torneo.liga_id, categoria_id: cat, genero: torneo.genero, temporada: temporadaDe(torneo) }, cantidad_zonas: zonas.length, parejas: parejas.length,
    zonas: zonas.map(z => ({
      zona: z.zona,
      parejas: z.parejas.map(p => ({
        id: p.id, nombre: p.nombre, siembra: p.siembra, numero_zona: p.numero_zona, cabeza_serie: p.cabeza_serie,
        puntos_totales: p.puntos_totales, titulos: p.titulos, finales: p.finales, torneos_jugados: p.torneos_jugados, jugadores: p.jugadores,
      })),
    })),
  };
}

async function generarZonas(torneo, { categoria_id, incluirPendientes = false, notificar = true, firma, usuario } = {}) {
  const { tc, cat, parejas, zonas: siembra, firma: actual } = await prepararSiembra(torneo, { categoria_id, incluirPendientes });
  if (firma && firma !== actual) {
    throw httpError(409, 'Cambiaron las inscripciones o los puntos desde la vista previa: revisá la nueva distribución antes de confirmar.');
  }
  const grupos = siembra.map(z => z.parejas);
  const slots = await slotsDisponibles(torneo);
  const porId = new Map(parejas.map(p => [p.id, p]));
  // Horarios ya tomados por las OTRAS categorías del torneo (canchas compartidas)
  const deOtras = await estadoAgenda(torneo, slots, { categoria_id: { [Op.ne]: cat } });

  const sinProgramar = await conTransaccion(async (t) => {
    const zonasViejas = (await TorneoZona.findAll({ where: { torneo_id: torneo.id, categoria_id: cat }, attributes: ['id'], transaction: t })).map(z => z.id);
    await borrarPartidos({ torneo_id: torneo.id, categoria_id: cat }, t);
    if (zonasViejas.length) await TorneoTablaPosicion.destroy({ where: { zona_id: zonasViejas }, transaction: t });
    await TorneoPareja.update({ zona_id: null, numero_zona: null }, { where: { torneo_id: torneo.id, categoria_id: cat }, transaction: t });
    await TorneoZona.destroy({ where: { torneo_id: torneo.id, categoria_id: cat }, transaction: t });

    // Cruces por zona: 4 parejas → formato 1v3 / 2v4 / G1vP2 / G2vP1; resto → todos contra todos
    const cruces = [];
    for (const [i, grupo] of grupos.entries()) {
      const zona = await TorneoZona.create({ torneo_id: torneo.id, categoria_id: cat, nombre: fx.nombreZona(i) }, { transaction: t });
      for (const p of grupo) {
        await TorneoPareja.update({ zona_id: zona.id, numero_zona: p.numero_zona, puntos_totales: p.puntos_totales, siembra: p.siembra },
          { where: { id: p.id }, transaction: t });
      }
      const ids = grupo.map(p => p.id);   // ya vienen en orden de numero_zona
      const key = (n) => `${zona.id}-${n}`;
      if (ids.length === 4) {
        for (const c of fx.crucesZona4(ids)) {
          cruces.push({
            key: key(c.n), zona_id: zona.id, orden: c.n, pareja1_id: c.pareja1_id, pareja2_id: c.pareja2_id,
            ganador: c.ganador && { key: key(c.ganador.n), slot: c.ganador.slot },
            perdedor: c.perdedor && { key: key(c.perdedor.n), slot: c.perdedor.slot },
            despuesDe: c.despuesDe.map(key),
          });
        }
      } else {
        fx.roundRobin(ids).forEach(([a, b], k) =>
          cruces.push({ key: key(k + 1), zona_id: zona.id, orden: k + 1, pareja1_id: a, pareja2_id: b, despuesDe: [] }));
      }
    }

    // 1ª pasada: partidos con parejas definidas (los más restringidos primero);
    // 2ª pasada: G1vP2 / G2vP1, siempre después de sus dos partidos previos.
    const primeros = cruces.filter(c => !c.despuesDe.length);
    const asignacion1 = fx.programar(primeros, slots, porId, { descanso: torneo.descanso_minimo, usados: new Set(deOtras.usados) });
    const usados = new Set([...deOtras.usados, ...[...asignacion1.values()].filter(Boolean).map(a => `${a.field_id}|${a.abs}`)]);
    const agenda = new Map();
    for (const c of primeros) {
      const a = asignacion1.get(c.key);
      if (!a) continue;
      for (const pid of [c.pareja1_id, c.pareja2_id]) {
        if (!agenda.has(pid)) agenda.set(pid, []);
        agenda.get(pid).push([a.abs, a.abs + torneo.duracion_partido]);
      }
    }
    const asignacion = fx.programar(cruces.filter(c => c.despuesDe.length), slots, porId, {
      descanso: torneo.descanso_minimo, usados, agenda, previos: asignacion1,
    });

    // Se crean de atrás hacia adelante para conocer los ids de destino (ganador/perdedor)
    const idPorKey = new Map();
    let pendientes = 0;
    for (const c of [...cruces].sort((x, y) => y.despuesDe.length - x.despuesDe.length)) {
      const a = asignacion.get(c.key);
      if (!a) pendientes++;
      const creado = await TorneoPartido.create({
        torneo_id: torneo.id, categoria_id: cat, zona_id: c.zona_id, ronda: 'zona', orden: c.orden,
        pareja1_id: c.pareja1_id, pareja2_id: c.pareja2_id,
        siguiente_partido_id: c.ganador ? idPorKey.get(c.ganador.key) : null,
        siguiente_slot: c.ganador?.slot ?? null,
        perdedor_partido_id: c.perdedor ? idPorKey.get(c.perdedor.key) : null,
        perdedor_slot: c.perdedor?.slot ?? null,
        field_id: a?.field_id ?? null, fecha: a?.fecha ?? null, hora: a?.hora ?? null,
        fuera_preferencia: a?.fuera_preferencia ?? false,
        estado: a ? 'programado' : 'pendiente',
      }, { transaction: t });
      idPorKey.set(c.key, creado.id);
    }

    await tc.update({ estado: 'zonas' }, { transaction: t });
    await sincronizarEstado(torneo, t);
    const zonas = await TorneoZona.findAll({ where: { torneo_id: torneo.id, categoria_id: cat }, transaction: t });
    for (const z of zonas) await recalcularTablaZona(z.id, t);
    // Auditoría del armado (en la misma transacción)
    await TorneoZonaHistorial.create({
      torneo_id: torneo.id, categoria_id: cat, metodo: 'ranking_anual_snake', zonas: siembra.length, parejas: parejas.length,
      // Ranking usado y puntos de cada pareja (y de sus jugadores) al momento del armado
      reparto: {
        ranking: { liga_id: torneo.liga_id, categoria_id: cat, genero: torneo.genero, temporada: temporadaDe(torneo) },
        zonas: siembra.map(z => ({ zona: z.zona, parejas: z.parejas.map(p => ({ id: p.id, nombre: p.nombre, siembra: p.siembra, puntos: p.puntos_totales, jugadores: p.jugadores })) })),
      },
      usuario_id: usuario?.id || null, usuario: usuario?.nombre || null,
    }, { transaction: t });
    await sincronizarAgenda(torneo, t);
    return pendientes;
  });

  if (notificar) await notificarProximos(torneo, { parejaIds: parejas.map(p => p.id) });
  return {
    categoria_id: cat,
    tipo: torneo.tipo,
    zonas: grupos.length,
    parejas: parejas.length,
    sin_programar: sinProgramar,
    // Reparto final (para mostrar el sorteo / los cabezas de serie)
    metodo: 'ranking_anual_snake',
    reparto: siembra.map(z => ({ zona: z.zona, parejas: z.parejas.map(p => ({ id: p.id, nombre: p.nombre, numero: p.numero_zona, siembra: p.siembra, cabeza_serie: p.cabeza_serie, puntos: p.puntos_totales })) })),
  };
}

// ── Ranking anual ─────────────────────────────────────────────
const temporadaDe = (torneo) => Number(String(torneo.fecha_inicio).slice(0, 4));

/** Puntos de ranking por DNI para la liga + categoría + género + temporada del torneo. */
function puntosRanking(torneo, categoriaId = torneo.categoria) {
  return rk.puntosPorDni(torneo.id_tenant, { liga_id: torneo.liga_id, categoria_id: Number(categoriaId), genero: torneo.genero, temporada: temporadaDe(torneo) });
}

/**
 * Puntos que suma cada jugador según la instancia a la que llegó su pareja.
 * Se aplican una sola vez, al finalizar un torneo 'anual'.
 */
/**
 * Al finalizar una categoría de un torneo 'anual' se aplican sus puntos al ranking anual con la
 * configuración vigente de la temporada + categoría (rankingAnualService.applyTournamentPoints).
 * Idempotente: ranking_resultados es único por torneo + categoría + jugador.
 */
async function asignarPuntosAnuales(torneo, tc, transaction) {
  if (torneo.tipo !== 'anual' || tc.puntos_asignados) return;
  const r = await require('./rankingAnualService').applyTournamentPoints(torneo, tc, transaction);
  await tc.update({ puntos_asignados: true }, { transaction });
  const pendientes = await TorneoCategoria.count({ where: { torneo_id: torneo.id, puntos_asignados: false }, transaction });
  if (!pendientes) await torneo.update({ puntos_asignados: true }, { transaction });
  console.log(`[torneos] puntos anuales asignados · torneo ${torneo.id} · ${rk.nombreCat(tc.categoria_id)} · liga ${torneo.liga_id} · ${r.aplicados} jugador(es)${r.ya_procesado ? ' (ya procesado: sin cambios)' : ''}`);
}

// ── Tablas ────────────────────────────────────────────────────
/**
 * Recalcula y PERSISTE la tabla de posiciones de una zona (torneo_tabla_posiciones).
 * Se llama al armar zonas y cada vez que se carga, corrige o borra un resultado.
 */
async function recalcularTablaZona(zonaId, transaction) {
  const zona = await TorneoZona.findByPk(zonaId, {
    include: [
      { model: TorneoPareja, as: 'parejas', attributes: ['id'] },
      { model: TorneoPartido, as: 'partidos', include: [{ model: TorneoResultado, as: 'resultado' }] },
    ],
    transaction,
  });
  if (!zona) return;
  // Relámpago con zonas a 2 sets + súper TB: el súper TB cuenta como set pero sus puntos no son games
  const torneo = await Torneo.findByPk(zona.torneo_id, { attributes: ['formato', 'formato_partidos', 'tercer_set'], transaction });
  const regla = fmt.esRelampago(torneo) ? fmt.reglaPartido(torneo, 'zona') : null;
  const filas = fx.tablaZona(zona.parejas, zona.partidos, { superTb: regla ? fmt.indiceSuperTb(regla) : -1 });
  await TorneoTablaPosicion.destroy({ where: { zona_id: zonaId }, transaction });
  await TorneoTablaPosicion.bulkCreate(filas.map(r => ({
    torneo_id: zona.torneo_id, zona_id: zonaId, pareja_id: r.pareja_id, posicion: r.posicion,
    pj: r.pj, pg: r.pg, pp: r.pp, puntos: r.puntos,
    sets_favor: r.sf, sets_contra: r.sc, games_favor: r.gf, games_contra: r.gc,
    diferencia_sets: r.dif_sets, diferencia_games: r.dif_games,
  })), { transaction });
}

/** Tablas de todas las zonas (leídas de la tabla persistida). */
async function tablasDeZonas(torneo, publico = false, categoriaId = null) {
  const zonas = await TorneoZona.findAll({
    where: { torneo_id: torneo.id, ...(categoriaId && { categoria_id: Number(categoriaId) }) },
    include: [
      incluirPareja('parejas', publico),
      { model: TorneoPartido, as: 'partidos', attributes: ['id', 'estado'] },
      { model: TorneoTablaPosicion, as: 'tabla' },
    ],
    order: [['nombre', 'ASC'], [{ model: TorneoTablaPosicion, as: 'tabla' }, 'posicion', 'ASC']],
  });
  return zonas.map(z => {
    const parejaDe = (id) => z.parejas.find(p => p.id === id);
    const tabla = z.tabla.map(r => ({
      pareja_id: r.pareja_id, posicion: r.posicion, pj: r.pj, pg: r.pg, pp: r.pp, puntos: r.puntos,
      sf: r.sets_favor, sc: r.sets_contra, gf: r.games_favor, gc: r.games_contra,
      dif_sets: r.diferencia_sets, dif_games: r.diferencia_games,
      pareja: notifier.nombrePareja(parejaDe(r.pareja_id)),
      numero_zona: parejaDe(r.pareja_id)?.numero_zona ?? null,
      siembra: parejaDe(r.pareja_id)?.siembra ?? null,
      puntos_ranking: parejaDe(r.pareja_id)?.puntos_totales ?? 0,
    }));
    return { zona_id: z.id, categoria_id: z.categoria_id, nombre: z.nombre, tabla, completa: z.partidos.every(p => ['jugado', 'walkover'].includes(p.estado)) };
  });
}

/** Posiciones por jugador (cada jugador hereda los números de su pareja). */
/**
 * Posiciones por jugador. Parte de TODOS los inscriptos activos (pendientes y pagados),
 * tengan o no zona/partidos: el que no jugó aparece con 0 en todo (equivalente a un
 * LEFT JOIN con COALESCE(…, 0)). Si un administrador fijó un puntaje manual
 * (torneo_jugadores.puntos_manual) se usa ese; los PJ/PG/PP y diferencias son los reales.
 * Tres consultas en total (inscriptos, tablas de zona, partidos de llave): sin N+1.
 */
async function rankingJugadores(torneo, categoriaId = null) {
  const cat = categoriaId ? (await resolverCategoria(torneo, categoriaId)).categoria_id : null;
  const [zonas, parejas, llave] = await Promise.all([
    tablasDeZonas(torneo, true, cat),
    TorneoPareja.findAll({
      where: { torneo_id: torneo.id, estado_pago: PAREJAS_ACTIVAS, ...(cat && { categoria_id: cat }) },
      include: [{ model: TorneoJugador, as: 'jugadores', attributes: JUGADORES_PUBLICOS }, { model: TorneoZona, as: 'zona', attributes: ['nombre'] }],
      order: [['id', 'ASC']],
    }),
    // Partidos de llave jugados suman al ranking general
    TorneoPartido.findAll({
      where: { torneo_id: torneo.id, ronda: { [Op.ne]: 'zona' }, es_bye: false, estado: ['jugado', 'walkover'], ...(cat && { categoria_id: cat }) },
      include: [{ model: TorneoResultado, as: 'resultado' }],
    }),
  ]);
  const tablaDe = new Map(zonas.flatMap(z => z.tabla.map(r => [r.pareja_id, r])));
  const n = (v) => Number(v) || 0;   // COALESCE(v, 0)
  const filas = [];
  for (const p of parejas) {
    const r = tablaDe.get(p.id) || {};
    const extra = llave.filter(m => [m.pareja1_id, m.pareja2_id].includes(p.id));
    const pgLlave = extra.filter(m => m.resultado?.ganador_id === p.id).length;
    const calculados = n(r.puntos) + pgLlave * fx.PUNTOS_VICTORIA + (extra.length - pgLlave) * fx.PUNTOS_DERROTA;
    for (const j of p.jugadores) {
      const manual = j.puntos_manual !== null && j.puntos_manual !== undefined;
      filas.push({
        jugador_id: j.id, jugador: j.nombre, categoria: j.categoria, pareja: notifier.nombrePareja(p),
        zona: p.zona?.nombre || null, categoria_id: p.categoria_id,
        pj: n(r.pj) + extra.length, pg: n(r.pg) + pgLlave, pp: n(r.pp) + (extra.length - pgLlave),
        dif_sets: n(r.dif_sets), dif_games: n(r.dif_games),
        puntos_calculados: calculados, puntos: manual ? j.puntos_manual : calculados, manual,
      });
    }
  }
  filas.sort((a, b) => (b.puntos - a.puntos) || (b.dif_sets - a.dif_sets) || (b.dif_games - a.dif_games) || a.jugador.localeCompare(b.jugador, 'es'));
  // Empates de puntos y diferencias comparten posición (1, 2, 2, 4)
  filas.forEach((f, i) => {
    const prev = filas[i - 1];
    f.posicion = prev && prev.puntos === f.puntos && prev.dif_sets === f.dif_sets && prev.dif_games === f.dif_games ? prev.posicion : i + 1;
  });
  return filas;
}

/**
 * Modifica a mano el puntaje de un jugador en las posiciones del torneo (con auditoría).
 * puntaje: entero ≥ 0, o null para volver al cálculo automático por partidos.
 * @returns {{ jugador: object, ranking: object[] }} fila actualizada (con su posición) + ranking de su categoría
 */
async function modificarPuntaje(torneo, jugadorId, { puntaje, motivo } = {}, usuario = {}) {
  const automatico = puntaje === null;
  const valor = automatico ? null : Number(puntaje);
  if (!automatico && (puntaje === undefined || puntaje === '' || !Number.isInteger(valor))) throw httpError(400, 'El puntaje debe ser un número entero.');
  if (!automatico && valor < 0) throw httpError(400, 'El puntaje no puede ser negativo.');
  if (!automatico && valor > 100000) throw httpError(400, 'Puntaje fuera de rango.');
  const mot = motivo ? String(motivo).trim().slice(0, 255) : null;
  if (torneo.estado === 'cancelado') throw httpError(409, 'El torneo está cancelado.');

  const jugador = await TorneoJugador.findOne({
    where: { id: Number(jugadorId) },
    include: [{ model: TorneoPareja, as: 'pareja', attributes: ['id', 'torneo_id', 'categoria_id', 'estado_pago'], where: { torneo_id: torneo.id } }],
  });
  if (!jugador) throw httpError(404, 'El jugador no está inscripto en este torneo.');
  if (!['pendiente', 'pagado'].includes(jugador.pareja.estado_pago)) throw httpError(409, 'La inscripción del jugador está cancelada.');

  const cat = jugador.pareja.categoria_id || null;
  const antes = (await rankingJugadores(torneo, cat)).find(f => f.jugador_id === jugador.id);
  const anterior = antes?.puntos ?? 0;
  await sequelize.transaction(async (t) => {
    await jugador.update({ puntos_manual: valor }, { transaction: t });
    await TorneoPuntajeHistorial.create({
      torneo_id: torneo.id, jugador_id: jugador.id, puntaje_anterior: anterior,
      puntaje_nuevo: automatico ? (antes?.puntos_calculados ?? 0) : valor, automatico,
      motivo: mot, usuario_id: usuario.id || null, usuario: usuario.nombre || null,
    }, { transaction: t });
  });
  const ranking = await rankingJugadores(torneo, cat);
  const fila = ranking.find(f => f.jugador_id === jugador.id);
  console.log(`[torneos] puntaje manual · torneo ${torneo.id} · jugador ${jugador.id} (${jugador.nombre}): ${anterior} → ${fila.puntos}${automatico ? ' (automático)' : ''} · ${usuario.nombre || '?'}${mot ? ` · "${mot}"` : ''}`);
  return { jugador: fila, ranking };
}

/** Historial de modificaciones manuales de puntaje del torneo. */
function historialPuntajes(torneo, { jugadorId } = {}) {
  return TorneoPuntajeHistorial.findAll({
    where: { torneo_id: torneo.id, ...(jugadorId && { jugador_id: Number(jugadorId) }) },
    include: [{ model: TorneoJugador, as: 'jugador', attributes: ['id', 'nombre'] }],
    order: [['id', 'DESC']], limit: 300,
  });
}

// ── Llave ─────────────────────────────────────────────────────
/**
 * Borra la llave (fase final) de una categoría: elimina sus partidos y resultados de llave y la
 * categoría vuelve a "zonas" (las zonas, posiciones y resultados de zona NO se tocan).
 * Solo el Administrador General (lo controla la ruta). Si la categoría ya asignó puntos al
 * ranking anual se bloquea: borrar la llave dejaría el ranking inconsistente.
 */
async function borrarLlave(torneo, categoriaId, { usuario = {} } = {}) {
  const tc = await resolverCategoria(torneo, categoriaId);
  const cat = tc.categoria_id;
  if (!['llaves', 'finalizado'].includes(tc.estado)) throw httpError(409, `${rk.nombreCat(cat)} no tiene llave generada.`);
  if (tc.puntos_asignados) throw httpError(409, `${rk.nombreCat(cat)} ya asignó puntos al ranking anual: no se puede borrar la llave sin alterar el ranking.`);
  const where = { torneo_id: torneo.id, categoria_id: cat, ronda: { [Op.ne]: 'zona' } };
  const partidos = await TorneoPartido.count({ where });
  const jugados = await TorneoPartido.count({ where: { ...where, es_bye: false, estado: JUGADO } });
  await conTransaccion(async (t) => {
    await borrarPartidos(where, t);
    await tc.update({ estado: 'zonas' }, { transaction: t });
    await sincronizarEstado(torneo, t);
    await sincronizarAgenda(torneo, t);
  });
  console.log(`[torneos] llave borrada · torneo ${torneo.id} · ${rk.nombreCat(cat)} · ${partidos} partido(s), ${jugados} con resultado · por ${usuario.nombre || usuario.id || '—'}`);
  return { categoria_id: cat, partidos_borrados: partidos, resultados_borrados: jugados };
}

async function generarLlave(torneo, { categoria_id, forzar = false, notificar = true } = {}) {
  const tc = await resolverCategoria(torneo, categoria_id);
  const cat = tc.categoria_id;
  if (tc.estado !== 'zonas') throw httpError(409, `La llave de ${rk.nombreCat(cat)} se genera al terminar su fase de zonas.`);
  const zonas = await tablasDeZonas(torneo, false, cat);
  if (zonas.length === 0) throw httpError(409, 'Primero armá las zonas.');
  if (!forzar && zonas.some(z => !z.completa)) throw httpError(409, 'Faltan resultados de zona.');

  // Llave FIJA por zona y posición (la misma que se muestra como referencia antes de jugar)
  const cuadro = fx.armarLlavePorZonas(zonas.length, torneo.clasifican_por_zona,
    (pl) => zonas[pl.zona_idx]?.tabla.find(r => r.posicion === pl.posicion)?.pareja_id ?? null,
    { clubId: torneo.id_tenant, parejas: zonas.reduce((a, z) => a + z.tabla.length, 0) });
  const clasificados = cuadro.plazas.map(pl => zonas[pl.zona_idx]?.tabla.find(r => r.posicion === pl.posicion)?.pareja_id).filter(Boolean).map(id => ({ pareja_id: id }));
  // Validación antes de guardar: sin faltantes, sin duplicados, sin cruces de la misma zona en 1ª ronda
  const zonaDe = (id) => zonas.findIndex(z => z.tabla.some(r => r.pareja_id === id));
  // (el armado genérico puede no evitarlo, ej. 1 sola zona: se valida estricto solo con regla oficial)
  const errores = validarLlave(cuadro, cuadro.regla ? { zonaDe, esperados: clasificados.length } : {});
  if (errores.length) throw httpError(409, `No se pudo armar la llave: ${errores.join('; ')}.`);
  const slots = await slotsDisponibles(torneo);
  // Ocupación: todo el torneo menos la llave vieja de esta categoría (se reescribe);
  // la llave arranca después de la fase de zonas DE ESTA categoría y no antes del inicio configurado.
  const { agenda, usados } = await estadoAgenda(torneo, slots, { [Op.or]: [{ categoria_id: { [Op.ne]: cat } }, { ronda: 'zona' }] });
  const { maxAbs, dias } = await estadoAgenda(torneo, slots, { categoria_id: cat, ronda: 'zona' });
  const inicioAbs = tc.llave_inicio_fecha && tc.llave_inicio_hora && dias.includes(tc.llave_inicio_fecha)
    ? dias.indexOf(tc.llave_inicio_fecha) * 1440 + fx.toMin(tc.llave_inicio_hora) : 0;
  const parejas = new Map((await TorneoPareja.findAll({ where: { torneo_id: torneo.id, categoria_id: cat } })).map(p => [p.id, p]));

  // Programación ronda por ronda, siempre después de la fase de zonas
  const todos = cuadro.rondas.flatMap(r => r.partidos.map(p => ({ ...p, ronda: r.ronda })));
  const aProgramar = todos.filter(p => !p.es_bye);
  // Horarios fijados a mano en la llave de referencia: se respetan (y los de otras categorías se reservan)
  const fijados = await fijadosLlave(torneo);
  reservarFijados(fijados, dias, usados, cat);
  const { previos, resto } = aplicarFijados(aProgramar, fijados.get(cat), dias, usados, agenda, Number(torneo.duracion_partido) || 90);
  const asignacion = fx.programar(resto, slots, parejas, {
    descanso: torneo.descanso_minimo, agenda, usados, previos, minAbs: Math.max(maxAbs + torneo.descanso_minimo, inicioAbs),
    minDe: minimosPorRonda(tc, dias),
  });

  await conTransaccion(async (t) => {
    await borrarPartidos({ torneo_id: torneo.id, categoria_id: cat, ronda: { [Op.ne]: 'zona' } }, t);
    const idPorKey = new Map();
    // De la final hacia atrás, para conocer el id del partido siguiente
    for (const p of [...todos].reverse()) {
      const a = asignacion.get(p.key);
      const creado = await TorneoPartido.create({
        torneo_id: torneo.id, categoria_id: cat, ronda: p.ronda, orden: p.orden,
        pareja1_id: p.pareja1_id, pareja2_id: p.pareja2_id, es_bye: p.es_bye,
        siguiente_partido_id: p.siguiente_key ? idPorKey.get(p.siguiente_key) : null,
        siguiente_slot: p.siguiente_slot ?? null,
        field_id: a?.field_id ?? null, fecha: a?.fecha ?? null, hora: a?.hora ?? null,
        fuera_preferencia: a?.fuera_preferencia ?? false,
        estado: p.es_bye ? 'walkover' : (a ? 'programado' : 'pendiente'),
      }, { transaction: t });
      idPorKey.set(p.key, creado.id);
    }
    await tc.update({ estado: 'llaves' }, { transaction: t });
    await TorneoLlaveProgramacion.destroy({ where: { torneo_id: torneo.id, categoria_id: cat }, transaction: t });
    await sincronizarEstado(torneo, t);
    await sincronizarAgenda(torneo, t);
  });

  if (notificar) {
    // Agradecimiento a los que quedaron afuera en zonas
    const clasif = new Set(clasificados.map(c => c.pareja_id));
    const afuera = await TorneoPareja.findAll({
      where: { torneo_id: torneo.id, categoria_id: cat, zona_id: { [Op.ne]: null }, id: { [Op.notIn]: [...clasif] } },
      include: [{ model: TorneoJugador, as: 'jugadores' }],
    });
    for (const p of afuera) notifier.aPareja(torneo.id_tenant, p, notifier.mensajes.eliminados(torneo, p));
    await notificarProximos(torneo, { parejaIds: [...parejas.keys()] });
  }
  return { categoria_id: cat, tam: cuadro.tam, clasificados: clasificados.length, byes: Math.max(0, cuadro.tam - clasificados.length) };
}

/**
 * Inicio de la llave de una categoría (día y hora). null = después de la fase de zonas.
 * Solo se puede cambiar antes de generar la llave (después, reprogramar partido a partido).
 */
async function configurarInicioLlave(torneo, categoriaId, body = {}) {
  const tc = await resolverCategoria(torneo, categoriaId);
  if (['llaves', 'finalizado'].includes(tc.estado)) throw httpError(409, 'La llave ya está armada: reprogramá sus partidos desde "Partidos".');
  // Cada par (día, hora) es opcional; vacío = por defecto (inicio: al terminar las zonas; semis y final: último día)
  const par = (fecha, hora, etiqueta) => {
    if (!fecha && !hora) return [null, null];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw httpError(400, `Día de ${etiqueta} inválido.`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hora || ''))) throw httpError(400, `Hora de ${etiqueta} inválida (HH:MM).`);
    if (fecha < torneo.fecha_inicio || fecha > torneo.fecha_fin) throw httpError(400, `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)}: el día debe estar entre el ${torneo.fecha_inicio} y el ${torneo.fecha_fin}.`);
    return [fecha, hora];
  };
  const patchTc = {};
  if ('fecha' in body || 'hora' in body) [patchTc.llave_inicio_fecha, patchTc.llave_inicio_hora] = par(body.fecha, body.hora, 'inicio de la llave');
  if ('semis_fecha' in body || 'semis_hora' in body) [patchTc.semis_fecha, patchTc.semis_hora] = par(body.semis_fecha, body.semis_hora, 'semifinales');
  if ('final_fecha' in body || 'final_hora' in body) [patchTc.final_fecha, patchTc.final_hora] = par(body.final_fecha, body.final_hora, 'la final');
  const v = { ...tc.toJSON(), ...patchTc };
  const cuando = (f, h) => (f && h ? `${f} ${h}` : null);
  if (cuando(v.semis_fecha, v.semis_hora) && cuando(v.final_fecha, v.final_hora) && cuando(v.final_fecha, v.final_hora) <= cuando(v.semis_fecha, v.semis_hora)) throw httpError(400, 'La final tiene que ser después de las semifinales.');
  if (cuando(v.llave_inicio_fecha, v.llave_inicio_hora) && cuando(v.semis_fecha, v.semis_hora) && cuando(v.semis_fecha, v.semis_hora) < cuando(v.llave_inicio_fecha, v.llave_inicio_hora)) throw httpError(400, 'Las semifinales no pueden ser antes del inicio de la llave.');
  await tc.update(patchTc);
  const r = tc.toJSON();
  return { categoria_id: r.categoria_id, llave_inicio_fecha: r.llave_inicio_fecha, llave_inicio_hora: r.llave_inicio_hora, semis_fecha: r.semis_fecha, semis_hora: r.semis_hora, final_fecha: r.final_fecha, final_hora: r.final_hora };
}

/**
 * Mínimo de horario por ronda: semifinal y final, por defecto el ÚLTIMO día del torneo
 * (desde el primer horario libre); si se configuró día y hora, desde ese momento.
 */
function minimosPorRonda(tc, dias) {
  const abs = (f, h) => dias.indexOf(f) * 1440 + fx.toMin(h);
  const ultimo = Math.max(0, dias.length - 1) * 1440;
  const semis = tc.semis_fecha && tc.semis_hora && dias.includes(tc.semis_fecha) ? abs(tc.semis_fecha, tc.semis_hora) : ultimo;
  const final = tc.final_fecha && tc.final_hora && dias.includes(tc.final_fecha) ? abs(tc.final_fecha, tc.final_hora) : ultimo;
  return (p) => (p.ronda === 'semifinal' ? semis : p.ronda === 'final' ? final : 0);
}

/** Cuadro de referencia de una categoría (zonas reales o estimadas con las inscriptas). */
async function cuadroReferencia(torneo, cat, zonas) {
  let numZonas = zonas.length;
  let n = zonas.reduce((a, z) => a + z.tabla.length, 0);
  if (!numZonas) {
    n = await TorneoPareja.count({ where: { torneo_id: torneo.id, categoria_id: cat, estado_pago: PAREJAS_ACTIVAS } });
    if (n < 2) return null;
    numZonas = fx.cantidadZonas(n, torneo.parejas_por_zona);
  }
  const K = Math.min(torneo.clasifican_por_zona, torneo.parejas_por_zona);
  if (numZonas * K < 2) return null;
  const opts = { clubId: torneo.id_tenant, parejas: n };
  return { numZonas, K, estimada: !zonas.length, cuadro: fx.armarLlavePorZonas(numZonas, K, null, opts), regla: brackets.reglaPara(numZonas, K, opts) };
}

/** Horarios fijados a mano en la llave de referencia: Map(categoria_id → Map(clave → fila)). */
async function fijadosLlave(torneo) {
  const filas = await TorneoLlaveProgramacion.findAll({ where: { torneo_id: torneo.id }, raw: true });
  const out = new Map();
  for (const f of filas) {
    if (!out.has(f.categoria_id)) out.set(f.categoria_id, new Map());
    out.get(f.categoria_id).set(f.clave, f);
  }
  return out;
}

/**
 * Separa los partidos con horario fijado: los devuelve como asignaciones previas (respetadas
 * por fx.programar para el orden de rondas) y reserva su cancha/hora (y la agenda de las
 * parejas, si ya se conocen) para que el resto no los pise.
 */
function aplicarFijados(partidos, fijados, dias, usados, agenda, dur) {
  const previos = new Map();
  const resto = [];
  for (const p of partidos) {
    const f = fijados?.get(p.key);
    if (!f || !dias.includes(f.fecha)) { resto.push(p); continue; }
    const abs = dias.indexOf(f.fecha) * 1440 + fx.toMin(f.hora);
    previos.set(p.key, { field_id: f.field_id, fecha: f.fecha, hora: f.hora, abs, fuera_preferencia: false, manual: true });
    usados.add(`${f.field_id}|${abs}`);
    for (const pid of [p.pareja1_id, p.pareja2_id]) {
      if (pid == null || !agenda) continue;
      if (!agenda.has(pid)) agenda.set(pid, []);
      agenda.get(pid).push([abs, abs + dur]);
    }
  }
  return { previos, resto };
}

/** Reserva en `usados` los horarios fijados de TODAS las categorías (antes de simular cualquiera). */
function reservarFijados(todos, dias, usados, excepto = null) {
  for (const [cat, mapa] of todos) {
    if (cat === excepto) continue;
    for (const f of mapa.values()) if (dias.includes(f.fecha)) usados.add(`${f.field_id}|${dias.indexOf(f.fecha) * 1440 + fx.toMin(f.hora)}`);
  }
}

/**
 * Simula los horarios de las llaves todavía no generadas de TODAS las categorías del torneo,
 * con la disponibilidad real: franjas de las canchas cedidas, agenda general (reservas,
 * clases, otros torneos) y los partidos ya programados del torneo. Las categorías se simulan
 * en orden (8va → 1ra) y cada una reserva sus horarios antes de la siguiente, así no se pisan.
 * Una categoría se simula si tiene inicio de llave configurado o zonas programadas.
 * @returns {Map<categoria_id, { asignacion: Map<key, slot|null>, canchas: Map<field_id, nombre> }>}
 */
async function simularLlaves(torneo) {
  const pendientes = (await categoriasDe(torneo)).filter(c => ['pendiente', 'zonas'].includes(c.estado));
  if (!pendientes.length) return new Map();
  let slots;
  try { slots = await slotsDisponibles(torneo); } catch { return new Map(); }   // sin canchas asignadas
  const { usados, dias } = await estadoAgenda(torneo, slots, {});
  const fijados = await fijadosLlave(torneo);
  reservarFijados(fijados, dias, usados);   // los horarios fijados a mano no los toma ninguna otra categoría
  const fieldIds = new Set([...slots.map(s => s.field_id), ...[...fijados.values()].flatMap(m => [...m.values()].map(f => f.field_id))]);
  const fields = await Field.findAll({ where: { id: [...fieldIds] }, attributes: ['id', 'nombre', 'identificador'] });
  const canchas = new Map(fields.map(f => [f.id, canchaLabel(f)]));
  const dur = Number(torneo.duracion_partido) || 90;
  const out = new Map();
  for (const tc of pendientes) {
    const zonas = await tablasDeZonas(torneo, false, tc.categoria_id);
    const ref = await cuadroReferencia(torneo, tc.categoria_id, zonas);
    if (!ref) continue;
    const { maxAbs } = await estadoAgenda(torneo, slots, { categoria_id: tc.categoria_id, ronda: 'zona' });
    const inicioAbs = tc.llave_inicio_fecha && tc.llave_inicio_hora && dias.includes(tc.llave_inicio_fecha)
      ? dias.indexOf(tc.llave_inicio_fecha) * 1440 + fx.toMin(tc.llave_inicio_hora) : 0;
    const propios = fijados.get(tc.categoria_id);
    if (!inicioAbs && !maxAbs && !propios?.size) continue;   // sin inicio, zonas ni horarios fijados: nada que simular
    const partidos = ref.cuadro.rondas.flatMap(r => r.partidos.map(p => ({ ...p, ronda: r.ronda }))).filter(p => !p.es_bye);
    const { previos, resto } = aplicarFijados(partidos, propios, dias, new Set(), null, dur);   // ya reservados arriba
    const asignacion = fx.programar(resto, slots, new Map(), {
      descanso: torneo.descanso_minimo, usados, previos,
      minAbs: Math.max(maxAbs ? maxAbs + torneo.descanso_minimo : 0, inicioAbs),
      minDe: minimosPorRonda(tc, dias),
    });
    // Conflicto: un partido fijado a mano que empieza antes de que terminen los que lo alimentan
    const conflictos = new Set();
    for (const p of partidos) {
      const a = asignacion.get(p.key);
      if (!a?.manual) continue;
      for (const dep of p.despuesDe || []) {
        const d = asignacion.get(dep);
        if (d && d.abs + dur + Number(torneo.descanso_minimo || 0) > a.abs) conflictos.add(p.key);
      }
    }
    out.set(tc.categoria_id, { asignacion, canchas, conflictos });
  }
  return out;
}

/**
 * Llave de REFERENCIA antes de generarla: mismos cruces que la real ("1° Zona A vs 2° Zona D");
 * si una zona ya terminó, su lugar muestra la pareja que quedó en esa posición.
 * Sin zonas armadas, estima la cantidad de zonas con las parejas inscriptas.
 */
async function llavePrevista(torneo, cat, zonas, simulacion = null) {
  const ref = await cuadroReferencia(torneo, cat, zonas);
  if (!ref) return null;
  const { numZonas, K, cuadro, regla } = ref;
  // Horario simulado de cada partido (si la categoría tiene inicio o zonas programadas)
  const horario = (key) => {
    const a = simulacion?.asignacion.get(key);
    return a ? { fecha: a.fecha, hora: a.hora, field_id: a.field_id, cancha: simulacion.canchas.get(a.field_id) || null, sin_lugar: false, fijado: Boolean(a.manual), conflicto: simulacion.conflictos?.has(key) || false }
      : { fecha: null, hora: null, field_id: null, cancha: null, sin_lugar: Boolean(simulacion), fijado: false, conflicto: false };
  };
  const porKey = new Map(cuadro.plazas.map(p => [p.key, p]));
  const lugar = (key) => {
    const pl = porKey.get(key);
    if (!pl) return null;
    const z = zonas[pl.zona_idx];
    const real = z?.completa ? z.tabla.find(r => r.posicion === pl.posicion) : null;
    return real ? { id: null, nombre: real.pareja, referencia: pl.etiqueta, pendiente: false } : { id: null, nombre: pl.etiqueta, referencia: pl.etiqueta, pendiente: true };
  };
  return {
    ...fx.rondaInicial(numZonas, K), zonas: numZonas, estimada: !zonas.length, simulada: Boolean(simulacion),
    rondas: cuadro.rondas.map((r, i) => {
      // Lugares que vienen de otro partido: "Ganador Cuartos 1", "Ganador Repechaje 2"…
      const previa = i > 0 ? cuadro.rondas[i - 1].ronda : null;
      const etiquetaGanador = (rondaOrigen, n) => ({ id: null, nombre: `Ganador ${brackets.nombreRonda(regla, rondaOrigen).replace('Semifinal', 'Semi')} ${n}`, pendiente: true });
      const ganadorDe = (p, lado, nGenerico) => {
        const ref = p.origen?.[lado];
        const m = /^W:(.+)-(\d+)$/.exec(ref || '');
        return m ? etiquetaGanador(m[1], Number(m[2])) : etiquetaGanador(previa, nGenerico);
      };
      return {
        ronda: r.ronda, nombre: brackets.nombreRonda(regla, r.ronda),
        partidos: r.partidos.map(p => ({
          id: `prev-${p.key}`, clave: p.key, ronda: r.ronda, orden: p.orden, es_bye: p.es_bye, prevista: true,
          pareja1: p.pareja1_id ? lugar(p.pareja1_id) : (i === 0 ? null : ganadorDe(p, 'local', p.orden * 2 - 1)),
          pareja2: p.pareja2_id ? lugar(p.pareja2_id) : (i === 0 ? null : ganadorDe(p, 'visitante', p.orden * 2)),
          resultado: null, ...(p.es_bye ? { fecha: null, hora: null, cancha: null } : horario(p.key)),
        })),
      };
    }),
  };
}

// ── Resultados ────────────────────────────────────────────────
const JUGADO = ['jugado', 'walkover'];

/**
 * Partidos que dependen de éste (ganador → siguiente, perdedor → perdedor_partido).
 * Si alguno ya se jugó, este resultado queda congelado.
 */
async function dependientes(partido, t) {
  const out = [];
  for (const [campo, slotCampo, rol] of [['siguiente_partido_id', 'siguiente_slot', 'ganador'], ['perdedor_partido_id', 'perdedor_slot', 'perdedor']]) {
    if (!partido[campo]) continue;
    const dest = await TorneoPartido.findByPk(partido[campo], { lock: t.LOCK.UPDATE, transaction: t });
    if (!dest) continue;
    if (JUGADO.includes(dest.estado) && !dest.es_bye) {
      throw httpError(409, `El partido siguiente (${dest.ronda === 'zona' ? `zona, partido ${dest.orden}` : dest.ronda}) ya se jugó; no se puede modificar este resultado.`);
    }
    out.push({ dest, slot: partido[slotCampo], rol });
  }
  return out;
}

/**
 * Carga (o corrige) el resultado de un partido.
 * @param {{sets?: number[][], tie_breaks?: Array<number[]|null>, walkover_ganador?: 1|2}} data
 * @param {{ usuario?: { id?: number, nombre?: string } }} [opts]  quién carga (auditoría)
 */
async function registrarResultado(torneo, partidoId, data, { usuario = {} } = {}) {
  const avisos = [];
  await sequelize.transaction(async (t) => {
    const partido = await TorneoPartido.findOne({
      where: { id: partidoId, torneo_id: torneo.id }, lock: t.LOCK.UPDATE, transaction: t,
    });
    if (!partido) throw httpError(404, 'Partido no encontrado');
    if (partido.es_bye) throw httpError(400, 'Un bye no lleva resultado.');
    if (!partido.pareja1_id || !partido.pareja2_id) throw httpError(409, 'Todavía no están definidas las dos parejas.');
    const tc = await resolverCategoria(torneo, partido.categoria_id, t);
    if (partido.ronda === 'final' && tc.puntos_asignados) {
      throw httpError(409, 'Los puntos anuales de este torneo ya se asignaron: corregí el ranking a mano.');
    }

    // Validación: sets 6-x / 7-5 / 7-6 + tie-break (ver fixtureService.validarResultado)
    // Validación estricta (services/torneos/resultValidation): sets 6-x / 7-5 / 7-6 + tie-break, o W.O. → 6-0 6-0
    // Torneo relámpago: la regla depende de la fase del partido (formatoPartido.reglaPartido)
    const regla = fmt.esRelampago(torneo) ? fmt.reglaPartido(torneo, partido.ronda) : null;
    const { lado, sets, tie_breaks: tieBreaks, is_walkover: wo } = validateResult(data || {}, torneo.tercer_set, regla);
    const ganadorId = lado === 1 ? partido.pareja1_id : partido.pareja2_id;
    const perdedorId = lado === 1 ? partido.pareja2_id : partido.pareja1_id;

    const destinos = await dependientes(partido, t);

    const datosRes = {
      sets, tie_breaks: tieBreaks, ganador_id: ganadorId, is_walkover: wo,
      cargado_por_id: usuario.id ?? null, cargado_por: usuario.nombre ?? null, cargado_at: new Date(),
    };
    const [res] = await TorneoResultado.findOrCreate({
      where: { partido_id: partido.id }, defaults: { partido_id: partido.id, ...datosRes }, transaction: t,
    });
    await res.update(datosRes, { transaction: t });
    await partido.update({ estado: wo ? 'walkover' : 'jugado' }, { transaction: t });

    // Avance: ganador (llave y zonas de 4) y perdedor (zonas de 4)
    for (const { dest, slot, rol } of destinos) {
      await dest.update({ [`pareja${slot}_id`]: rol === 'ganador' ? ganadorId : perdedorId }, { transaction: t });
    }
    const siguiente = destinos.find(d => d.rol === 'ganador')?.dest || null;

    avisos.push({ tipo: 'resultado', partidoId: partido.id });
    if (partido.ronda === 'zona') {
      await recalcularTablaZona(partido.zona_id, t);
      for (const { dest } of destinos) {
        if (dest.pareja1_id && dest.pareja2_id) avisos.push({ tipo: 'proximo', partidoId: dest.id });
      }
    } else {
      if (partido.ronda === 'final') {
        avisos.push({ tipo: 'campeon', parejaId: ganadorId }, { tipo: 'subcampeon', parejaId: perdedorId });
        await tc.update({ estado: 'finalizado' }, { transaction: t });
        await sincronizarEstado(torneo, t);
        await asignarPuntosAnuales(torneo, tc, t);
      } else {
        avisos.push({ tipo: 'eliminados', parejaId: perdedorId });
        if (partido.ronda === 'semifinal') avisos.push({ tipo: 'finalistas', parejaId: ganadorId });
        if (siguiente?.pareja1_id && siguiente?.pareja2_id) avisos.push({ tipo: 'proximo', partidoId: siguiente.id });
      }
    }
  });

  await despacharAvisos(torneo, avisos);

  // Zona de la categoría terminada → armar SU llave automáticamente
  let llave = null;
  const fresh = await Torneo.findByPk(torneo.id);
  const jugado = await TorneoPartido.findByPk(partidoId, { attributes: ['categoria_id'] });
  const tcFresh = await TorneoCategoria.findOne({ where: { torneo_id: torneo.id, categoria_id: jugado.categoria_id } });
  if (tcFresh?.estado === 'zonas') {
    const pendientes = await TorneoPartido.count({ where: { torneo_id: torneo.id, categoria_id: jugado.categoria_id, ronda: 'zona', estado: { [Op.notIn]: ['jugado', 'walkover'] } } });
    if (pendientes === 0) llave = await generarLlave(fresh, { categoria_id: jugado.categoria_id }).catch(err => ({ error: err.message }));
  }
  return { ok: true, llave };
}

/**
 * Borra el resultado de un partido de ZONA (antes de armar la llave).
 * En zonas de 4, vacía los lugares que había ocupado en G1vP2 / G2vP1
 * (si esos partidos ya se jugaron, no se puede).
 */
async function quitarResultado(torneo, partidoId) {
  await sequelize.transaction(async (t) => {
    const p = await TorneoPartido.findOne({ where: { id: partidoId, torneo_id: torneo.id }, lock: t.LOCK.UPDATE, transaction: t });
    if (!p) throw httpError(404, 'Partido no encontrado');
    const tc = await resolverCategoria(torneo, p.categoria_id, t);
    if (tc.estado !== 'zonas') throw httpError(409, 'Solo se pueden borrar resultados de zona antes de generar la llave.');
    if (p.ronda !== 'zona') throw httpError(409, 'Solo se pueden borrar resultados de zona.');
    for (const { dest, slot } of await dependientes(p, t)) {
      await dest.update({ [`pareja${slot}_id`]: null }, { transaction: t });
    }
    await TorneoResultado.destroy({ where: { partido_id: p.id }, transaction: t });
    await p.update({ estado: p.fecha ? 'programado' : 'pendiente' }, { transaction: t });
    await recalcularTablaZona(p.zona_id, t);
  });
  return { ok: true };
}

async function despacharAvisos(torneo, avisos) {
  const club = torneo.id_tenant;
  const conJugadores = (id) => TorneoPareja.findByPk(id, { include: [{ model: TorneoJugador, as: 'jugadores' }] });
  for (const a of avisos) {
    try {
      if (a.tipo === 'resultado' || a.tipo === 'proximo') {
        const p = await cargarPartido(a.partidoId);
        const texto = a.tipo === 'resultado'
          ? notifier.mensajes.resultado(torneo, p, p.resultado, p.resultado.ganador_id === p.pareja1_id ? p.pareja1 : p.pareja2)
          : notifier.mensajes.proximoPartido(torneo, p, canchaLabel(p.field));
        if (a.tipo === 'proximo' && !p.fecha) continue;
        for (const par of [p.pareja1, p.pareja2]) if (par) notifier.aPareja(club, par, texto);
      } else {
        const p = await conJugadores(a.parejaId);
        if (p) notifier.aPareja(club, p, notifier.mensajes[a.tipo](torneo, p));
      }
    } catch (err) {
      console.error('[torneos] aviso', a.tipo, err.message);
    }
  }
}

/** Envía a cada pareja su próximo partido programado (definido y sin jugar). */
async function notificarProximos(torneo, { parejaIds } = {}) {
  const partidos = await TorneoPartido.findAll({
    where: {
      torneo_id: torneo.id, estado: 'programado', es_bye: false,
      pareja1_id: { [Op.ne]: null }, pareja2_id: { [Op.ne]: null },
    },
    include: incluirPartido(false),
    order: [['fecha', 'ASC'], ['hora', 'ASC']],
  });
  const avisadas = new Set();
  let enviados = 0;
  const manual = await notifier.esManual();
  const destinatarios = [];   // modo manual: un mensaje por jugador para el WhatsApp del dispositivo
  for (const p of partidos) {
    for (const par of [p.pareja1, p.pareja2]) {
      if (avisadas.has(par.id) || (parejaIds && !parejaIds.includes(par.id))) continue;
      avisadas.add(par.id);
      const texto = notifier.mensajes.proximoPartido(torneo, p, canchaLabel(p.field));
      if (manual) { destinatarios.push(...notifier.destinosPareja(par, texto)); continue; }
      const r = await notifier.aPareja(torneo.id_tenant, par, texto);
      enviados += r.filter(x => x.ok).length;
    }
  }
  if (manual) return { modo: 'manual', parejas: avisadas.size, destinatarios };
  return { parejas: avisadas.size, mensajes: enviados };
}

// ── Reprogramación manual (auditada) ─────────────────────────
const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Reprograma un partido: nuevo día / horario / cancha, o lo deja "sin programar"
 * (estado = 'pendiente'). Valida: partido no jugado, torneo en curso, cancha cedida al
 * torneo, horario dentro de la franja de la cancha y libre en la agenda general
 * (reservas, clases, otros torneos), sin otro partido del torneo en esa cancha y hora,
 * y sin que las parejas pierdan el descanso mínimo.
 * Registra el cambio (torneo_partido_reprogramaciones) y deja preparadas las notificaciones.
 * @param {object} datos  { field_id, fecha, hora, estado?: 'programado'|'pendiente' }
 * @param {object} opts   { motivo, usuario, puede?: (permiso) => boolean, notificar }
 */
async function reprogramarPartido(torneo, partidoId, datos = {}, { notificar = true, motivo = null, usuario = {}, puede = () => true } = {}) {
  const partido = await TorneoPartido.findOne({ where: { id: partidoId, torneo_id: torneo.id } });
  if (!partido) throw httpError(404, 'Partido no encontrado');
  if (['jugado', 'walkover'].includes(partido.estado)) throw httpError(409, 'El partido ya se jugó: no se puede reprogramar.');
  if (['finalizado', 'cancelado'].includes(torneo.estado)) throw httpError(409, `El torneo está ${torneo.estado}.`);
  if (partido.es_bye) throw httpError(400, 'Un BYE no se programa.');
  const mot = motivo ? String(motivo).trim().slice(0, 255) || null : null;
  const antes = { fecha: partido.fecha, hora: partido.hora, field_id: partido.field_id, estado: partido.estado };
  const estado = datos.estado === 'pendiente' ? 'pendiente' : 'programado';

  let cambios;
  if (estado === 'pendiente') {
    if (antes.estado === 'pendiente' && !antes.fecha) throw httpError(400, 'El partido ya está sin programar.');
    cambios = { field_id: null, fecha: null, hora: null, estado: 'pendiente', fuera_preferencia: false };
  } else {
    const fieldId = Number(datos.field_id);
    const { fecha, hora } = datos;
    if (!Number.isInteger(fieldId) || fieldId <= 0) throw httpError(400, 'Elegí la cancha.');
    if (!ISO_FECHA.test(String(fecha || ''))) throw httpError(400, 'Fecha inválida.');
    if (!HHMM.test(String(hora || ''))) throw httpError(400, 'Horario inválido (HH:MM).');
    if (fecha < torneo.fecha_inicio || fecha > torneo.fecha_fin) throw httpError(400, `La fecha debe estar entre el ${torneo.fecha_inicio} y el ${torneo.fecha_fin}.`);
    if (fecha === antes.fecha && hora === antes.hora && fieldId === antes.field_id && antes.estado === 'programado') throw httpError(400, 'No hay cambios: es el mismo día, horario y cancha.');
    // Permisos granulares por tipo de cambio
    const faltan = [
      fecha !== antes.fecha && 'tournament.match.change_date',
      hora !== antes.hora && 'tournament.match.change_time',
      fieldId !== antes.field_id && 'tournament.match.change_court',
    ].filter(Boolean).filter(p => !puede(p));
    if (faltan.length) throw Object.assign(httpError(403, `No tenés permiso para: ${faltan.map(p => ({ 'tournament.match.change_date': 'cambiar el día', 'tournament.match.change_time': 'cambiar el horario', 'tournament.match.change_court': 'cambiar la cancha' }[p])).join(', ')}.`), { permisos: faltan });

    const cancha = await TorneoCancha.findOne({ where: { torneo_id: torneo.id, field_id: fieldId } });
    if (!cancha) throw httpError(400, 'Esa cancha no está cedida al torneo.');
    const slots = await slotsDisponibles(torneo);
    const slot = slots.find(s => s.field_id === fieldId && s.fecha === fecha && s.hora === hora);
    if (!slot) throw httpError(409, 'Ese horario no está disponible en la cancha: está fuera de la franja cedida al torneo o ya hay una reserva, clase u otro torneo.');
    const { agenda, usados } = await estadoAgenda(torneo, slots, { id: { [Op.ne]: partido.id } });
    if (usados.has(`${slot.field_id}|${slot.abs}`)) throw httpError(409, 'Ya hay otro partido del torneo en esa cancha y horario.');
    const choca = [partido.pareja1_id, partido.pareja2_id].filter(Boolean).some(pid =>
      (agenda.get(pid) || []).some(([a, b]) => slot.abs < b + torneo.descanso_minimo && a < slot.abs + slot.dur + torneo.descanso_minimo));
    if (choca) throw httpError(409, 'Una de las parejas ya juega en ese horario (o sin el descanso mínimo).');
    const parejas = await TorneoPareja.findAll({ where: { id: [partido.pareja1_id, partido.pareja2_id].filter(Boolean) } });
    cambios = { field_id: fieldId, fecha, hora, estado: 'programado', fuera_preferencia: !parejas.every(p => fx.encajaPreferencia(p, slot)) };
  }

  let registro;
  await conTransaccion(async (t) => {
    await partido.update(cambios, { transaction: t });
    registro = await TorneoReprogramacion.create({
      partido_id: partido.id, torneo_id: torneo.id,
      old_fecha: antes.fecha, old_hora: antes.hora, old_field_id: antes.field_id, old_estado: antes.estado,
      new_fecha: cambios.fecha, new_hora: cambios.hora, new_field_id: cambios.field_id, new_estado: cambios.estado,
      motivo: mot, usuario_id: usuario.id || null, usuario: usuario.nombre || null,
    }, { transaction: t });
    // Estructura preparada para avisos futuros (hoy no se envían: Torneos es canal manual)
    const destinatarios = [partido.pareja1_id, partido.pareja2_id].filter(Boolean).map(id => ({ destinatario_tipo: 'pareja', destinatario_id: id }));
    if (destinatarios.length) {
      await TorneoNotificacion.bulkCreate(destinatarios.map(d => ({
        ...d, torneo_id: torneo.id, partido_id: partido.id, tipo: 'reprogramacion', canal: 'manual', estado: 'pendiente',
        payload: { antes, despues: { fecha: cambios.fecha, hora: cambios.hora, field_id: cambios.field_id, estado: cambios.estado }, motivo: mot },
      })), { transaction: t });
    }
    await sincronizarAgenda(torneo, t);
  });
  console.log(`[torneos] partido ${partido.id} reprogramado · torneo ${torneo.id} · ${antes.fecha || '—'} ${antes.hora || ''} cancha ${antes.field_id || '—'} → ${cambios.fecha || 'sin programar'} ${cambios.hora || ''} cancha ${cambios.field_id || '—'} · ${usuario.nombre || '?'}${mot ? ` · "${mot}"` : ''}`);

  if (notificar && estado === 'programado' && partido.pareja1_id && partido.pareja2_id) await despacharAvisos(torneo, [{ tipo: 'proximo', partidoId: partido.id }]);
  return { partido: await cargarPartido(partido.id), reprogramacion: registro };
}

/**
 * Fija día / hora / cancha de un partido de la llave de REFERENCIA (antes de generarla).
 * Valida: categoría sin llave, partido del cuadro, fecha del torneo, cancha cedida, horario
 * dentro de su franja y libre (agenda general, partidos del torneo y otros horarios fijados).
 * datos.estado === 'pendiente' → vuelve a la simulación automática.
 */
async function programarPrevista(torneo, categoriaId, clave, datos = {}, { usuario = {}, motivo = null, puede = () => true } = {}) {
  const tc = await resolverCategoria(torneo, categoriaId);
  if (!['pendiente', 'zonas'].includes(tc.estado)) throw httpError(409, 'La llave ya está generada: reprogramá el partido desde la llave.');
  const zonas = await tablasDeZonas(torneo, false, tc.categoria_id);
  const ref = await cuadroReferencia(torneo, tc.categoria_id, zonas);
  const partido = ref?.cuadro.rondas.flatMap(r => r.partidos).find(p => p.key === clave);
  if (!partido) throw httpError(404, 'Partido de la llave no encontrado.');
  if (partido.es_bye) throw httpError(400, 'Un BYE no se programa.');
  const actual = await TorneoLlaveProgramacion.findOne({ where: { torneo_id: torneo.id, categoria_id: tc.categoria_id, clave } });
  if (datos.estado === 'pendiente') {
    if (actual) await actual.destroy();
    return { clave, automatico: true };
  }
  const fieldId = Number(datos.field_id);
  const { fecha, hora } = datos;
  if (!Number.isInteger(fieldId) || fieldId <= 0) throw httpError(400, 'Elegí la cancha.');
  if (!ISO_FECHA.test(String(fecha || ''))) throw httpError(400, 'Fecha inválida.');
  if (!HHMM.test(String(hora || ''))) throw httpError(400, 'Horario inválido (HH:MM).');
  if (fecha < torneo.fecha_inicio || fecha > torneo.fecha_fin) throw httpError(400, `La fecha debe estar entre el ${torneo.fecha_inicio} y el ${torneo.fecha_fin}.`);
  const faltan = [
    actual && fecha !== actual.fecha && 'tournament.match.change_date',
    actual && hora !== actual.hora && 'tournament.match.change_time',
    actual && fieldId !== actual.field_id && 'tournament.match.change_court',
  ].filter(Boolean).filter(p => !puede(p));
  if (faltan.length) throw httpError(403, 'No tenés permiso para hacer ese cambio.');
  if (!(await TorneoCancha.count({ where: { torneo_id: torneo.id, field_id: fieldId } }))) throw httpError(400, 'Esa cancha no está cedida al torneo.');
  const slots = await slotsDisponibles(torneo);
  const slot = slots.find(s => s.field_id === fieldId && s.fecha === fecha && s.hora === hora);
  if (!slot) throw httpError(409, 'Ese horario no está disponible en la cancha: está fuera de la franja cedida al torneo o ya hay una reserva, clase u otro torneo.');
  const { usados } = await estadoAgenda(torneo, slots, {});
  if (usados.has(`${slot.field_id}|${slot.abs}`)) throw httpError(409, 'Ya hay un partido del torneo en esa cancha y horario.');
  const otro = await TorneoLlaveProgramacion.findOne({ where: { torneo_id: torneo.id, field_id: fieldId, fecha, hora, ...(actual && { id: { [Op.ne]: actual.id } }) } });
  if (otro) throw httpError(409, 'Ese horario ya está fijado para otro partido de la llave.');
  const fila = { torneo_id: torneo.id, categoria_id: tc.categoria_id, clave, field_id: fieldId, fecha, hora, motivo: motivo ? String(motivo).trim().slice(0, 255) || null : null, usuario_id: usuario.id || null, usuario: usuario.nombre || null };
  if (actual) await actual.update(fila); else await TorneoLlaveProgramacion.create(fila);
  console.log(`[torneos] llave de referencia · torneo ${torneo.id} · ${rk.nombreCat(tc.categoria_id)} · ${clave} fijado ${fecha} ${hora} cancha ${fieldId} · ${usuario.nombre || '?'}`);
  return { clave, automatico: false, fecha, hora, field_id: fieldId };
}

/** Historial de reprogramaciones de un partido (con nombres de cancha). */
async function historialPartido(torneo, partidoId) {
  const partido = await TorneoPartido.findOne({ where: { id: partidoId, torneo_id: torneo.id }, attributes: ['id'] });
  if (!partido) throw httpError(404, 'Partido no encontrado');
  const filas = await TorneoReprogramacion.findAll({ where: { partido_id: partido.id }, order: [['id', 'DESC']] });
  const ids = [...new Set(filas.flatMap(f => [f.old_field_id, f.new_field_id]).filter(Boolean))];
  const fields = ids.length ? await Field.findAll({ where: { id: ids }, attributes: ['id', 'nombre', 'identificador'] }) : [];
  const nombre = (id) => canchaLabel(fields.find(f => f.id === id)) || null;
  return filas.map(f => ({ ...f.toJSON(), old_cancha: nombre(f.old_field_id), new_cancha: nombre(f.new_field_id) }));
}

// ── Vista completa ────────────────────────────────────────────
async function fixture(torneo, { publico = true, categoria_id } = {}) {
  const cats = await categoriasDe(torneo);
  // Sin categoría pedida: la primera que tenga fixture (o la primera del torneo)
  const elegida = categoria_id ? await resolverCategoria(torneo, categoria_id) : (cats.find(c => c.estado !== 'pendiente') || cats[0]);
  const cat = elegida?.categoria_id ?? null;
  const partidos = await TorneoPartido.findAll({
    where: { torneo_id: torneo.id, ...(cat && { categoria_id: cat }) },
    include: incluirPartido(publico),
    order: [['fecha', 'ASC'], ['hora', 'ASC'], ['orden', 'ASC']],
  });
  const zonas = await tablasDeZonas(torneo, publico, cat);
  // Última reprogramación de cada partido (auditoría visible)
  const ultimas = new Map();
  if (!publico && partidos.length) {
    const reps = await TorneoReprogramacion.findAll({ where: { partido_id: partidos.map(p => p.id) }, attributes: ['partido_id', 'usuario', 'createdAt', 'motivo'], order: [['id', 'DESC']] });
    for (const r of reps) if (!ultimas.has(r.partido_id)) ultimas.set(r.partido_id, { usuario: r.usuario, fecha: r.createdAt, motivo: r.motivo });
  }
  // Lugar todavía vacío que llega de otro partido de la zona → "Ganador P1" / "Perdedor P2"
  const origen = (p, slot) => {
    const g = partidos.find(x => x.siguiente_partido_id === p.id && x.siguiente_slot === slot && x.ronda === 'zona');
    if (g) return `Ganador P${g.orden}`;
    const l = partidos.find(x => x.perdedor_partido_id === p.id && x.perdedor_slot === slot);
    return l ? `Perdedor P${l.orden}` : null;
  };
  // Llave: de qué zona y posición viene cada clasificado ("1° Zona A")
  const K = Math.min(torneo.clasifican_por_zona, torneo.parejas_por_zona);
  const procedencia = new Map(zonas.flatMap(z => (z.completa ? z.tabla : []).filter(r => r.posicion <= K).map(r => [r.pareja_id, `${r.posicion}° ${z.nombre}`])));
  const porId = new Map(partidos.map(p => [p.id, p]));
  const regla = brackets.reglaPara(zonas.length, K, { clubId: torneo.id_tenant, parejas: zonas.reduce((a, z) => a + z.tabla.length, 0) });
  const pareja = (p, slot) => {
    const par = p[`pareja${slot}`];
    if (par) return { id: par.id, nombre: notifier.nombrePareja(par), numero_zona: par.numero_zona ?? null, ...(p.ronda !== 'zona' && procedencia.has(par.id) && { referencia: procedencia.get(par.id) }) };
    const o = p.ronda === 'zona' ? origen(p, slot) : null;
    return o ? { id: null, nombre: o, pendiente: true } : null;
  };
  const serial = (p) => ({
    id: p.id, ronda: p.ronda, orden: p.orden, zona: p.zona?.nombre || null, zona_id: p.zona_id,
    pareja1: pareja(p, 1),
    pareja2: pareja(p, 2),
    es_bye: p.es_bye, estado: p.estado, fuera_preferencia: p.fuera_preferencia,
    fecha: p.fecha, hora: p.hora, field_id: p.field_id, cancha: canchaLabel(p.field),
    siguiente_partido_id: p.siguiente_partido_id,
    siguiente: p.ronda !== 'zona' && p.siguiente_partido_id && porId.has(p.siguiente_partido_id)
      ? `${brackets.nombreRonda(regla, porId.get(p.siguiente_partido_id).ronda)} ${porId.get(p.siguiente_partido_id).orden}` : null,
    ultima_modificacion: ultimas.get(p.id) || null,
    resultado: p.resultado ? {
      sets: p.resultado.sets, tie_breaks: p.resultado.tie_breaks || [], ganador_id: p.resultado.ganador_id,
      is_walkover: Boolean(p.resultado.is_walkover) || p.estado === 'walkover',
      ...(!publico && { cargado_por: p.resultado.cargado_por, cargado_at: p.resultado.cargado_at }),
    } : null,
  });
  const llave = fx.ORDEN_RONDAS
    .map(r => ({ ronda: r, nombre: brackets.nombreRonda(regla, r), partidos: partidos.filter(p => p.ronda === r).sort((a, b) => a.orden - b.orden).map(serial) }))
    .filter(r => r.partidos.length);
  const simulacion = cat && !llave.length ? await simularLlaves(torneo).catch(() => new Map()) : null;
  const prevista = cat && !llave.length ? await llavePrevista(torneo, cat, zonas, simulacion?.get(cat) || null).catch(() => null) : null;
  return {
    categoria_id: cat,
    categorias: cats.map(c => ({
      categoria_id: c.categoria_id, nombre: rk.nombreCat(c.categoria_id), estado: c.estado, puntos_asignados: c.puntos_asignados,
      llave_inicio_fecha: c.llave_inicio_fecha, llave_inicio_hora: c.llave_inicio_hora,
      semis_fecha: c.semis_fecha, semis_hora: c.semis_hora, final_fecha: c.final_fecha, final_hora: c.final_hora,
    })),
    llave_prevista: prevista,
    zonas: zonas.map(z => ({
      ...z,
      partidos: partidos.filter(p => p.zona_id === z.zona_id).sort((a, b) => a.orden - b.orden).map(serial),
    })),
    llave,
    campeon: llave.find(r => r.ronda === 'final')?.partidos[0]?.resultado?.ganador_id ?? null,
  };
}

module.exports = {
  httpError, canchaLabel, incluirPartido,
  inscribirPareja, confirmarPago, emitirTickets, sincronizarAgenda, conTransaccion, eliminarTorneo,
  slotsDisponibles, generarZonas, generarLlave, tablasDeZonas, rankingJugadores,
  registrarResultado, quitarResultado, recalcularTablaZona, puntosRanking, notificarProximos, reprogramarPartido, fixture,
  categoriasDe, resolverCategoria, sincronizarEstado, modificarPuntaje, historialPuntajes,
  previsualizarZonas, prepararSiembra, historialZonas, historialPartido, configurarInicioLlave, llavePrevista, simularLlaves,
  programarPrevista, borrarLlave,
};

/** Historial de armados de zonas del torneo (auditoría). */
function historialZonas(torneo) {
  return TorneoZonaHistorial.findAll({ where: { torneo_id: torneo.id }, order: [['id', 'DESC']], limit: 100 });
}
