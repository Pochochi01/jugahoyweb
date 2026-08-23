const { Op } = require('sequelize');
const {
  Agenda, Field, User, Operation, TimeSlot, Booking, Notification, Complex,
  RecurringBooking, BookingConsumo, CantinaProducto, CantinaVenta,
  CantinaDetalleVenta, CantinaMovimiento, sequelize,
} = require('../models');
const recurring = require('../services/recurringService');
const caja = require('../services/cajaService');
const notifService = require('./../services/notification.service');
const wa = require('../services/whatsappService');
const integrations = require('../services/integrations.service');
const { todayAR } = require('../utils/time');
const { yaComenzo, MSG_YA_COMENZO } = require('../utils/cancelPolicy');
const { registrarInasistencia, reevaluarTrasCorreccion, listarIncumplidos, habilitarManual } = require('../utils/inasistencias');

// Reserva originada por WhatsApp (para avisar la cancelación al número del cliente)
function esReservaWhatsApp(booking) {
  return Boolean(booking?.telefono_cliente) && /whatsapp/i.test(booking?.notas || '');
}

// ── utilidades ────────────────────────────────────────────────────────────────

// Genera slots de 60 min (hora en punto) entre apertura y cierre de la cancha
function generateSlotsForField(horaApertura = '08:00', horaCierre = '02:00') {
  const startH = parseInt(horaApertura.split(':')[0]);
  const closeH = parseInt(horaCierre.split(':')[0]);
  const endH   = closeH < startH ? closeH + 24 : closeH;
  const slots  = [];
  for (let h = startH; h < endH; h++) {
    const d = h % 24;
    slots.push(`${String(d).padStart(2, '0')}:00`);
  }
  return slots;
}

// Envuelve correctamente la medianoche: 23:00 + 60min = 00:00
function addMinutes(hora, min) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Slots antes de hora_apertura son de madrugada (día siguiente del calendario)
function isPast(fecha, hora, horaApertura = '08:00') {
  const startH = parseInt(horaApertura.split(':')[0]);
  const [h]    = hora.split(':').map(Number);
  const dt     = new Date(`${fecha}T${hora}:00`);
  if (h < startH) dt.setDate(dt.getDate() + 1);
  return dt < new Date();
}

function horaToLogicalMin(hora, startH = 8) {
  const [h, m] = hora.split(':').map(Number);
  const min    = h * 60 + m;
  return h < startH ? min + 1440 : min;
}

// ── módulo de agenda por slots ────────────────────────────────────────────────

