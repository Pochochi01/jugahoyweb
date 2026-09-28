'use strict';
/**
 * services/torneos/torneoService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Casos de uso del torneo con acceso a BD. Los controllers son finos y delegan acá.
 *
 *   inscribirPareja()      validaciones de cupo / categoría / género + alta
 *   confirmarPago()        pareja → 'pagado', genera tickets QR y avisa
 *   generarZonas()         arma zonas, partidos todos-contra-todos y los programa
 *   generarLlave()         cruces eliminatorios con byes a partir de las zonas
 *   registrarResultado()   carga sets, avanza la llave y dispara los avisos
 *   reprogramarPartido()   cambio manual de cancha / horario con control de choques
 *   fixture()              vista completa (zonas, tablas, llave) para las pantallas
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Torneo, TorneoCancha, TorneoZona, TorneoPareja, TorneoJugador,
  TorneoPartido, TorneoResultado, TorneoTicket, Field, Booking, TimeSlot,
} = require('../../models');
const fx = require('./fixtureService');
const notifier = require('./torneoNotifier');
const { frontendUrl } = require('../../config/urls');

const PAREJAS_ACTIVAS = { [Op.in]: ['pendiente', 'pagado'] };
const JUGADORES_PUBLICOS = ['id', 'nombre', 'categoria'];

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
    if (categoria < torneo.categoria) {
      throw httpError(400, `${nombre} es de ${categoria}ª y no puede jugar un torneo de ${torneo.categoria}ª.`);
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
      horarios_preferidos: horarios,
      estado_pago: gratis ? 'pagado' : 'pendiente',
      metodo_pago: gratis ? 'sin_cargo' : (opts.metodoPago || null),
      monto: torneo.precio_inscripcion,
      user_id: opts.userId || null,
    }, { transaction: t });
    await TorneoJugador.bulkCreate(limpios.map(j => ({ ...j, pareja_id: p.id })), { transaction: t });
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
    notifier.enviar(torneo.id_tenant, j.whatsapp, notifier.mensajes.pagoConfirmado(torneo, pareja, j, url), { imagen: png });
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
async function generarZonas(torneo, { incluirPendientes = false, notificar = true } = {}) {
  if (!['borrador', 'inscripcion', 'zonas'].includes(torneo.estado)) {
    throw httpError(409, 'Las zonas sólo se pueden (re)armar antes de la fase de llaves.');
  }
  const jugados = await TorneoPartido.count({ where: { torneo_id: torneo.id, estado: ['jugado', 'walkover'], es_bye: false } });
  if (jugados > 0) throw httpError(409, 'Ya hay resultados cargados: no se pueden rearmar las zonas.');

  const parejas = await TorneoPareja.findAll({
    where: { torneo_id: torneo.id, estado_pago: incluirPendientes ? PAREJAS_ACTIVAS : 'pagado' },
    include: [{ model: TorneoJugador, as: 'jugadores' }],
  });
  const dias = fx.diasEntre(torneo.fecha_inicio, torneo.fecha_fin);
  const grupos = fx.armarZonas(parejas, torneo.parejas_por_zona, dias);
  const slots = await slotsDisponibles(torneo);
  const porId = new Map(parejas.map(p => [p.id, p]));

  const sinProgramar = await conTransaccion(async (t) => {
    await TorneoPartido.destroy({ where: { torneo_id: torneo.id }, transaction: t });
    await TorneoPareja.update({ zona_id: null }, { where: { torneo_id: torneo.id }, transaction: t });
    await TorneoZona.destroy({ where: { torneo_id: torneo.id }, transaction: t });

    const cruces = [];
    for (const [i, grupo] of grupos.entries()) {
      const zona = await TorneoZona.create({ torneo_id: torneo.id, nombre: fx.nombreZona(i) }, { transaction: t });
      await TorneoPareja.update({ zona_id: zona.id }, { where: { id: grupo.map(p => p.id) }, transaction: t });
      fx.roundRobin(grupo.map(p => p.id)).forEach(([a, b], k) =>
        cruces.push({ key: `${zona.id}-${k}`, zona_id: zona.id, orden: k + 1, pareja1_id: a, pareja2_id: b }));
    }

    const asignacion = fx.programar(cruces, slots, porId, { descanso: torneo.descanso_minimo });
    let pendientes = 0;
    await TorneoPartido.bulkCreate(cruces.map(c => {
      const a = asignacion.get(c.key);
      if (!a) pendientes++;
      return {
        torneo_id: torneo.id, zona_id: c.zona_id, ronda: 'zona', orden: c.orden,
        pareja1_id: c.pareja1_id, pareja2_id: c.pareja2_id,
        field_id: a?.field_id ?? null, fecha: a?.fecha ?? null, hora: a?.hora ?? null,
        fuera_preferencia: a?.fuera_preferencia ?? false,
        estado: a ? 'programado' : 'pendiente',
      };
    }), { transaction: t });

    await torneo.update({ estado: 'zonas' }, { transaction: t });
    await sincronizarAgenda(torneo, t);
    return pendientes;
  });

  if (notificar) await notificarProximos(torneo);
  return { zonas: grupos.length, parejas: parejas.length, sin_programar: sinProgramar };
}

// ── Tablas ────────────────────────────────────────────────────
async function tablasDeZonas(torneo, publico = false) {
  const zonas = await TorneoZona.findAll({
    where: { torneo_id: torneo.id },
    include: [
      incluirPareja('parejas', publico),
      { model: TorneoPartido, as: 'partidos', include: [{ model: TorneoResultado, as: 'resultado' }] },
    ],
    order: [['nombre', 'ASC']],
  });
  return zonas.map(z => {
    const tabla = fx.tablaZona(z.parejas, z.partidos).map(r => ({
      ...r, pareja: notifier.nombrePareja(z.parejas.find(p => p.id === r.pareja_id)),
    }));
    return { zona_id: z.id, nombre: z.nombre, tabla, completa: z.partidos.every(p => ['jugado', 'walkover'].includes(p.estado)) };
  });
}

/** Posiciones por jugador (cada jugador hereda los números de su pareja). */
async function rankingJugadores(torneo) {
  const zonas = await tablasDeZonas(torneo, true);
  const parejas = await TorneoPareja.findAll({
    where: { torneo_id: torneo.id, zona_id: { [Op.ne]: null } },
    include: [{ model: TorneoJugador, as: 'jugadores', attributes: JUGADORES_PUBLICOS }],
  });
  // Partidos de llave ganados suman al ranking general
  const llave = await TorneoPartido.findAll({
    where: { torneo_id: torneo.id, ronda: { [Op.ne]: 'zona' }, es_bye: false, estado: ['jugado', 'walkover'] },
    include: [{ model: TorneoResultado, as: 'resultado' }],
  });
  const filas = [];
  for (const z of zonas) for (const r of z.tabla) {
    const p = parejas.find(x => x.id === r.pareja_id);
    const extra = llave.filter(m => [m.pareja1_id, m.pareja2_id].includes(r.pareja_id));
    const pgLlave = extra.filter(m => m.resultado?.ganador_id === r.pareja_id).length;
    for (const j of p?.jugadores || []) {
      filas.push({
        jugador_id: j.id, jugador: j.nombre, pareja: r.pareja, zona: z.nombre,
        pj: r.pj + extra.length, pg: r.pg + pgLlave, pp: r.pp + (extra.length - pgLlave),
        puntos: r.puntos + pgLlave * fx.PUNTOS_VICTORIA + (extra.length - pgLlave) * fx.PUNTOS_DERROTA,
        dif_sets: r.dif_sets, dif_games: r.dif_games,
      });
    }
  }
  filas.sort((a, b) => (b.puntos - a.puntos) || (b.dif_sets - a.dif_sets) || (b.dif_games - a.dif_games));
  filas.forEach((f, i) => { f.posicion = i + 1; });
  return filas;
}

