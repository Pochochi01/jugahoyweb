const { Op } = require('sequelize');
const { Complex, Field, TimeSlot, Booking, Operation, User, Notification, sequelize } = require('../models');
const { validateProvinciaLocalidad } = require('./localidadesController');
const notifService = require('../services/notification.service');
const waitlist = require('../services/waitlistService');
const { todayAR } = require('../utils/time');
const { evaluarCancelacion, yaComenzo, MSG_YA_COMENZO } = require('../utils/cancelPolicy');
const { evaluarBloqueoInasistencias } = require('../utils/inasistencias');

// ── helpers ───────────────────────────────────────────────────────────────────
// Fecha "hoy" en Argentina (GMT-3), no en UTC.
function today() { return todayAR(); }

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

// Rango máximo del complejo: 08:00 a 02:00 (madrugada). Slots de 60 min (hora en punto).
function generateSlots(start = 8, end = 26) {
  const s = [];
  for (let h = start; h < end; h++) {
    const d = h % 24;
    s.push(`${String(d).padStart(2, '0')}:00`);
  }
  return s;
}

// Grilla de 60 min (hora en punto) propia de una cancha, entre su apertura y su cierre.
// Maneja el cruce de medianoche (cierre 02:00 = 2am del día siguiente).
function fieldGrid(apertura = '08:00', cierre = '02:00') {
  const startH = parseInt(apertura.split(':')[0]);
  const closeH = parseInt(cierre.split(':')[0]);
  const endH   = closeH <= startH ? closeH + 24 : closeH;
  const arr = [];
  for (let h = startH; h < endH; h++) {
    const d = h % 24;
    arr.push(`${String(d).padStart(2, '0')}:00`);
  }
  return arr;
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
      return { hora, hora_fin: addMinutes(hora, 60), count: freeFields.length, fields: freeFields };
    }).filter(Boolean);

    // ── Agrupado POR CANCHA: rango horario + turnos disponibles ──
    // Para cada cancha, calcula sus horarios de inicio libres (alineados a su
    // duración de turno) dentro de su rango de apertura/cierre.
    const isFreeAt = (fieldId, hora) => {
      const [hh] = hora.split(':').map(Number);
      const slotDt = new Date(`${date}T${hora}:00`);
      if (hh < 8) slotDt.setDate(slotDt.getDate() + 1);
      return slotDt > now && !occupiedSet.has(`${fieldId}:${hora}`);
    };

    const canchas = fields.map(f => {
      const apertura = f.hora_apertura || '08:00';
      const cierre   = f.hora_cierre   || '02:00';
      const turno    = parseInt(f.duracion_turno) || 60;
      const step     = Math.max(1, Math.round(turno / 60)); // slots de 60 min por turno
      const grid     = fieldGrid(apertura, cierre);

      const starts = [];
      for (let i = 0; i + step <= grid.length; i += step) {
        const chunk = grid.slice(i, i + step);
        if (chunk.every(h => isFreeAt(f.id, h))) {
          starts.push({ hora: chunk[0], hora_fin: addMinutes(chunk[0], turno) });
        }
      }

      return {
        id: f.id, nombre: f.nombre, deporte: f.deporte,
        techada: f.techada, dimensiones: f.dimensiones,
        precio_base: f.precio_base,
        precios_por_duracion:  f.precios_por_duracion  || {},
        duraciones_permitidas: f.duraciones_permitidas || [60],
        sena_monto: f.sena_monto,
        duracion_turno: turno,
        rango: { desde: apertura, hasta: cierre, label: `de ${apertura.slice(0, 2)} a ${cierre.slice(0, 2)} hs` },
        count: starts.length,
        starts,
      };
    }).filter(c => c.count > 0);

    // JSON normalizado: dos agrupaciones listas para el frontend.
    res.json({ complex: sanitizeComplex(complex), date, slots: grouped, canchas });
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

    // Bloqueo por reiteradas inasistencias (2 en un mes / 3 en 2+ meses).
    const bloqueo = await evaluarBloqueoInasistencias(complexId, { userId: req.user.id, telefono: clientPhone });
    if (bloqueo.blocked) {
      await t.rollback();
      const contacto = field.whatsapp_contacto
        || (await Complex.findByPk(complexId, { attributes: ['whatsapp_contacto'] }))?.whatsapp_contacto
        || null;
      return res.status(403).json({
        message: bloqueo.mensaje,
        blocked_inasistencias: true,
        whatsapp: contacto ? String(contacto).replace(/\D/g, '') : null,
      });
    }

    const slotsNecesarios = Math.ceil(duracion / 60);
    const horasAReservar  = [];
    for (let i = 0; i < slotsNecesarios; i++) horasAReservar.push(addMinutes(hora, i * 60));
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
    //  - complejo / otros         → 'confirmado': la reserva web NO requiere que el
    //    administrador/colaborador la confirme (queda agendada de inmediato).
    const esMP          = tipo_pago === 'seña' || tipo_pago === 'total';
    const estadoInicial = esMP ? 'pendiente_pago' : 'confirmado';
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

    const esConfirmada = estadoInicial === 'confirmado';
    await Operation.create({
      complex_id:  complexId,
      tipo:        'reserva',
      descripcion: `${esConfirmada ? 'Reserva web confirmada' : 'Solicitud web (pago pendiente)'}: ${clientName} — ${fecha} ${hora}→${horaFin} (${duracion}min)`,
      usuario_id:  req.user.id,
      monto:       monto || 0,
    }, { transaction: t });

    // Avisar al dueño del complejo (informativo; la reserva web NO requiere confirmación)
    const complex = await Complex.findByPk(complexId, { attributes: ['owner_id', 'nombre'], transaction: t });
    if (complex?.owner_id) {
      await Notification.create({
        user_id:    complex.owner_id,
        tipo:       'nueva_reserva',
        titulo:     esConfirmada ? '✅ Nuevo turno reservado' : '🔔 Nueva reserva (pago pendiente)',
        mensaje:    esConfirmada
          ? `${clientName} reservó un turno el ${fecha} de ${hora} a ${horaFin} (${duracion} min). Ya quedó agendado.`
          : `${clientName} inició una reserva para el ${fecha} de ${hora} a ${horaFin} (${duracion} min), a la espera del pago.`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await t.commit();

    // Push al dueño del complejo (best-effort, fuera de la transacción)
    if (complex?.owner_id) {
      notifService.sendToUserAsync(complex.owner_id, {
        tipo:   'reserva',
        titulo: esConfirmada ? '✅ Nuevo turno reservado' : '🔔 Nueva reserva (pago pendiente)',
        body:   `${clientName} — ${fecha} ${hora}–${horaFin} en ${field.nombre}.`,
        url:    '/dashboard',
        data:   { cancha_id: field.id, cancha_nombre: field.nombre, fecha, hora, booking_id: booking.id },
      });
    }

    res.status(201).json({ booking });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
}

// ── mis turnos ────────────────────────────────────────────────────────────────
/**
 * GET /api/public/complexes/:complexId/bloqueo-inasistencias — requiere auth.
 * Verifica, ANTES de reservar, si el jugador está bloqueado por inasistencias.
 * Devuelve { blocked, message, whatsapp } para mostrar el aviso al identificarlo.
 */
async function checkInasistencias(req, res) {
  try {
    const { complexId } = req.params;
    const bloqueo = await evaluarBloqueoInasistencias(complexId, {
      userId: req.user.id, telefono: req.user.telefono,
    });
    let whatsapp = null;
    if (bloqueo.blocked) {
      const complex = await Complex.findByPk(complexId, { attributes: ['whatsapp_contacto'] });
      whatsapp = complex?.whatsapp_contacto ? String(complex.whatsapp_contacto).replace(/\D/g, '') : null;
    }
    res.json({ blocked: bloqueo.blocked, message: bloqueo.mensaje, whatsapp });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getMyBookings(req, res) {
  try {
    // Unifica ambos canales:
    //  - Web: reservas con user_id = este jugador.
    //  - WhatsApp: reservas cuyo telefono_cliente coincide (últimos 10 dígitos)
    //    con el WhatsApp de la cuenta — formato-agnóstico (+549 / 54 / 0381 / 15).
    const telDigits = String(req.user.telefono || '').replace(/\D/g, '');
    const sig = telDigits.length >= 8 ? telDigits.slice(-10) : null;
    const orConds = [{ user_id: req.user.id }];
    if (sig) {
      orConds.push({ telefono_cliente: { [Op.like]: `%${sig}%` } });
    }

    const bookings = await Booking.findAll({
      where: { [Op.or]: orConds },
      include: [{
        model: Field, as: 'field',
        include: [{ model: Complex, as: 'complex', attributes: ['id', 'nombre', 'ciudad', 'direccion', 'whatsapp_contacto'] }],
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
    // Unifica ambos canales: el turno es del jugador si user_id coincide (web) o si
    // su telefono_cliente coincide con el WhatsApp de la cuenta (turno por WhatsApp).
    const telDigits = String(req.user.telefono || '').replace(/\D/g, '');
    const sig = telDigits.length >= 8 ? telDigits.slice(-10) : null;
    const orDueno = [{ user_id: req.user.id }];
    if (sig) orDueno.push({ telefono_cliente: { [Op.like]: `%${sig}%` } });

    const booking = await Booking.findOne({
      where: { id: req.params.id, [Op.or]: orDueno },
      include: [
        { model: TimeSlot, as: 'timeSlots' },
        { model: Field, as: 'field', attributes: ['id', 'nombre', 'complex_id', 'deporte'],
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
    // Un turno que ya comenzó o pasó no puede cancelarse.
    if (yaComenzo(booking)) {
      await t.rollback();
      return res.status(400).json({ message: MSG_YA_COMENZO });
    }
    // Regla de cancelación: 2 h de anticipación, con gracia de 15 min para
    // reservas de último momento. Ver utils/cancelPolicy.js.
    const regla = evaluarCancelacion(booking);
    if (!regla.allowed) {
      await t.rollback();
      return res.status(400).json({ message: regla.mensaje });
    }

    await Promise.all(
      booking.timeSlots.map(s => s.update({ estado: 'libre', booking_id: null }, { transaction: t }))
    );
    await booking.update({ estado: 'cancelado' }, { transaction: t });

    const complexId = booking.field?.complex_id;
    const ownerId   = booking.field?.complex?.owner_id;
    // Horas liberadas + deporte para avisar a la lista de espera tras el commit.
    const horasLiberadas = booking.timeSlots.map(s => s.hora);
    const deporteCancha = booking.field?.deporte;

    // Registrar la operación → visible en la pestaña "Operaciones" del dashboard.
    await Operation.create({
      complex_id:  complexId,
      tipo:        'cancelacion',
      origen:      'web',
      descripcion: `Cancelación del jugador: ${booking.nombre_cliente} — ${booking.fecha} ${booking.hora_inicio}-${booking.hora_fin}`,
      agenda_id:   booking.id,
      usuario_id:  req.user.id,
    }, { transaction: t });

    // Notificación in-app al dueño (campanita del dashboard)
    if (ownerId) {
      await Notification.create({
        user_id:    ownerId,
        tipo:       'reserva_cancelada',
        titulo:     '🚫 Turno cancelado por el jugador',
        mensaje:    `${booking.nombre_cliente} canceló su turno del ${booking.fecha} de ${booking.hora_inicio} a ${booking.hora_fin} en ${booking.field?.nombre || 'la cancha'}.`,
        booking_id: booking.id,
      }, { transaction: t });
    }

    await t.commit();

    // Lista de espera: avisar a los inscriptos por cada hora liberada (best-effort).
    for (const hora of horasLiberadas) {
      waitlist.notificarLiberado(complexId, { field_id: booking.field_id, fecha: booking.fecha, hora, deporte: deporteCancha })
        .catch(err => console.error('[waitlist] notificar:', err.message));
    }

    // Push al dueño: el jugador canceló un turno
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

// ── LISTA DE ESPERA (web) ─────────────────────────────────────────────────────

// Inicio del turno como Date (madrugada = día siguiente del calendario).
function inicioTurno(fecha, hora) {
  const [h] = String(hora).split(':').map(Number);
  const dt = new Date(`${fecha}T${hora}:00`);
  if (h < 8) dt.setDate(dt.getDate() + 1);
  return dt;
}

/**
 * GET /api/public/complexes/:id/ocupados?date=
 * Turnos OCUPADOS (futuros) del complejo para anotarse en lista de espera.
 * Devuelve también si el módulo está habilitado.
 */
async function getOcupados(req, res) {
  try {
    const { id } = req.params;
    const date = req.query.date || today();
    const complex = await Complex.findOne({
      where: { id, activo: true },
      attributes: ['id', 'modulo_lista_recordatorios'],
      include: [{ model: Field, as: 'fields', attributes: ['id', 'nombre', 'deporte'], where: { activa: true }, required: false }],
    });
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });

    const habilitado = !!complex.modulo_lista_recordatorios;
    if (!habilitado) return res.json({ habilitado: false, date, ocupados: [] });

    const fields = complex.fields || [];
    const fieldMap = new Map(fields.map(f => [f.id, f]));
    if (!fields.length) return res.json({ habilitado: true, date, ocupados: [] });

    const bookings = await Booking.findAll({
      where: {
        field_id: { [Op.in]: [...fieldMap.keys()] },
        fecha: date,
        estado: { [Op.notIn]: ['cancelado', 'rechazado'] },
      },
      attributes: ['id', 'field_id', 'fecha', 'hora_inicio', 'hora_fin', 'duracion'],
      order: [['hora_inicio', 'ASC']],
    });

    const now = new Date();
    const ocupados = bookings
      .filter(b => inicioTurno(b.fecha, b.hora_inicio) > now)   // solo turnos futuros
      .map(b => {
        const f = fieldMap.get(b.field_id);
        return {
          field_id: b.field_id,
          field_nombre: f?.nombre || `Cancha ${b.field_id}`,
          deporte: f?.deporte || null,
          fecha: b.fecha,
          hora: b.hora_inicio,
          hora_fin: b.hora_fin,
          duracion: b.duracion,
        };
      });

    res.json({ habilitado: true, date, ocupados });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * POST /api/public/complexes/:complexId/waitlist — requiere auth (jugador).
 * Body: { turnos:[{field_id,fecha,hora,duracion,deporte}], nombre, telefono, email }
 * Anota al usuario en la lista de espera de uno o varios turnos ocupados.
 */
async function addWaitlist(req, res) {
  try {
    const { complexId } = req.params;
    if (!(await waitlist.moduloHabilitado(complexId))) {
      return res.status(403).json({ message: 'La lista de espera no está disponible en este complejo.' });
    }

    const { turnos, nombre, telefono, email } = req.body || {};
    if (!Array.isArray(turnos) || turnos.length === 0) {
      return res.status(400).json({ message: 'Elegí al menos un turno ocupado.' });
    }

    // Datos del usuario: del body o de la cuenta logueada.
    const cuenta = await User.findByPk(req.user.id, { attributes: ['id', 'nombre', 'apellido', 'telefono', 'email'] });
    const nombreF   = (nombre   || `${cuenta?.nombre || ''} ${cuenta?.apellido || ''}`.trim() || null);
    const telefonoF = (telefono || cuenta?.telefono || '').toString().trim();
    const emailF    = (email    || cuenta?.email || null);
    if (!telefonoF && !emailF) {
      return res.status(400).json({ message: 'Necesitamos un teléfono o email para avisarte cuando se libere el turno.' });
    }

    let agregados = 0, duplicados = 0;
    for (const tno of turnos) {
      if (!tno?.field_id || !tno?.fecha || !tno?.hora) continue;
      const { duplicado } = await waitlist.agregar(complexId, {
        field_id: tno.field_id, deporte: tno.deporte || null,
        fecha: tno.fecha, hora: tno.hora, duracion: parseInt(tno.duracion) || 60,
        nombre: nombreF, telefono: telefonoF, email: emailF,
        user_id: req.user.id, origen: 'web',
      });
      duplicado ? duplicados++ : agregados++;
    }

    res.status(201).json({
      message: agregados
        ? `Te anotamos en la lista de espera de ${agregados} turno${agregados !== 1 ? 's' : ''}.`
        : 'Ya estabas anotado en los turnos seleccionados.',
      agregados, duplicados,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getComplexes, getComplex, getComplexSlots, playerReserve, getMyBookings, cancelMyBooking, registerComplex, checkInasistencias, getOcupados, addWaitlist };
