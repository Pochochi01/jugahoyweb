const { Op } = require('sequelize');
const { Complex, Field, TimeSlot, Booking, Operation, User, Notification, sequelize } = require('../models');
const { validateProvinciaLocalidad } = require('./localidadesController');
const notifService = require('../services/notification.service');

// ── helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

// Nunca exponer credenciales del complejo al público. Devuelve un flag booleano
// `mp_enabled` (si tiene MercadoPago configurado) en lugar del token.
function sanitizeComplex(complex) {
  if (!complex) return complex;
  const json = typeof complex.toJSON === 'function' ? complex.toJSON() : { ...complex };
  json.mp_enabled = !!json.mercadopago_token;
  delete json.mercadopago_token;
  delete json.cuentas_bancarias;
  return json;
}

// Rango máximo del complejo: 08:00 a 02:00 (madrugada)
function generateSlots(start = 8, end = 26) {
  const s = [];
  for (let h = start; h < end; h++) {
    const d = h % 24;
    s.push(`${String(d).padStart(2, '0')}:00`);
    s.push(`${String(d).padStart(2, '0')}:30`);
  }
  return s;
}

function addMinutes(hora, min) {
  const [h, m] = hora.split(':').map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Verifica si una hora está dentro del horario de actividad de una cancha
function isWithinFieldHours(hora, horaApertura = '08:00', horaCierre = '02:00') {
  const startH = parseInt(horaApertura.split(':')[0]);
  const closeH = parseInt(horaCierre.split(':')[0]);
  const endH   = closeH < startH ? closeH + 24 : closeH;
  const [h]    = hora.split(':').map(Number);
  const slotH  = h < startH ? h + 24 : h;
  return slotH >= startH && slotH < endH;
}

// ── listado público ───────────────────────────────────────────────────────────
async function getComplexes(req, res) {
  try {
    // Filtros opcionales: provincia, ciudad y texto libre (q). Se combinan con AND.
    const provincia = (req.query.provincia || '').trim();
    const ciudad    = (req.query.ciudad    || '').trim();
    const q         = (req.query.q         || '').trim();

    const where = { activo: true };
    if (provincia) where.provincia = provincia;
    if (ciudad)    where.ciudad    = ciudad;
    if (q)         where.nombre    = { [Op.like]: `%${q}%` };

    const complexes = await Complex.findAll({
      where,
      include: [{ model: Field, as: 'fields', where: { activa: true }, required: false }],
      order: [['nombre', 'ASC']],
    });
    res.json(complexes.map(sanitizeComplex));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getComplex(req, res) {
  try {
    const complex = await Complex.findOne({
      where: { id: req.params.id, activo: true },
      include: [
        { model: Field, as: 'fields', where: { activa: true }, required: false },
        { model: User,  as: 'owner',  attributes: ['nombre', 'apellido', 'email'] },
      ],
    });
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });
    res.json(sanitizeComplex(complex));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getComplexSlots(req, res) {
  try {
    const { id } = req.params;
    const date = req.query.date || today();

    const complex = await Complex.findOne({
      where: { id, activo: true },
      include: [{ model: Field, as: 'fields', where: { activa: true }, required: false }],
    });
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });

    const fields = complex.fields || [];
    if (fields.length === 0) return res.json({ complex, date, slots: [] });

    const fieldIds = fields.map(f => f.id);
    const occupiedSlots = await TimeSlot.findAll({
      where: { field_id: { [Op.in]: fieldIds }, fecha: date, estado: 'ocupado' },
      attributes: ['field_id', 'hora'],
    });
    const occupiedSet = new Set(occupiedSlots.map(s => `${s.field_id}:${s.hora}`));

    const now = new Date();
    const grouped = generateSlots().map(hora => {
      // Slots 00:00-07:59 pertenecen al día siguiente del calendario
      const [h] = hora.split(':').map(Number);
      const slotDt = new Date(`${date}T${hora}:00`);
      if (h < 8) slotDt.setDate(slotDt.getDate() + 1);
      if (slotDt <= now) return null;
      const freeFields = fields
        .filter(f =>
          f.activa !== false &&
          isWithinFieldHours(hora, f.hora_apertura || '08:00', f.hora_cierre || '02:00') &&
          !occupiedSet.has(`${f.id}:${hora}`)
        )
        .map(f => ({
          id: f.id, nombre: f.nombre, deporte: f.deporte,
          techada: f.techada, dimensiones: f.dimensiones,
          duraciones_permitidas: f.duraciones_permitidas || [60],
          precios_por_duracion:  f.precios_por_duracion  || {},
          precio_base: f.precio_base,
          sena_monto: f.sena_monto,   // para ofrecer "pagar seña" en el modal
        }));
      if (freeFields.length === 0) return null;
      return { hora, hora_fin: addMinutes(hora, 30), fields: freeFields };
    }).filter(Boolean);

    res.json({ complex: sanitizeComplex(complex), date, slots: grouped });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── reserva del player ────────────────────────────────────────────────────────
async function playerReserve(req, res) {
  const t = await sequelize.transaction();
  try {
    const { complexId } = req.params;
    const {
      field_id, fecha, hora, duracion = 60,
      nombre_cliente, telefono_cliente, email_cliente,
      metodo_pago, monto, notas,
      tipo_pago,   // 'seña' | 'total' (MercadoPago) | 'complejo' (pago en sitio)
    } = req.body;

    if (!field_id || !fecha || !hora) {
      await t.rollback();
      return res.status(400).json({ message: 'Faltan datos requeridos: field_id, fecha, hora' });
    }

    // Verificar que la cancha pertenece al complejo
    const field = await Field.findOne({ where: { id: field_id, complex_id: complexId, activa: true } });
    if (!field) {
      await t.rollback();
      return res.status(404).json({ message: 'Cancha no encontrada en este complejo' });
    }

    // Usar datos del usuario si no vienen en el body
    const clientName  = (nombre_cliente?.trim()  || `${req.user.nombre} ${req.user.apellido}`).trim();
    const clientPhone = telefono_cliente?.trim()  || req.user.telefono || '';

    const slotsNecesarios = Math.ceil(duracion / 30);
    const horasAReservar  = [];
    for (let i = 0; i < slotsNecesarios; i++) horasAReservar.push(addMinutes(hora, i * 30));
    const horaFin = addMinutes(hora, duracion);

    // Verificar disponibilidad con lock
    const ocupados = await TimeSlot.findAll({
      where: { field_id, fecha, hora: { [Op.in]: horasAReservar }, estado: 'ocupado' },
      transaction: t, lock: true,
    });
    if (ocupados.length > 0) {
      await t.rollback();
      const h = ocupados.map(s => s.hora).join(', ');
      return res.status(409).json({ message: `El horario ${h} ya está ocupado. Elegí otra franja.` });
    }

    // Ciclo de vida según el pago elegido:
    //  - MercadoPago (seña/total) → 'pendiente_pago': retiene el slot mientras paga;
    //    la reconciliación (webhook/sync) lo confirma o libera.
    //  - complejo / otros         → 'pendiente': a pagar en sitio / confirmar por admin.
    const esMP          = tipo_pago === 'seña' || tipo_pago === 'total';
    const estadoInicial = esMP ? 'pendiente_pago' : 'pendiente';
    const metodoFinal   = esMP ? 'mercadopago'
                        : tipo_pago === 'complejo' ? 'efectivo'
                        : (metodo_pago || 'efectivo');

    const booking = await Booking.create({
      field_id, fecha,
      hora_inicio: hora, hora_fin: horaFin, duracion,
      nombre_cliente:   clientName,
      telefono_cliente: clientPhone,
      email_cliente,
      metodo_pago: metodoFinal,
      tipo_pago:   tipo_pago || null,
      monto,
      notas,
      estado:     estadoInicial,
      user_id:    req.user.id,
      created_by: req.user.id,
    }, { transaction: t });

    for (const h of horasAReservar) {
      await TimeSlot.upsert(
        { field_id, fecha, hora: h, estado: 'ocupado', booking_id: booking.id },
        { transaction: t }
      );
    }

    await Operation.create({
      complex_id:  complexId,
      tipo:        'reserva',
      descripcion: `Solicitud web (pendiente): ${clientName} — ${fecha} ${hora}→${horaFin} (${duracion}min)`,
      usuario_id:  req.user.id,
      monto:       monto || 0,
    }, { transaction: t });

    // Notificar al dueño del complejo para que confirme o rechace
    const complex = await Complex.findByPk(complexId, { attributes: ['owner_id', 'nombre'], transaction: t });
    if (complex?.owner_id) {
      await Notification.create({
        user_id:    complex.owner_id,
        tipo:       'nueva_reserva',
        titulo:     '🔔 Nueva solicitud de turno',
        mensaje:    `${clientName} solicita un turno para el ${fecha} de ${hora} a ${horaFin} (${duracion} min). Entrá a la Agenda para confirmar o rechazar.`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await t.commit();

    // Push al dueño del complejo (best-effort, fuera de la transacción)
    if (complex?.owner_id) {
      notifService.sendToUserAsync(complex.owner_id, {
        tipo:   'reserva',
        titulo: '🔔 Nueva solicitud de turno',
        body:   `${clientName} pidió ${fecha} ${hora}–${horaFin} en ${field.nombre}.`,
        url:    '/dashboard',
        data:   { cancha_id: field.id, cancha_nombre: field.nombre, fecha, hora, booking_id: booking.id },
        actions: [
          { action: 'confirmar', title: 'Confirmar reserva' },
          { action: 'rechazar',  title: 'Rechazar turno' },
        ],
      });
    }

    res.status(201).json({ booking });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

// ── mis turnos ────────────────────────────────────────────────────────────────
async function getMyBookings(req, res) {
  try {
    const bookings = await Booking.findAll({
      where: { user_id: req.user.id },
      include: [{
        model: Field, as: 'field',
        include: [{ model: Complex, as: 'complex', attributes: ['id', 'nombre', 'ciudad', 'direccion'] }],
      }],
      order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']],
    });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function cancelMyBooking(req, res) {
  const t = await sequelize.transaction();
  try {
    const booking = await Booking.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: TimeSlot, as: 'timeSlots' },
        { model: Field, as: 'field', attributes: ['id', 'nombre'],
          include: [{ model: Complex, as: 'complex', attributes: ['owner_id', 'nombre'] }] },
      ],
      transaction: t,
    });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }
    if (booking.estado === 'cancelado') {
      await t.rollback();
      return res.status(400).json({ message: 'La reserva ya fue cancelada' });
    }
    if (new Date(`${booking.fecha}T${booking.hora_inicio}:00`) <= new Date()) {
      await t.rollback();
      return res.status(400).json({ message: 'No podés cancelar un turno que ya comenzó o finalizó' });
    }

    await Promise.all(
      booking.timeSlots.map(s => s.update({ estado: 'libre', booking_id: null }, { transaction: t }))
    );
    await booking.update({ estado: 'cancelado' }, { transaction: t });
    await t.commit();

    // Push al dueño: el jugador canceló un turno
    const ownerId = booking.field?.complex?.owner_id;
    if (ownerId) {
      notifService.sendToUserAsync(ownerId, {
        tipo:   'cancelacion',
        titulo: 'Turno cancelado por el jugador',
        body:   `${booking.nombre_cliente} canceló el ${booking.fecha} ${booking.hora_inicio}–${booking.hora_fin} en ${booking.field?.nombre}.`,
        url:    '/dashboard',
        data:   { cancha_id: booking.field_id, cancha_nombre: booking.field?.nombre, fecha: booking.fecha, hora: booking.hora_inicio, booking_id: booking.id },
      });
    }

    res.json({ message: 'Turno cancelado exitosamente', booking });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

// ── Registro de complejo + usuario en un solo paso (sin autenticación previa) ──
async function registerComplex(req, res) {
  const t = await sequelize.transaction();
  try {
    const {
      // datos del titular (Step 1)
      titular_nombre, titular_apellido, titular_email, titular_telefono, password,
      // datos del complejo (Step 2)
      nombre, descripcion, direccion, ciudad, provincia,
      telefono: compTelefono, email: compEmail, prestaciones,
      // canchas (Step 3)
      fields = [],
    } = req.body;

    if (!titular_email || !password || !nombre) {
      await t.rollback();
      return res.status(400).json({ message: 'Email, contraseña y nombre del complejo son obligatorios.' });
    }

    // Validación de ubicación: provincia y ciudad obligatorias y coherentes
    // entre sí según el catálogo de localidades (evita pares inconsistentes).
    const locCheck = await validateProvinciaLocalidad(provincia, ciudad);
    if (!locCheck.ok) {
      await t.rollback();
      return res.status(400).json({ message: locCheck.reason });
    }

    const bcrypt  = require('bcryptjs');
    const jwt     = require('jsonwebtoken');

    // Si el email ya existe, verificar contraseña y reutilizar la cuenta
    let user = await User.findOne({ where: { email: titular_email } });

    if (user) {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        await t.rollback();
        return res.status(401).json({
          message: 'El email ya está registrado con otra contraseña. Iniciá sesión primero y luego adherí el complejo.',
        });
      }
      if (user.rol === 'player') {
        await user.update({ rol: 'complex_admin' }, { transaction: t });
      }
    } else {
      const hash = await bcrypt.hash(password, 10);
      user = await User.create({
        nombre:    titular_nombre,
        apellido:  titular_apellido,
        email:     titular_email,
        telefono:  titular_telefono,
        password:  hash,
        rol:       'complex_admin',
        activo:    true,
      }, { transaction: t });
    }

    // Crear el complejo vinculado al usuario
    const complex = await Complex.create({
      nombre, descripcion, direccion, ciudad, provincia,
      telefono: compTelefono, email: compEmail,
      prestaciones, owner_id: user.id, activo: true,
    }, { transaction: t });

    // Crear las canchas
    for (const f of fields) {
      const { id: _id, ...fieldData } = f; // descartar el id local del wizard
      await Field.create({ ...fieldData, complex_id: complex.id }, { transaction: t });
    }

    await t.commit();

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password: _pw, ...safeUser } = user.toJSON();
    res.status(201).json({ token, user: safeUser, complex });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getComplexes, getComplex, getComplexSlots, playerReserve, getMyBookings, cancelMyBooking, registerComplex };
