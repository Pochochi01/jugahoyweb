const { Op } = require('sequelize');
const { Agenda, Field, User, Operation, TimeSlot, Booking, Notification, Complex, sequelize } = require('../models');
const notifService = require('./../services/notification.service');

// ── utilidades ────────────────────────────────────────────────────────────────

// Genera slots de 30 min entre apertura y cierre de la cancha
function generateSlotsForField(horaApertura = '08:00', horaCierre = '02:00') {
  const startH = parseInt(horaApertura.split(':')[0]);
  const closeH = parseInt(horaCierre.split(':')[0]);
  const endH   = closeH < startH ? closeH + 24 : closeH;
  const slots  = [];
  for (let h = startH; h < endH; h++) {
    const d = h % 24;
    slots.push(`${String(d).padStart(2, '0')}:00`);
    slots.push(`${String(d).padStart(2, '0')}:30`);
  }
  return slots;
}

// Envuelve correctamente la medianoche: 23:30 + 30min = 00:00
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
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Admin puede ver slots de canchas inactivas (para consulta histórica)
    const field = await Field.findOne({ where: { id: fieldId, complex_id: complexId } });
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });

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
        hora_fin:         addMinutes(hora, 30),
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

    const slotsNecesarios = Math.ceil(duracion / 30);
    const horasAReservar  = [];
    for (let i = 0; i < slotsNecesarios; i++) {
      horasAReservar.push(addMinutes(hora, i * 30));
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

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: TimeSlot, as: 'timeSlots' }],
      transaction: t,
    });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada' });
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
        fecha:    { [Op.gte]: new Date().toISOString().split('T')[0] },
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

module.exports = { getSlotsForField, reserveSlot, cancelBooking, getPendingBookings, confirmBooking, rejectBooking, getByComplex, create, update, remove };
