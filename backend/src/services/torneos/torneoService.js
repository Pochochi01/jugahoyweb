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
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Torneo, TorneoCancha, TorneoZona, TorneoPareja, TorneoJugador,
  TorneoPartido, TorneoResultado, TorneoTicket, Field, Booking, TimeSlot,
  TorneoTablaPosicion, RankingJugador,
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

  // Anual: puntos de la pareja = suma del ranking de sus dos jugadores
  const puntosPorDni = torneo.tipo === 'anual' ? await puntosRanking(torneo) : new Map();
  const conPuntos = parejas.map(p => ({
    id: p.id,
    horarios_preferidos: p.horarios_preferidos,
    puntos_totales: p.jugadores.reduce((acc, j) => acc + (puntosPorDni.get(j.dni) || 0), 0),
  }));
  const grupos = fx.armarZonas(conPuntos, { tipo: torneo.tipo, parejasPorZona: torneo.parejas_por_zona });
  const slots = await slotsDisponibles(torneo);
  const porId = new Map(parejas.map(p => [p.id, p]));

  const sinProgramar = await conTransaccion(async (t) => {
    await borrarPartidos({ torneo_id: torneo.id }, t);
    await TorneoTablaPosicion.destroy({ where: { torneo_id: torneo.id }, transaction: t });
    await TorneoPareja.update({ zona_id: null, numero_zona: null }, { where: { torneo_id: torneo.id }, transaction: t });
    await TorneoZona.destroy({ where: { torneo_id: torneo.id }, transaction: t });

    // Cruces por zona: 4 parejas → formato 1v3 / 2v4 / G1vP2 / G2vP1; resto → todos contra todos
    const cruces = [];
    for (const [i, grupo] of grupos.entries()) {
      const zona = await TorneoZona.create({ torneo_id: torneo.id, nombre: fx.nombreZona(i) }, { transaction: t });
      for (const p of grupo) {
        await TorneoPareja.update({ zona_id: zona.id, numero_zona: p.numero_zona, puntos_totales: p.puntos_totales },
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
    const asignacion1 = fx.programar(primeros, slots, porId, { descanso: torneo.descanso_minimo });
    const usados = new Set([...asignacion1.values()].filter(Boolean).map(a => `${a.field_id}|${a.abs}`));
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
        torneo_id: torneo.id, zona_id: c.zona_id, ronda: 'zona', orden: c.orden,
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

    await torneo.update({ estado: 'zonas' }, { transaction: t });
    const zonas = await TorneoZona.findAll({ where: { torneo_id: torneo.id }, transaction: t });
    for (const z of zonas) await recalcularTablaZona(z.id, t);
    await sincronizarAgenda(torneo, t);
    return pendientes;
  });

  if (notificar) await notificarProximos(torneo);
  return {
    tipo: torneo.tipo,
    zonas: grupos.length,
    parejas: parejas.length,
    sin_programar: sinProgramar,
    // Reparto final (para mostrar el sorteo / los cabezas de serie)
    reparto: grupos.map((g, i) => ({ zona: fx.nombreZona(i), parejas: g.map(p => ({ id: p.id, numero: p.numero_zona, puntos: p.puntos_totales })) })),
  };
}

// ── Ranking anual ─────────────────────────────────────────────
const temporadaDe = (torneo) => Number(String(torneo.fecha_inicio).slice(0, 4));

/** Puntos de ranking por DNI para la categoría + género + temporada del torneo. */
async function puntosRanking(torneo) {
  const filas = await RankingJugador.findAll({
    where: { id_tenant: torneo.id_tenant, categoria: torneo.categoria, genero: torneo.genero, temporada: temporadaDe(torneo) },
    attributes: ['dni', 'puntos'], raw: true,
  });
  return new Map(filas.map(f => [f.dni, f.puntos]));
}

/**
 * Puntos que suma cada jugador según la instancia a la que llegó su pareja.
 * Se aplican una sola vez, al finalizar un torneo 'anual'.
 */
const PUNTOS_INSTANCIA = { campeon: 100, final: 70, semifinal: 50, cuartos: 35, octavos: 25, zona: 10 };

async function asignarPuntosAnuales(torneo, transaction) {
  if (torneo.tipo !== 'anual' || torneo.puntos_asignados) return;
  const partidos = await TorneoPartido.findAll({
    where: { torneo_id: torneo.id, es_bye: false },
    include: [{ model: TorneoResultado, as: 'resultado' }], transaction,
  });
  const parejas = await TorneoPareja.findAll({
    where: { torneo_id: torneo.id, zona_id: { [Op.ne]: null } },
    include: [{ model: TorneoJugador, as: 'jugadores' }], transaction,
  });
  // Instancia máxima alcanzada por cada pareja
  const orden = ['zona', 'octavos', 'cuartos', 'semifinal', 'final'];
  const instancia = new Map(parejas.map(p => [p.id, 'zona']));
  for (const m of partidos) {
    for (const pid of [m.pareja1_id, m.pareja2_id]) {
      if (pid && orden.indexOf(m.ronda) > orden.indexOf(instancia.get(pid))) instancia.set(pid, m.ronda);
    }
    if (m.ronda === 'final' && m.resultado?.ganador_id) instancia.set(m.resultado.ganador_id, 'campeon');
  }
  // Byes: una pareja que pasó directo figura en la ronda siguiente → ya queda contemplada
  const temporada = temporadaDe(torneo);
  for (const p of parejas) {
    const pts = PUNTOS_INSTANCIA[instancia.get(p.id)] || 0;
    for (const j of p.jugadores) {
      const [fila] = await RankingJugador.findOrCreate({
        where: { id_tenant: torneo.id_tenant, temporada, categoria: torneo.categoria, genero: torneo.genero, dni: j.dni },
        defaults: { nombre: j.nombre, puntos: 0 }, transaction,
      });
      await fila.update({ puntos: fila.puntos + pts, nombre: j.nombre }, { transaction });
    }
  }
  await torneo.update({ puntos_asignados: true }, { transaction });
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
  const filas = fx.tablaZona(zona.parejas, zona.partidos);
  await TorneoTablaPosicion.destroy({ where: { zona_id: zonaId }, transaction });
  await TorneoTablaPosicion.bulkCreate(filas.map(r => ({
    torneo_id: zona.torneo_id, zona_id: zonaId, pareja_id: r.pareja_id, posicion: r.posicion,
    pj: r.pj, pg: r.pg, pp: r.pp, puntos: r.puntos,
    sets_favor: r.sf, sets_contra: r.sc, games_favor: r.gf, games_contra: r.gc,
    diferencia_sets: r.dif_sets, diferencia_games: r.dif_games,
  })), { transaction });
}

/** Tablas de todas las zonas (leídas de la tabla persistida). */
async function tablasDeZonas(torneo, publico = false) {
  const zonas = await TorneoZona.findAll({
    where: { torneo_id: torneo.id },
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
      puntos_ranking: parejaDe(r.pareja_id)?.puntos_totales ?? 0,
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
    await borrarPartidos({ torneo_id: torneo.id, ronda: { [Op.ne]: 'zona' } }, t);
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
    if (partido.ronda === 'final' && torneo.puntos_asignados) {
      throw httpError(409, 'Los puntos anuales de este torneo ya se asignaron: corregí el ranking a mano.');
    }

    // Validación: sets 6-x / 7-5 / 7-6 + tie-break (ver fixtureService.validarResultado)
    const wo = data.walkover_ganador != null;
    let lado, sets = [], tieBreaks = [];
    if (wo) {
      lado = Number(data.walkover_ganador);
      if (![1, 2].includes(lado)) throw httpError(400, 'walkover_ganador debe ser 1 o 2.');
    } else {
      ({ lado, sets, tie_breaks: tieBreaks } = fx.validarResultado(data.sets, data.tie_breaks, torneo.tercer_set));
    }
    const ganadorId = lado === 1 ? partido.pareja1_id : partido.pareja2_id;
    const perdedorId = lado === 1 ? partido.pareja2_id : partido.pareja1_id;

    const destinos = await dependientes(partido, t);

    const [res] = await TorneoResultado.findOrCreate({
      where: { partido_id: partido.id }, defaults: { partido_id: partido.id, sets, tie_breaks: tieBreaks, ganador_id: ganadorId }, transaction: t,
    });
    await res.update({ sets, tie_breaks: tieBreaks, ganador_id: ganadorId }, { transaction: t });
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
        await torneo.update({ estado: 'finalizado' }, { transaction: t });
        await asignarPuntosAnuales(torneo, t);
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

/**
 * Borra el resultado de un partido de ZONA (antes de armar la llave).
 * En zonas de 4, vacía los lugares que había ocupado en G1vP2 / G2vP1
 * (si esos partidos ya se jugaron, no se puede).
 */
async function quitarResultado(torneo, partidoId) {
  if (torneo.estado !== 'zonas') throw httpError(409, 'Solo se pueden borrar resultados de zona antes de generar la llave.');
  await sequelize.transaction(async (t) => {
    const p = await TorneoPartido.findOne({ where: { id: partidoId, torneo_id: torneo.id }, lock: t.LOCK.UPDATE, transaction: t });
    if (!p) throw httpError(404, 'Partido no encontrado');
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
  // Lugar todavía vacío que llega de otro partido de la zona → "Ganador P1" / "Perdedor P2"
  const origen = (p, slot) => {
    const g = partidos.find(x => x.siguiente_partido_id === p.id && x.siguiente_slot === slot && x.ronda === 'zona');
    if (g) return `Ganador P${g.orden}`;
    const l = partidos.find(x => x.perdedor_partido_id === p.id && x.perdedor_slot === slot);
    return l ? `Perdedor P${l.orden}` : null;
  };
  const pareja = (p, slot) => {
    const par = p[`pareja${slot}`];
    if (par) return { id: par.id, nombre: notifier.nombrePareja(par), numero_zona: par.numero_zona ?? null };
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
    resultado: p.resultado ? { sets: p.resultado.sets, tie_breaks: p.resultado.tie_breaks || [], ganador_id: p.resultado.ganador_id } : null,
  });
  const llave = fx.ORDEN_RONDAS
    .map(r => ({ ronda: r, partidos: partidos.filter(p => p.ronda === r).sort((a, b) => a.orden - b.orden).map(serial) }))
    .filter(r => r.partidos.length);
  return {
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
  registrarResultado, quitarResultado, recalcularTablaZona, puntosRanking, PUNTOS_INSTANCIA, notificarProximos, reprogramarPartido, fixture,
};