// ── Llave ─────────────────────────────────────────────────────
async function generarLlave(torneo, { forzar = false, notificar = true } = {}) {
  if (torneo.estado !== 'zonas') throw httpError(409, 'La llave se genera al terminar la fase de zonas.');
  const zonas = await tablasDeZonas(torneo);
  if (zonas.length === 0) throw httpError(409, 'Primero armá las zonas.');
  if (!forzar && zonas.some(z => !z.completa)) throw httpError(409, 'Faltan resultados de zona.');

  const clasificados = fx.rankingClasificados(zonas, torneo.clasifican_por_zona);
  const cuadro = fx.armarLlave(clasificados);
  const slots = await slotsDisponibles(torneo);
  const { agenda, usados, maxAbs } = await estadoAgenda(torneo, slots);
  const parejas = new Map((await TorneoPareja.findAll({ where: { torneo_id: torneo.id } })).map(p => [p.id, p]));

  // Programación ronda por ronda, siempre después de la fase de zonas
  const todos = cuadro.rondas.flatMap(r => r.partidos.map(p => ({ ...p, ronda: r.ronda })));
  const aProgramar = todos.filter(p => !p.es_bye);
  const asignacion = fx.programar(aProgramar, slots, parejas, {
    descanso: torneo.descanso_minimo, agenda, usados, minAbs: maxAbs + torneo.descanso_minimo,
  });

  await conTransaccion(async (t) => {
    await TorneoPartido.destroy({ where: { torneo_id: torneo.id, ronda: { [Op.ne]: 'zona' } }, transaction: t });
    const idPorKey = new Map();
    // De la final hacia atrás, para conocer el id del partido siguiente
    for (const p of [...todos].reverse()) {
      const a = asignacion.get(p.key);
      const creado = await TorneoPartido.create({
        torneo_id: torneo.id, ronda: p.ronda, orden: p.orden,
        pareja1_id: p.pareja1_id, pareja2_id: p.pareja2_id, es_bye: p.es_bye,
        siguiente_partido_id: p.siguiente_key ? idPorKey.get(p.siguiente_key) : null,
        siguiente_slot: p.siguiente_slot ?? null,
        field_id: a?.field_id ?? null, fecha: a?.fecha ?? null, hora: a?.hora ?? null,
        fuera_preferencia: a?.fuera_preferencia ?? false,
        estado: p.es_bye ? 'walkover' : (a ? 'programado' : 'pendiente'),
      }, { transaction: t });
      idPorKey.set(p.key, creado.id);
    }
    await torneo.update({ estado: 'llaves' }, { transaction: t });
    await sincronizarAgenda(torneo, t);
  });

  if (notificar) {
    // Agradecimiento a los que quedaron afuera en zonas
    const clasif = new Set(clasificados.slice(0, 16).map(c => c.pareja_id));
    const afuera = await TorneoPareja.findAll({
      where: { torneo_id: torneo.id, zona_id: { [Op.ne]: null }, id: { [Op.notIn]: [...clasif] } },
      include: [{ model: TorneoJugador, as: 'jugadores' }],
    });
    for (const p of afuera) notifier.aPareja(torneo.id_tenant, p, notifier.mensajes.eliminados(torneo, p));
    await notificarProximos(torneo);
  }
  return { tam: cuadro.tam, clasificados: clasificados.length, byes: cuadro.tam - Math.min(16, clasificados.length) };
}