async function getSlotsForField(req, res) {
  try {
    const { complexId, fieldId } = req.params;
    const date = req.query.date || todayAR();

    // Admin puede ver slots de canchas inactivas (para consulta histórica)
    const field = await Field.findOne({ where: { id: fieldId, complex_id: complexId } });
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });

    // Extiende los turnos fijos (crea ocurrencias futuras faltantes) — best-effort.
    await recurring.materializarComplejo(complexId).catch(err => console.error('[turnos-fijos]', err.message));

    const apertura = field.hora_apertura || '08:00';
    const cierre   = field.hora_cierre   || '02:00';
    const allHoras = generateSlotsForField(apertura, cierre);

    // Traer todos los time_slots del día con su booking asociado
    const existingSlots = await TimeSlot.findAll({
      where: { field_id: fieldId, fecha: date, estado: 'ocupado' },
      include: [{
        model: Booking,
        as: 'booking',
        where: { estado: { [Op.ne]: 'cancelado' } },
        required: false,
      }],
    });

    const slotMap = {};
    existingSlots.forEach(s => { slotMap[s.hora] = s; });

    const slots = allHoras.map(hora => {
      const existing = slotMap[hora];
      const past     = isPast(date, hora, apertura);
      const booking  = existing?.booking ?? null;

      return {
        hora,
        hora_fin:         addMinutes(hora, 60),
        estado:           existing ? 'ocupado' : (past ? 'pasado' : 'libre'),
        time_slot_id:     existing?.id ?? null,
        booking_id:       booking?.id ?? null,
        booking,
        // primer slot de una reserva: es donde se muestra el botón de cancelar
        isFirstOfBooking: booking ? booking.hora_inicio === hora : false,
        // hora de fin real de la reserva (puede abarcar varios slots)
        hora_fin_reserva: booking?.hora_fin ?? null,
        past,
        field_id: parseInt(fieldId),
        fecha:    date,
      };
    });

    res.json({ field, slots });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function reserveSlot(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId } = req.params;
    const {
      field_id, fecha, hora, duracion = 60,
      nombre_cliente, telefono_cliente, email_cliente,
      metodo_pago, monto, notas,
    } = req.body;

    if (!nombre_cliente || !field_id || !fecha || !hora) {
      await t.rollback();
      return res.status(400).json({ message: 'Faltan datos requeridos (field_id, fecha, hora, nombre_cliente)' });
    }

    const slotsNecesarios = Math.ceil(duracion / 60);
    const horasAReservar  = [];
    for (let i = 0; i < slotsNecesarios; i++) {
      horasAReservar.push(addMinutes(hora, i * 60));
    }
    const horaFin = addMinutes(hora, duracion);

    // Verificar que TODOS los slots necesarios estén libres (con lock para evitar race conditions)
    const ocupados = await TimeSlot.findAll({
      where: {
        field_id,
        fecha,
        hora: { [Op.in]: horasAReservar },
        estado: 'ocupado',
      },
      transaction: t,
      lock: true,
    });

    if (ocupados.length > 0) {
      await t.rollback();
      const horasOcupadas = ocupados.map(s => s.hora).join(', ');
      return res.status(409).json({
        message: `Los horarios ${horasOcupadas} ya están ocupados. Elegí otra duración o franja.`,
      });
    }

    // Trazabilidad: si el teléfono coincide con una cuenta de jugador (últimos 10
    // dígitos, formato-agnóstico), vincular la reserva a ese usuario.
    const telDig = String(telefono_cliente || '').replace(/\D/g, '');
    const sig = telDig.length >= 8 ? telDig.slice(-10) : null;
    const cuenta = sig
      ? await User.findOne({ where: { telefono: { [Op.like]: `%${sig}%` } }, attributes: ['id'], transaction: t })
      : null;

    // Crear el booking
    const booking = await Booking.create({
      field_id,
      fecha,
      hora_inicio:    hora,
      hora_fin:       horaFin,
      duracion,
      nombre_cliente,
      telefono_cliente,
      email_cliente,
      metodo_pago:    metodo_pago || 'efectivo',
      monto,
      notas,
      estado:     'confirmado',
      user_id:    cuenta?.id || null,
      created_by: req.user.id,
    }, { transaction: t });

    // Crear / actualizar todos los time_slots cubiertos por esta reserva
    for (const h of horasAReservar) {
      await TimeSlot.upsert(
        { field_id, fecha, hora: h, estado: 'ocupado', booking_id: booking.id },
        { transaction: t }
      );
    }

    await Operation.create({
      complex_id:  complexId,
      tipo:        'reserva',
      descripcion: `Reserva: ${nombre_cliente} — ${fecha} ${hora}-${horaFin} (${duracion} min)`,
      usuario_id:  req.user.id,
      monto:       monto || 0,
    }, { transaction: t });

    await t.commit();
    res.status(201).json({ booking, horasReservadas: horasAReservar });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

