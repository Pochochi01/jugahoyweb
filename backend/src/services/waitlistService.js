'use strict';
/**
 * services/waitlistService.js — Lista de espera (módulo opcional)
 *
 * Permite anotar a un usuario de WhatsApp en turnos ocupados (por cancha/horario/
 * deporte) y avisarle automáticamente cuando alguno se libera (al cancelarse una
 * reserva). Requiere que el complejo tenga habilitado el módulo pago
 * `modulo_lista_recordatorios`.
 */
const { Op } = require('sequelize');
const { Waitlist, Complex, Field, User, Notification } = require('../models');
const wa = require('./whatsappService');
const integrations = require('./integrations.service');
const waWindow = require('./whatsappWindowService');
const notifService = require('./notification.service');
const { sendMail } = require('../config/mailer');
const { labelDeporte } = require('../utils/canchas');

const soloDigitos = (t) => String(t || '').replace(/\D/g, '');

/** ¿El complejo tiene habilitado el módulo (lista de espera + recordatorios)? */
async function moduloHabilitado(complexId) {
  const c = await Complex.findByPk(complexId, { attributes: ['modulo_lista_recordatorios'] });
  return !!c?.modulo_lista_recordatorios;
}

/**
 * Agrega una inscripción a la lista de espera (evita duplicados activos).
 * @returns {{ waitlist, duplicado }}
 */
async function agregar(complexId, { field_id, deporte, fecha, hora, duracion = 60, nombre, telefono, email, user_id, origen = 'chatbot' }) {
  const tel = soloDigitos(telefono);
  const sig = tel.slice(-10);
  // Dedup: por teléfono (últimos 10) o por user_id logueado, para el mismo turno.
  const orDedup = [];
  if (sig) orDedup.push({ telefono: { [Op.like]: `%${sig}%` } });
  if (user_id) orDedup.push({ user_id });
  const existente = orDedup.length ? await Waitlist.findOne({
    where: { complex_id: complexId, field_id: field_id || null, fecha, hora, estado: 'activo', [Op.or]: orDedup },
  }) : null;
  if (existente) return { waitlist: existente, duplicado: true };

  const waitlist = await Waitlist.create({
    complex_id: complexId, field_id: field_id || null, deporte: deporte || null,
    fecha, hora, duracion, nombre: nombre || null, telefono: tel,
    email: email || null, user_id: user_id || null, origen, estado: 'activo',
  });
  return { waitlist, duplicado: false };
}

/** Borra las inscripciones activas cuyo turno ya comenzó (vencidas). */
async function limpiarVencidos(complexId) {
  const activos = await Waitlist.findAll({ where: { complex_id: complexId, estado: 'activo' } });
  const now = Date.now();
  let n = 0;
  for (const w of activos) {
    const [h] = String(w.hora).split(':').map(Number);
    const dt = new Date(`${w.fecha}T${w.hora}:00`);
    if (h < 8) dt.setDate(dt.getDate() + 1);   // madrugada = día siguiente
    if (dt.getTime() <= now) { await w.destroy(); n++; }
  }
  return n;
}

/** Claves `${field_id}_${fecha}_${hora}` que un teléfono ya tiene en lista de espera. */
async function slotsActivosDeTelefono(complexId, telefono) {
  const tel = soloDigitos(telefono);
  const rows = await Waitlist.findAll({
    where: { complex_id: complexId, estado: 'activo', telefono: { [Op.like]: `%${tel.slice(-10)}%` } },
    attributes: ['field_id', 'fecha', 'hora'],
  });
  return new Set(rows.map(r => `${r.field_id}_${r.fecha}_${r.hora}`));
}

/** Inscripciones activas de un complejo (para el panel). */
function listarActivos(complexId) {
  return Waitlist.findAll({
    where: { complex_id: complexId, estado: 'activo' },
    include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador', 'deporte'] }],
    order: [['fecha', 'ASC'], ['hora', 'ASC']],
  });
}

/**
 * Avisa a los inscriptos cuando un turno se libera (cancelación).
 * Se llama al cancelar una reserva, por cada hora liberada de la cancha.
 * Marca las inscripciones como 'notificado'. Best-effort (no bloquea).
 */