// ── Resultados ────────────────────────────────────────────────
/**
 * Valida sets (mejor de 3; el 3° puede ser súper tie-break) y devuelve el ganador.
 * @returns {1|2}
 */
function ganadorPorSets(sets) {
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) throw httpError(400, 'Cargá 2 o 3 sets.');
  let a = 0, b = 0;
  for (const s of sets) {
    const [x, y] = s.map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x === y) throw httpError(400, 'Set inválido.');
    if (a === 2 || b === 2) throw httpError(400, 'Hay sets de más: el partido ya estaba definido.');
    x > y ? a++ : b++;
  }
  if (a !== 2 && b !== 2) throw httpError(400, 'El resultado no define un ganador (mejor de 3 sets).');
  return a === 2 ? 1 : 2;
}

/**
 * Carga (o corrige) el resultado de un partido.
 * @param {{sets?: number[][], walkover_ganador?: 1|2}} data
 */
async function registrarResultado(torneo, partidoId, data) {
  const avisos = [];
  await sequelize.transaction(async (t) => {
    const partido = await TorneoPartido.findOne({
      where: { id: partidoId, torneo_id: torneo.id }, lock: t.LOCK.UPDATE, transaction: t,
    });
    if (!partido) throw httpError(404, 'Partido no encontrado');
    if (partido.es_bye) throw httpError(400, 'Un bye no lleva resultado.');
    if (!partido.pareja1_id || !partido.pareja2_id) throw httpError(409, 'Todavía no están definidas las dos parejas.');

    const wo = data.walkover_ganador != null;
    const lado = wo ? Number(data.walkover_ganador) : ganadorPorSets(data.sets);
    if (![1, 2].includes(lado)) throw httpError(400, 'walkover_ganador debe ser 1 o 2.');
    const ganadorId = lado === 1 ? partido.pareja1_id : partido.pareja2_id;
    const perdedorId = lado === 1 ? partido.pareja2_id : partido.pareja1_id;

    // En llave: si el ganador ya jugó el partido siguiente, no se puede corregir
    let siguiente = null;
    if (partido.siguiente_partido_id) {
      siguiente = await TorneoPartido.findByPk(partido.siguiente_partido_id, { lock: t.LOCK.UPDATE, transaction: t });
      if (siguiente && ['jugado', 'walkover'].includes(siguiente.estado) && !siguiente.es_bye) {
        throw httpError(409, 'El partido siguiente de la llave ya se jugó; no se puede modificar este resultado.');
      }
    }

    const sets = wo ? [] : data.sets.map(s => s.map(Number));
    const [res] = await TorneoResultado.findOrCreate({
      where: { partido_id: partido.id }, defaults: { partido_id: partido.id, sets, ganador_id: ganadorId }, transaction: t,
    });
    await res.update({ sets, ganador_id: ganadorId }, { transaction: t });
    await partido.update({ estado: wo ? 'walkover' : 'jugado' }, { transaction: t });

    if (siguiente) {
      await siguiente.update({ [`pareja${partido.siguiente_slot}_id`]: ganadorId }, { transaction: t });
    }

    avisos.push({ tipo: 'resultado', partidoId: partido.id });
    if (partido.ronda !== 'zona') {
      if (partido.ronda === 'final') {
        avisos.push({ tipo: 'campeon', parejaId: ganadorId }, { tipo: 'subcampeon', parejaId: perdedorId });
        await torneo.update({ estado: 'finalizado' }, { transaction: t });
      } else {
        avisos.push({ tipo: 'eliminados', parejaId: perdedorId });
        if (partido.ronda === 'semifinal') avisos.push({ tipo: 'finalistas', parejaId: ganadorId });
        if (siguiente?.pareja1_id && siguiente?.pareja2_id) avisos.push({ tipo: 'proximo', partidoId: siguiente.id });
      }
    }
  });

  await despacharAvisos(torneo, avisos);

  // Zona terminada → armar la llave automáticamente
  let llave = null;
  const fresh = await Torneo.findByPk(torneo.id);
  if (fresh.estado === 'zonas') {
    const pendientes = await TorneoPartido.count({ where: { torneo_id: torneo.id, ronda: 'zona', estado: { [Op.notIn]: ['jugado', 'walkover'] } } });
    if (pendientes === 0) llave = await generarLlave(fresh).catch(err => ({ error: err.message }));
  }
  return { ok: true, llave };
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
  for (const p of partidos) {
    for (const par of [p.pareja1, p.pareja2]) {
      if (avisadas.has(par.id) || (parejaIds && !parejaIds.includes(par.id))) continue;
      avisadas.add(par.id);
      const r = await notifier.aPareja(torneo.id_tenant, par, notifier.mensajes.proximoPartido(torneo, p, canchaLabel(p.field)));
      enviados += r.filter(x => x.ok).length;
    }
  }
  return { parejas: avisadas.size, mensajes: enviados };
}

