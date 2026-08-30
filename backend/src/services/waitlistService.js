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
const { Waitlist, Complex, Field } = require('../models');
const wa = require('./whatsappService');
const integrations = require('./integrations.service');
const waWindow = require('./whatsappWindowService');

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
async function agregar(complexId, { field_id, deporte, fecha, hora, duracion = 60, nombre, telefono }) {
  const tel = soloDigitos(telefono);
  const existente = await Waitlist.findOne({
    where: { complex_id: complexId, field_id: field_id || null, fecha, hora, telefono: { [Op.like]: `%${tel.slice(-10)}%` }, estado: 'activo' },
  });
  if (existente) return { waitlist: existente, duplicado: true };

  const waitlist = await Waitlist.create({
    complex_id: complexId, field_id: field_id || null, deporte: deporte || null,
    fecha, hora, duracion, nombre: nombre || null, telefono: tel, estado: 'activo',
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

    const inscriptos = await Waitlist.findAll({
      where: { complex_id: complexId, fecha, hora, estado: 'activo', [Op.or]: orCond },
    });
    if (!inscriptos.length) return 0;

    const field = await Field.findByPk(field_id, { attributes: ['nombre', 'identificador', 'deporte'] });
    const canchaLbl = field ? (field.identificador ? `${field.nombre}` : field.nombre) : 'una cancha';
    const creds = await integrations.getMetaCredentials(complexId).catch(() => null);

    const cuerpo =
      `🔔 *¡Se liberó un turno!*\n\n` +
      `Estabas en lista de espera y quedó disponible:\n` +
      `🏟️ ${canchaLbl}\n📅 ${fecha}\n⏰ ${hora} hs\n\n` +
      `Escribí *hola* y reservá desde "Turnos por WhatsApp" antes de que lo tome otra persona. 🏃`;

    for (const w of inscriptos) {
      // Ramifica según la ventana de 24 h: texto libre (dentro) o plantilla Meta (fuera).
      await waWindow.enviarConVentana(complexId, w.telefono, {
        tipo: 'lista_espera',
        freeText: { type: 'text', text: { body: cuerpo } },
        templateParams: [canchaLbl, fecha, hora],
        creds,
        etiqueta: `waitlist #${w.id}`,
      }).catch(err => console.error('[waitlist] aviso:', err.message));
      await w.update({ estado: 'notificado', notificado_at: new Date() });
    }
    return inscriptos.length;
  } catch (err) {
    console.error('[waitlist] notificarLiberado:', err.message);
    return 0;
  }
}

module.exports = { moduloHabilitado, agregar, limpiarVencidos, slotsActivosDeTelefono, listarActivos, notificarLiberado, soloDigitos };