async function cancelBooking(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, bookingId } = req.params;
    const { motivo } = req.body || {};

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: TimeSlot, as: 'timeSlots' },
        { model: Field, as: 'field', attributes: ['nombre'] },
      ],
      transaction: t,
    });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    // El admin (y el colaborador con permiso) pueden cancelar cuando quieran —
    // NO aplica la regla de las 2 h — PERO un turno que ya comenzó o pasó no
    // puede cancelarse (para eso está "marcar no asistió").
    if (yaComenzo(booking)) {
      await t.rollback();
      return res.status(400).json({ message: MSG_YA_COMENZO });
    }

    // Liberar todos los slots de esta reserva
    await Promise.all(booking.timeSlots.map(s =>
      s.update({ estado: 'libre', booking_id: null }, { transaction: t })
    ));
    await booking.update({ estado: 'cancelado' }, { transaction: t });

    await Operation.create({
      complex_id:  complexId,
      tipo:        'cancelacion',
      descripcion: `Cancelación admin: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio}-${booking.hora_fin}`,
      usuario_id:  req.user.id,
    }, { transaction: t });

    // Notificar al player si la reserva fue hecha desde la web
    if (booking.user_id) {
      await Notification.create({
        user_id:    booking.user_id,
        tipo:       'reserva_rechazada',
        titulo:     'Turno cancelado ❌',
        mensaje:    `Tu turno del ${booking.fecha} de ${booking.hora_inicio} a ${booking.hora_fin} fue cancelado por el complejo. Podés elegir otro horario.`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await t.commit();

    // Push al jugador: su turno fue cancelado por el complejo (si era reserva web).
    if (booking.user_id) {
      notifService.sendToUserAsync(booking.user_id, {
        tipo:   'cancelacion',
        titulo: 'Turno cancelado ❌',
        body:   `Tu turno del ${booking.fecha} ${booking.hora_inicio}–${booking.hora_fin} en ${booking.field?.nombre || 'la cancha'} fue cancelado por el complejo.`,
        url:    '/mis-turnos',
        data:   { cancha_id: booking.field_id, cancha_nombre: booking.field?.nombre, fecha: booking.fecha, hora: booking.hora_inicio, booking_id: booking.id },
        actions: [{ action: 'ver', title: 'Ver mis turnos' }],
      });
    }

    // Aviso por WhatsApp si la reserva se hizo por el bot (best-effort, no bloquea).
    // MULTI-TENANT: se envía con las credenciales del club dueño de la reserva.
    if (esReservaWhatsApp(booking)) {
      integrations.getMetaCredentials(complexId)
        .then(creds => wa.sendCancellationNotice(booking.telefono_cliente, {
          fecha:  booking.fecha,
          hora:   booking.hora_inicio,
          cancha: booking.field?.nombre || 'la cancha',
          motivo,
        }, creds))
        .catch(err => console.error('[WhatsApp] aviso cancelación:', err.message));
    }

    res.json({ message: 'Reserva cancelada', booking });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

// ── legacy ────────────────────────────────────────────────────────────────────

async function getByComplex(req, res) {
  try {
    const { complexId } = req.params;
    const { fecha, field_id } = req.query;
    const where = {};
    if (fecha) where.fecha = fecha;
    const fieldWhere = { complex_id: complexId };
    if (field_id) fieldWhere.id = field_id;
    const slots = await Agenda.findAll({
      where,
      include: [
        { model: Field, as: 'field', where: fieldWhere },
        { model: User, as: 'player', attributes: ['id', 'nombre', 'apellido', 'telefono'] },
      ],
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
    });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const slot = await Agenda.create(req.body);
    await Operation.create({
      complex_id: req.params.complexId,
      tipo: 'reserva',
      descripcion: `Turno creado para el ${slot.fecha} ${slot.hora_inicio}`,
      agenda_id: slot.id,
      usuario_id: req.user.id,
    });
    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const slot = await Agenda.findByPk(req.params.id);
    if (!slot) return res.status(404).json({ message: 'Turno no encontrado' });
    const prevEstado = slot.estado;
    await slot.update(req.body);
    if (prevEstado !== slot.estado) {
      const tipoMap = { cancelado: 'cancelacion', confirmado: 'confirmacion' };
      if (tipoMap[slot.estado]) {
        await Operation.create({
          complex_id: req.params.complexId,
          tipo: tipoMap[slot.estado],
          descripcion: `Turno ${slot.id} ${slot.estado}`,
          agenda_id: slot.id,
          usuario_id: req.user.id,
        });
      }
    }
    res.json(slot);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const slot = await Agenda.findByPk(req.params.id);
    if (!slot) return res.status(404).json({ message: 'Turno no encontrado' });
    await slot.destroy();
    res.json({ message: 'Turno eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── reservas pendientes (web) ─────────────────────────────────────────────────

async function getPendingBookings(req, res) {
  try {
    const { complexId } = req.params;
    const fieldIds = (await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] })).map(f => f.id);
    const bookings = await Booking.findAll({
      where: {
        field_id: { [Op.in]: fieldIds },
        estado:   'pendiente',
        fecha:    { [Op.gte]: todayAR() },
      },
      include: [{ model: Field, as: 'field', attributes: ['id', 'nombre', 'deporte'] }],
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
    });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function confirmBooking(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, bookingId } = req.params;
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Field, as: 'field', attributes: ['nombre', 'deporte'] }],
      transaction: t,
    });
    if (!booking || booking.estado !== 'pendiente') {
      await t.rollback();
      return res.status(404).json({ message: 'Reserva pendiente no encontrada.' });
    }
    await booking.update({ estado: 'confirmado' }, { transaction: t });

    if (booking.user_id) {
      await Notification.create({
        user_id:    booking.user_id,
        tipo:       'reserva_confirmada',
        titulo:     '¡Turno confirmado! ✅',
        mensaje:    `Tu reserva del ${booking.fecha} de ${booking.hora_inicio} a ${booking.hora_fin} en ${booking.field?.nombre || 'la cancha'} fue confirmada. ¡Te esperamos!`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await Operation.create({
      complex_id:  complexId,
      tipo:        'confirmacion',
      descripcion: `Reserva confirmada: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio}-${booking.hora_fin}`,
      usuario_id:  req.user.id,
    }, { transaction: t });

    await t.commit();

    // Push al jugador: su turno fue confirmado
    if (booking.user_id) {
      notifService.sendToUserAsync(booking.user_id, {
        tipo:   'confirmacion',
        titulo: '¡Turno confirmado! ✅',
        body:   `Tu reserva del ${booking.fecha} ${booking.hora_inicio}–${booking.hora_fin} en ${booking.field?.nombre || 'la cancha'} fue confirmada.`,
        url:    '/mis-turnos',
        data:   { cancha_id: booking.field_id, cancha_nombre: booking.field?.nombre, fecha: booking.fecha, hora: booking.hora_inicio, booking_id: booking.id },
        actions: [{ action: 'ver', title: 'Ver mis turnos' }],
      });
    }

    res.json(booking);
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

async function rejectBooking(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, bookingId } = req.params;
    const { motivo } = req.body;
    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: TimeSlot, as: 'timeSlots' },
        { model: Field, as: 'field', attributes: ['nombre', 'deporte'] },
      ],
      transaction: t,
    });
    if (!booking || booking.estado !== 'pendiente') {
      await t.rollback();
      return res.status(404).json({ message: 'Reserva pendiente no encontrada.' });
    }

    // Liberar los slots
    await Promise.all(booking.timeSlots.map(s =>
      s.update({ estado: 'libre', booking_id: null }, { transaction: t })
    ));
    await booking.update({ estado: 'rechazado' }, { transaction: t });

    if (booking.user_id) {
      const motivoTexto = motivo?.trim() ? `: ${motivo.trim()}.` : '.';
      await Notification.create({
        user_id:    booking.user_id,
        tipo:       'reserva_rechazada',
        titulo:     'Turno no disponible ❌',
        mensaje:    `Tu reserva del ${booking.fecha} a las ${booking.hora_inicio} en ${booking.field?.nombre || 'la cancha'} no pudo confirmarse${motivoTexto} Podés elegir otro horario.`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await Operation.create({
      complex_id:  complexId,
      tipo:        'cancelacion',
      descripcion: `Reserva rechazada: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio}${motivo ? ` (${motivo})` : ''}`,
      usuario_id:  req.user.id,
    }, { transaction: t });

    await t.commit();

    // Push al jugador: su turno fue rechazado/cancelado por el admin
    if (booking.user_id) {
      notifService.sendToUserAsync(booking.user_id, {
        tipo:   'cancelacion',
        titulo: 'Turno no disponible ❌',
        body:   `Tu reserva del ${booking.fecha} ${booking.hora_inicio} en ${booking.field?.nombre || 'la cancha'} no pudo confirmarse${motivo?.trim() ? `: ${motivo.trim()}` : ''}.`,
        url:    '/mis-turnos',
        data:   { cancha_id: booking.field_id, cancha_nombre: booking.field?.nombre, fecha: booking.fecha, hora: booking.hora_inicio, booking_id: booking.id },
      });
    }

    res.json(booking);
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

// ── PATCH /:complexId/no-asistido/:bookingId ──────────────────
// Marca un turno como "no asistido" (ausencia). Solo si YA pasó su hora de inicio.
async function markNoShow(req, res) {
  try {
    const { complexId, bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Field, as: 'field', attributes: ['id', 'nombre', 'complex_id'] }],
    });
    if (!booking) return res.status(404).json({ message: 'Reserva no encontrada.' });

    // Pertenencia al complejo (defensa extra sobre requireComplexAccess)
    if (String(booking.field?.complex_id) !== String(complexId)) {
      return res.status(403).json({ message: 'La reserva no pertenece a este complejo.' });
    }

    // Solo turnos confirmados (no ya cancelados/rechazados/marcados)
    if (booking.estado !== 'confirmado') {
      return res.status(409).json({ message: `No se puede marcar ausencia: el turno está "${booking.estado}".` });
    }

    // La hora de inicio DEBE haber pasado (madrugada = día siguiente del calendario)
    const [h] = booking.hora_inicio.split(':').map(Number);
    const inicio = new Date(`${booking.fecha}T${booking.hora_inicio}:00`);
    if (h < 8) inicio.setDate(inicio.getDate() + 1);
    if (inicio.getTime() > Date.now()) {
      return res.status(400).json({
        message: 'El turno todavía no comenzó. La ausencia solo puede marcarse después de la hora de inicio.',
      });
    }

    await booking.update({ estado: 'no_asistido' });

    // Actualizar la lista de incumplidos (puede incorporar al jugador).
    await registrarInasistencia(complexId, {
      userId:   booking.user_id,
      telefono: booking.telefono_cliente,
      nombre:   booking.nombre_cliente,
    }).catch(err => console.error('[inasistencias] registrar:', err.message));

    await Operation.create({
      complex_id:  complexId,
      tipo:        'cancelacion',
      descripcion: `No asistió: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio}-${booking.hora_fin}`,
      usuario_id:  req.user.id,
    });

    res.json({ message: 'Turno marcado como no asistido.', booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * PATCH /api/agenda/:complexId/asistio/:bookingId — SOLO administradores.
 * Corrige un turno mal marcado: de "no_asistido" vuelve a "confirmado" (asistió).
 */
async function correctNoShow(req, res) {
  try {
    const { complexId, bookingId } = req.params;
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Field, as: 'field', attributes: ['complex_id'] }],
    });
    if (!booking) return res.status(404).json({ message: 'Reserva no encontrada.' });
    if (String(booking.field?.complex_id) !== String(complexId)) {
      return res.status(403).json({ message: 'La reserva no pertenece a este complejo.' });
    }
    if (booking.estado !== 'no_asistido') {
      return res.status(409).json({ message: `El turno no está marcado como "no asistido" (está "${booking.estado}").` });
    }

    await booking.update({ estado: 'confirmado' });

    // Si con esta corrección ya no supera el límite, sale de la lista de incumplidos.
    await reevaluarTrasCorreccion(complexId, {
      userId:   booking.user_id,
      telefono: booking.telefono_cliente,
    }).catch(err => console.error('[inasistencias] reevaluar:', err.message));

    await Operation.create({
      complex_id:  complexId,
      tipo:        'ajuste',
      descripcion: `Corrección de asistencia: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio} → asistió`,
      usuario_id:  req.user.id,
    });

    res.json({ message: 'Turno corregido: marcado como asistido.', booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * GET /api/agenda/:complexId/conteo?date= — cantidad de turnos agendados por cancha ese día.
 * Cuenta los turnos NO cancelados (confirmados, pendientes, no asistidos).
 */
async function getConteoDia(req, res) {
  try {
    const { complexId } = req.params;
    const date = req.query.date || todayAR();
    const fields = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id'] });
    const fieldIds = fields.map(f => f.id);
    if (!fieldIds.length) return res.json({});

    const rows = await Booking.findAll({
      where: { field_id: { [Op.in]: fieldIds }, fecha: date, estado: { [Op.notIn]: ['cancelado', 'rechazado'] } },
      attributes: ['field_id', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['field_id'], raw: true,
    });
    const map = {};
    rows.forEach(r => { map[r.field_id] = parseInt(r.n); });
    res.json(map);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * GET /api/agenda/:complexId/incumplidos — admins.
 * Lista de jugadores incumplidos (activos) por reiteradas inasistencias.
 */
async function getIncumplidos(req, res) {
  try {
    const list = await listarIncumplidos(req.params.complexId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * PATCH /api/agenda/:complexId/incumplidos/:id/habilitar — SOLO complex_admin/general_admin.
 * Habilita manualmente al jugador (lo saca de la lista de incumplidos).
 */
async function habilitarIncumplido(req, res) {
  try {
    const { complexId, id } = req.params;
    const entry = await habilitarManual(complexId, id);
    if (!entry) return res.status(404).json({ message: 'No encontrado en la lista.' });
    res.json({ message: 'Jugador habilitado para agendar nuevamente.', entry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
//  TURNOS FIJOS (recurrentes)
// ─────────────────────────────────────────────────────────────
async function crearTurnoFijo(req, res) {
  try {
    const { complexId } = req.params;
    const { field_id, fecha, hora, duracion = 60, nombre_cliente, telefono_cliente, monto, metodo_pago } = req.body;
    if (!field_id || !fecha || !hora || !nombre_cliente?.trim()) {
      return res.status(400).json({ message: 'Faltan datos (cancha, fecha, hora y nombre).' });
    }
    const field = await Field.findOne({ where: { id: field_id, complex_id: complexId } });
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });

    const dia_semana = new Date(`${fecha}T12:00:00`).getDay();   // 0=Dom..6=Sáb
    const tpl = await RecurringBooking.create({
      complex_id: complexId, field_id, dia_semana,
      hora_inicio: hora, hora_fin: addMinutes(hora, duracion), duracion,
      nombre_cliente: nombre_cliente.trim(), telefono_cliente: telefono_cliente || null,
      monto: monto || 0, metodo_pago: metodo_pago || 'efectivo',
      desde_fecha: fecha, activo: true, created_by: req.user.id,
    });
    const generados = await recurring.materializar(tpl);
    res.status(201).json({ message: `Turno fijo creado (${generados} turnos generados).`, template: tpl, generados });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listTurnosFijos(req, res) {
  try {
    const list = await RecurringBooking.findAll({
      where: { complex_id: req.params.complexId, activo: true },
      include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador', 'deporte'] }],
      order: [['dia_semana', 'ASC'], ['hora_inicio', 'ASC']],
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function bajaTurnoFijo(req, res) {
  try {
    const r = await recurring.darDeBaja(req.params.complexId, req.params.id);
    if (!r) return res.status(404).json({ message: 'Turno fijo no encontrado' });
    res.json({ message: `Turno fijo dado de baja. Se eliminaron ${r.eliminadas} turnos futuros.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
//  CONSUMOS DEL TURNO + COBRO
// ─────────────────────────────────────────────────────────────
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

// Descuenta/repone stock de un producto y deja registro en el historial.
async function moverStock({ producto, tipo, motivo, cantidad, usuario_id, notas }, t) {
  const anterior = num(producto.stock);
  let resultante = tipo === 'entrada' ? anterior + cantidad : anterior - cantidad;
  if (resultante < 0) resultante = 0;
  await producto.update({ stock: resultante }, { transaction: t });
  await CantinaMovimiento.create({
    producto_id: producto.id, tipo, motivo, cantidad,
    stock_anterior: anterior, stock_resultante: resultante,
    usuario_id: usuario_id || null, notas: notas || null,
  }, { transaction: t });
}

// Carga un turno del complejo (valida pertenencia). Devuelve el booking o null.
async function findBookingDelComplejo(complexId, bookingId, opts = {}) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: Field, as: 'field', attributes: ['id', 'nombre', 'complex_id'] }],
    ...opts,
  });
  if (!booking) return { error: 404, message: 'Turno no encontrado.' };
  if (String(booking.field?.complex_id) !== String(complexId)) {
    return { error: 403, message: 'El turno no pertenece a este complejo.' };
  }
  return { booking };
}

// GET /:complexId/turno/:bookingId — detalle del turno (cancha + consumos + totales)
async function getTurnoDetalle(req, res) {
  try {
    const { complexId, bookingId } = req.params;
    const r = await findBookingDelComplejo(complexId, bookingId);
    if (r.error) return res.status(r.error).json({ message: r.message });
    const consumos = await BookingConsumo.findAll({ where: { booking_id: bookingId }, order: [['id', 'ASC']] });
    const totalConsumos = consumos.reduce((s, c) => s + num(c.subtotal), 0);
    const cancha = num(r.booking.monto);
    res.json({
      booking: {
        id: r.booking.id, nombre_cliente: r.booking.nombre_cliente, telefono_cliente: r.booking.telefono_cliente,
        fecha: r.booking.fecha, hora_inicio: r.booking.hora_inicio, hora_fin: r.booking.hora_fin,
        monto: cancha, metodo_pago: r.booking.metodo_pago, estado: r.booking.estado,
        cobrado: r.booking.cobrado, cobrado_at: r.booking.cobrado_at, cobro_detalle: r.booking.cobro_detalle,
        field: r.booking.field,
      },
      consumos,
      totales: { cancha, consumos: totalConsumos, total: cancha + totalConsumos },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// GET /:complexId/turno-productos — productos disponibles para agregar como consumo
async function listProductosDisponibles(req, res) {
  try {
    const { complexId } = req.params;
    const productos = await CantinaProducto.findAll({
      where: { complex_id: complexId, activo: true },
      attributes: ['id', 'nombre', 'precio_venta', 'stock', 'categoria', 'unidad_medida'],
      order: [['categoria', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(productos.map(p => ({ ...p.toJSON(), disponible: num(p.stock) > 0 })));
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// POST /:complexId/turno/:bookingId/consumos — agrega uno o varios productos al turno
// (descuenta stock; el ingreso a caja se difiere al cobro).
async function agregarConsumos(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, bookingId } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback(); return res.status(400).json({ message: 'No hay productos para agregar.' });
    }
    const r = await findBookingDelComplejo(complexId, bookingId, { transaction: t });
    if (r.error) { await t.rollback(); return res.status(r.error).json({ message: r.message }); }
    if (r.booking.cobrado) { await t.rollback(); return res.status(409).json({ message: 'El turno ya fue cobrado. No se pueden agregar consumos.' }); }
    if (['cancelado', 'rechazado'].includes(r.booking.estado)) {
      await t.rollback(); return res.status(409).json({ message: `El turno está "${r.booking.estado}".` });
    }

    for (const it of items) {
      const cant = num(it.cantidad);
      if (cant <= 0) { await t.rollback(); return res.status(400).json({ message: 'Cantidad inválida.' }); }
      const producto = await CantinaProducto.findOne({ where: { id: it.producto_id, complex_id: complexId }, transaction: t, lock: true });
      if (!producto)        { await t.rollback(); return res.status(404).json({ message: `Producto ${it.producto_id} no encontrado.` }); }
      if (!producto.activo) { await t.rollback(); return res.status(409).json({ message: `"${producto.nombre}" está inactivo.` }); }
      if (cant > num(producto.stock)) { await t.rollback(); return res.status(409).json({ message: `Sin stock suficiente de "${producto.nombre}" (hay ${num(producto.stock)}).` }); }

      const precio = num(producto.precio_venta);
      // Si ya existe una línea del mismo producto, acumular la cantidad.
      const existente = await BookingConsumo.findOne({ where: { booking_id: bookingId, producto_id: producto.id }, transaction: t });
      if (existente) {
        const nuevaCant = num(existente.cantidad) + cant;
        await existente.update({ cantidad: nuevaCant, precio_unitario: precio, subtotal: precio * nuevaCant }, { transaction: t });
      } else {
        await BookingConsumo.create({
          booking_id: bookingId, producto_id: producto.id, nombre_producto: producto.nombre,
          cantidad: cant, precio_unitario: precio, subtotal: precio * cant, usuario_id: req.user.id,
        }, { transaction: t });
      }
      await moverStock({ producto, tipo: 'salida', motivo: 'venta', cantidad: cant, usuario_id: req.user.id, notas: `Consumo turno #${bookingId}` }, t);
    }

    await t.commit();
    const consumos = await BookingConsumo.findAll({ where: { booking_id: bookingId }, order: [['id', 'ASC']] });
    const totalConsumos = consumos.reduce((s, c) => s + num(c.subtotal), 0);
    res.status(201).json({ message: 'Consumos agregados.', consumos, total_consumos: totalConsumos });
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

// DELETE /:complexId/turno/:bookingId/consumos/:consumoId — quita un consumo (repone stock)
async function quitarConsumo(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, bookingId, consumoId } = req.params;
    const r = await findBookingDelComplejo(complexId, bookingId, { transaction: t });
    if (r.error) { await t.rollback(); return res.status(r.error).json({ message: r.message }); }
    if (r.booking.cobrado) { await t.rollback(); return res.status(409).json({ message: 'El turno ya fue cobrado.' }); }

    const consumo = await BookingConsumo.findOne({ where: { id: consumoId, booking_id: bookingId }, transaction: t });
    if (!consumo) { await t.rollback(); return res.status(404).json({ message: 'Consumo no encontrado.' }); }

    const producto = await CantinaProducto.findByPk(consumo.producto_id, { transaction: t, lock: true });
    if (producto) await moverStock({ producto, tipo: 'entrada', motivo: 'devolucion', cantidad: num(consumo.cantidad), usuario_id: req.user.id, notas: `Quita consumo turno #${bookingId}` }, t);
    await consumo.destroy({ transaction: t });

    await t.commit();
    const consumos = await BookingConsumo.findAll({ where: { booking_id: bookingId }, order: [['id', 'ASC']] });
    const totalConsumos = consumos.reduce((s, c) => s + num(c.subtotal), 0);
    res.json({ message: 'Consumo eliminado.', consumos, total_consumos: totalConsumos });
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

// POST /:complexId/turno/:bookingId/cobrar — finaliza el cobro del turno.
// Registra en caja el costo de cancha + consumos (recién acá impactan la caja).
async function cobrarTurno(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId, bookingId } = req.params;
    const { jugadores = 1, pagos = [], metodo_pago } = req.body;

    const r = await findBookingDelComplejo(complexId, bookingId, { transaction: t });
    if (r.error) { await t.rollback(); return res.status(r.error).json({ message: r.message }); }
    const booking = r.booking;
    if (booking.cobrado) { await t.rollback(); return res.status(409).json({ message: 'El turno ya fue cobrado.' }); }
    if (['cancelado', 'rechazado'].includes(booking.estado)) {
      await t.rollback(); return res.status(409).json({ message: `El turno está "${booking.estado}".` });
    }

    const consumos = await BookingConsumo.findAll({ where: { booking_id: bookingId }, transaction: t });
    const totalConsumos = consumos.reduce((s, c) => s + num(c.subtotal), 0);
    const cancha = num(booking.monto);
    const total = cancha + totalConsumos;
    const metodoValido = m => ['efectivo', 'transferencia', 'mercadopago', 'tarjeta'].includes(m);
    const metodo = metodoValido(metodo_pago) ? metodo_pago : (booking.metodo_pago || 'efectivo');
    const nJug = Math.max(1, parseInt(jugadores) || 1);
    const por_jugador = Math.round((total / nJug) * 100) / 100;
    const canchaShare = cancha / nJug;

    // Normaliza los pagos por jugador: soporta [bool] (versión previa) y
    // [{ pagado, metodo }]. Si no se envía nada, se asume que todos pagaron con
    // el método global (comportamiento previo: cobro del total).
    const sinDetalle = !Array.isArray(pagos) || pagos.length === 0;
    const pagosNorm = Array.from({ length: nJug }, (_, i) => {
      if (sinDetalle) return { pagado: true, metodo };
      const p = pagos[i];
      if (typeof p === 'boolean') return { pagado: p, metodo };
      const pagado = !!(p && p.pagado);
      const m = p && metodoValido(p.metodo) ? p.metodo : metodo;
      return { pagado, metodo: m };
    });
    const pagadoTotal = Math.round(pagosNorm.filter(p => p.pagado).length * por_jugador * 100) / 100;

    // Consumos → venta de cantina (para reportes y caja). El stock ya se descontó
    // al agregarlos, por eso NO se generan movimientos nuevos acá.
    if (consumos.length > 0) {
      const venta = await CantinaVenta.create({
        complex_id: complexId, subtotal: totalConsumos, descuento: 0, total: totalConsumos,
        metodo_pago: metodoValido(metodo) && metodo !== 'efectivo' ? metodo : 'efectivo',
        estado: 'completada', usuario_id: req.user.id, notas: `Consumos turno #${booking.id} — ${booking.nombre_cliente}`,
      }, { transaction: t });
      for (const c of consumos) {
        await CantinaDetalleVenta.create({
          venta_id: venta.id, producto_id: c.producto_id, nombre_producto: c.nombre_producto,
          cantidad: num(c.cantidad), precio_unitario: num(c.precio_unitario), descuento_linea: 0, subtotal: num(c.subtotal),
        }, { transaction: t });
      }
      const txC = await caja.registrarEnCaja(complexId, {
        tipo: 'ingreso', concepto: `Consumos turno #${booking.id}`, monto: totalConsumos,
        metodo_pago: metodo, categoria: 'cantina', usuario_id: req.user.id, agenda_id: booking.id,
      }, t);
      if (txC) await venta.update({ cash_transaction_id: txC.id }, { transaction: t });
    }

    // Costo de cancha → ingreso de caja categoría 'turno', DESGLOSADO POR MÉTODO.
    // La porción de cada jugador se atribuye al método con que pagó (los no pagados
    // se imputan al método global para que la suma cubra el costo total de cancha).
    if (cancha > 0) {
      const porMetodo = {};
      pagosNorm.forEach(p => {
        const m = p.pagado ? p.metodo : metodo;
        porMetodo[m] = (porMetodo[m] || 0) + canchaShare;
      });
      const labels = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta' };
      for (const [m, monto] of Object.entries(porMetodo)) {
        const montoR = Math.round(monto * 100) / 100;
        if (montoR <= 0) continue;
        await caja.registrarEnCaja(complexId, {
          tipo: 'ingreso',
          concepto: `Turno ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio} (${labels[m] || m})`,
          monto: montoR, metodo_pago: m, categoria: 'turno', usuario_id: req.user.id, agenda_id: booking.id,
        }, t);
      }
    }

    await booking.update({
      cobrado: true,
      cobrado_at: new Date(),
      metodo_pago: metodo,
      cobro_detalle: { jugadores: nJug, por_jugador, total, cancha, consumos: totalConsumos, pagado: pagadoTotal, pagos: pagosNorm },
    }, { transaction: t });

    await Operation.create({
      complex_id: complexId, tipo: 'pago',
      descripcion: `Cobro turno: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio} — $${total} (${nJug} jug., pagado $${pagadoTotal})`,
      usuario_id: req.user.id, monto: total,
    }, { transaction: t });

    await t.commit();
    res.json({ message: 'Turno cobrado.', total, por_jugador, jugadores: nJug, pagado: pagadoTotal });
  } catch (err) { await t.rollback(); res.status(500).json({ message: err.message }); }
}

module.exports = { getSlotsForField, reserveSlot, cancelBooking, getPendingBookings, confirmBooking, rejectBooking, markNoShow, correctNoShow, getConteoDia, getIncumplidos, habilitarIncumplido, crearTurnoFijo, listTurnosFijos, bajaTurnoFijo, getTurnoDetalle, listProductosDisponibles, agregarConsumos, quitarConsumo, cobrarTurno, getByComplex, create, update, remove };