// ── Reprogramación manual ─────────────────────────────────────
async function reprogramarPartido(torneo, partidoId, { field_id, fecha, hora }, { notificar = true } = {}) {
  const partido = await TorneoPartido.findOne({ where: { id: partidoId, torneo_id: torneo.id } });
  if (!partido) throw httpError(404, 'Partido no encontrado');
  if (['jugado', 'walkover'].includes(partido.estado)) throw httpError(409, 'El partido ya se jugó.');

  const cancha = await TorneoCancha.findOne({ where: { torneo_id: torneo.id, field_id } });
  if (!cancha) throw httpError(400, 'Esa cancha no está cedida al torneo.');
  const slots = await slotsDisponibles(torneo);
  const slot = slots.find(s => s.field_id === Number(field_id) && s.fecha === fecha && s.hora === hora);
  if (!slot) throw httpError(409, 'Ese horario no está disponible en la cancha (fuera de franja o reservado).');

  const { agenda, usados } = await estadoAgenda(torneo, slots, { id: { [Op.ne]: partido.id } });
  if (usados.has(`${slot.field_id}|${slot.abs}`)) throw httpError(409, 'Ya hay otro partido en esa cancha y horario.');
  const choca = [partido.pareja1_id, partido.pareja2_id].filter(Boolean).some(pid =>
    (agenda.get(pid) || []).some(([a, b]) => slot.abs < b + torneo.descanso_minimo && a < slot.abs + slot.dur + torneo.descanso_minimo));
  if (choca) throw httpError(409, 'Una de las parejas ya juega en ese horario (o sin el descanso mínimo).');

  const parejas = await TorneoPareja.findAll({ where: { id: [partido.pareja1_id, partido.pareja2_id].filter(Boolean) } });
  const fuera = !parejas.every(p => fx.encajaPreferencia(p, slot));
  await conTransaccion(async (t) => {
    await partido.update({ field_id: slot.field_id, fecha, hora, estado: 'programado', fuera_preferencia: fuera }, { transaction: t });
    await sincronizarAgenda(torneo, t);
  });

  if (notificar && partido.pareja1_id && partido.pareja2_id) await despacharAvisos(torneo, [{ tipo: 'proximo', partidoId: partido.id }]);
  return partido;
}