async function notificarLiberado(complexId, { field_id, fecha, hora, deporte }) {
  try {
    if (!(await moduloHabilitado(complexId))) return 0;

    // Coincide por cancha exacta o por deporte (inscripción a "cualquier cancha").
    const orCond = [{ field_id }];
    if (deporte) orCond.push({ field_id: null, deporte });

    // Orden de INSCRIPCIÓN (primero el que se anotó antes).
    const inscriptos = await Waitlist.findAll({
      where: { complex_id: complexId, fecha, hora, estado: 'activo', [Op.or]: orCond },
      order: [['created_at', 'ASC']],
    });
    if (!inscriptos.length) return 0;

    const field = await Field.findByPk(field_id, { attributes: ['nombre', 'identificador', 'deporte'] });
    const canchaLbl = field ? field.nombre : 'una cancha';
    const deporteLbl = labelDeporte(deporte || field?.deporte);
    const creds = await integrations.getMetaCredentials(complexId).catch(() => null);
    const complejo = await Complex.findByPk(complexId, { attributes: ['nombre'] });
    const dur = inscriptos[0]?.duracion || 60;
    const horaFin = (() => { const [h, m] = String(hora).split(':').map(Number); const t = h * 60 + m + dur; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();

    const cuerpoWa =
      `🔔 *¡Se liberó un turno!*\n\n` +
      `Estabas en lista de espera y quedó disponible:\n` +
      `🏟️ ${canchaLbl}\n🎾 ${deporteLbl}\n📅 ${fecha}\n⏰ ${hora} a ${horaFin} hs (${dur} min)\n\n` +
      `Reservalo antes de que lo tome otra persona: por la web o escribí *hola* por WhatsApp. 🏃`;

    // Resuelve el jugador (por user_id, email o teléfono) para avisos in-app/push.
    const resolverUser = async (w) => {
      if (w.user_id) return w.user_id;
      const sig = soloDigitos(w.telefono).slice(-10);
      const u = await User.findOne({
        where: { [Op.or]: [
          ...(w.email ? [{ email: w.email }] : []),
          ...(sig ? [{ telefono: { [Op.like]: `%${sig}%` } }] : []),
        ] },
        attributes: ['id'],
      }).catch(() => null);
      return u?.id || null;
    };

    for (const w of inscriptos) {
      // 1) WhatsApp (ventana de 24 h → texto libre o plantilla Meta).
      await waWindow.enviarConVentana(complexId, w.telefono, {
        tipo: 'lista_espera',
        freeText: { type: 'text', text: { body: cuerpoWa } },
        templateParams: [canchaLbl, fecha, `${hora} a ${horaFin}`],
        creds,
        etiqueta: `waitlist #${w.id}`,
      }).catch(err => console.error('[waitlist] aviso WA:', err.message));

      // 2) Aviso in-app + push (si es un jugador registrado).
      const userId = await resolverUser(w);
      if (userId) {
        await Notification.create({
          user_id: userId, tipo: 'lista_espera',
          titulo: '¡Se liberó un turno! 🔔',
          mensaje: `Quedó disponible ${canchaLbl} (${deporteLbl}) el ${fecha} de ${hora} a ${horaFin} hs. Reservalo antes de que lo tomen.`,
        }).catch(err => console.error('[waitlist] notif in-app:', err.message));
        notifService.sendToUserAsync(userId, {
          tipo: 'lista_espera', titulo: '¡Se liberó un turno! 🔔',
          body: `${canchaLbl} · ${deporteLbl} · ${fecha} ${hora}-${horaFin} hs`,
          url: '/reservar', data: { complex_id: complexId, field_id, fecha, hora },
          actions: [{ action: 'reservar', title: 'Reservar' }],
        });
      }

      // 3) Email (best-effort, si dejó email).
      if (w.email) {
        sendMail({
          to: w.email,
          subject: `Se liberó un turno en ${complejo?.nombre || 'el complejo'}`,
          html: `<p>Hola ${w.nombre || ''},</p><p>Estabas en la <b>lista de espera</b> y se liberó un turno:</p>` +
                `<ul><li><b>Cancha:</b> ${canchaLbl}</li><li><b>Deporte:</b> ${deporteLbl}</li>` +
                `<li><b>Fecha:</b> ${fecha}</li><li><b>Horario:</b> ${hora} a ${horaFin} hs (${dur} min)</li></ul>` +
                `<p>Reservalo antes de que lo tome otra persona. ¡Corré! 🏃</p>`,
        }).catch(err => console.error('[waitlist] email:', err.message));
      }

      await w.update({ estado: 'notificado', notificado_at: new Date() });
    }
    console.log(`[waitlist] notificados ${inscriptos.length} inscripto(s) por ${canchaLbl} ${fecha} ${hora} (orden de inscripción)`);
    return inscriptos.length;
  } catch (err) {
    console.error('[waitlist] notificarLiberado:', err.message);
    return 0;
  }
}

module.exports = { moduloHabilitado, agregar, limpiarVencidos, slotsActivosDeTelefono, listarActivos, notificarLiberado, soloDigitos };