// ── Vista completa ────────────────────────────────────────────
async function fixture(torneo, { publico = true } = {}) {
  const partidos = await TorneoPartido.findAll({
    where: { torneo_id: torneo.id },
    include: incluirPartido(publico),
    order: [['fecha', 'ASC'], ['hora', 'ASC'], ['orden', 'ASC']],
  });
  const zonas = await tablasDeZonas(torneo, publico);
  const serial = (p) => ({
    id: p.id, ronda: p.ronda, orden: p.orden, zona: p.zona?.nombre || null, zona_id: p.zona_id,
    pareja1: p.pareja1 ? { id: p.pareja1.id, nombre: notifier.nombrePareja(p.pareja1) } : null,
    pareja2: p.pareja2 ? { id: p.pareja2.id, nombre: notifier.nombrePareja(p.pareja2) } : null,
    es_bye: p.es_bye, estado: p.estado, fuera_preferencia: p.fuera_preferencia,
    fecha: p.fecha, hora: p.hora, field_id: p.field_id, cancha: canchaLabel(p.field),
    siguiente_partido_id: p.siguiente_partido_id,
    resultado: p.resultado ? { sets: p.resultado.sets, ganador_id: p.resultado.ganador_id } : null,
  });
  const llave = fx.ORDEN_RONDAS
    .map(r => ({ ronda: r, partidos: partidos.filter(p => p.ronda === r).sort((a, b) => a.orden - b.orden).map(serial) }))
    .filter(r => r.partidos.length);
  return {
    zonas: zonas.map(z => ({ ...z, partidos: partidos.filter(p => p.zona_id === z.zona_id).map(serial) })),
    llave,
    campeon: llave.find(r => r.ronda === 'final')?.partidos[0]?.resultado?.ganador_id ?? null,
  };
}

module.exports = {
  httpError, canchaLabel, incluirPartido,
  inscribirPareja, confirmarPago, emitirTickets, sincronizarAgenda, conTransaccion,
  slotsDisponibles, generarZonas, generarLlave, tablasDeZonas, rankingJugadores,
  ganadorPorSets, registrarResultado, notificarProximos, reprogramarPartido, fixture,
};
