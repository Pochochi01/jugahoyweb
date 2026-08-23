'use strict';
/**
 * services/recurringService.js — Turnos fijos (recurrencia semanal)
 *
 * Materializa ocurrencias (bookings) de cada plantilla hacia adelante, con un
 * horizonte móvil de SEMANAS. Se llama al crear la plantilla y de forma perezosa
 * al abrir la agenda (así la recurrencia se extiende sola sin cron).
 */
const { Op } = require('sequelize');
const { RecurringBooking, Booking, TimeSlot } = require('../models');
const { todayAR } = require('../utils/time');

const SEMANAS = 12;
const pad = n => String(n).padStart(2, '0');
const ymd = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
function addMin(hora, min) { const [h, m] = hora.split(':').map(Number); const t = h * 60 + m + min; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; }

// Fechas (YYYY-MM-DD) del día de semana `dia` entre `desde` y `hasta` inclusive.
function ocurrencias(dia, desde, hasta) {
  const res = []; const d = parse(desde); const end = parse(hasta);
  while (d.getDay() !== dia) d.setDate(d.getDate() + 1);
  while (d <= end) { res.push(ymd(d)); d.setDate(d.getDate() + 7); }
  return res;
}

// Materializa las ocurrencias faltantes de UNA plantilla (respeta slots ocupados).
async function materializar(tpl) {
  const hoy = todayAR();
  const desde = tpl.desde_fecha && tpl.desde_fecha > hoy ? tpl.desde_fecha : hoy;
  const hastaDt = parse(hoy); hastaDt.setDate(hastaDt.getDate() + SEMANAS * 7);
  const hasta = ymd(hastaDt);

  const dur = tpl.duracion || 60;
  const slotsNec = Math.max(1, Math.ceil(dur / 60));
  const horas = Array.from({ length: slotsNec }, (_, i) => addMin(tpl.hora_inicio, i * 60));
  let creados = 0;

  for (const fecha of ocurrencias(tpl.dia_semana, desde, hasta)) {
    const yaHay = await Booking.findOne({ where: { recurring_id: tpl.id, fecha } });
    if (yaHay) continue;
    const ocupado = await TimeSlot.findOne({ where: { field_id: tpl.field_id, fecha, hora: { [Op.in]: horas }, estado: 'ocupado' } });
    if (ocupado) continue;   // no pisar otra reserva existente

    const booking = await Booking.create({
      field_id: tpl.field_id, fecha, hora_inicio: tpl.hora_inicio, hora_fin: tpl.hora_fin, duracion: dur,
      nombre_cliente: tpl.nombre_cliente, telefono_cliente: tpl.telefono_cliente || null,
      metodo_pago: tpl.metodo_pago || 'efectivo', monto: tpl.monto || 0,
      estado: 'confirmado', notas: 'Turno fijo', recurring_id: tpl.id, created_by: tpl.created_by || null,
    });
    for (const h of horas) {
      await TimeSlot.upsert({ field_id: tpl.field_id, fecha, hora: h, estado: 'ocupado', booking_id: booking.id });
    }
    creados++;
  }
  return creados;
}

// Materializa todas las plantillas activas de un complejo (uso perezoso).
async function materializarComplejo(complexId) {
  const tpls = await RecurringBooking.findAll({ where: { complex_id: complexId, activo: true } });
  for (const tpl of tpls) {
    try { await materializar(tpl); } catch (e) { console.error('[turnos-fijos] materializar:', e.message); }
  }
}

// Baja: desactiva la plantilla y elimina las ocurrencias futuras (libera slots).
async function darDeBaja(complexId, id) {
  const tpl = await RecurringBooking.findOne({ where: { id, complex_id: complexId } });
  if (!tpl) return null;
  await tpl.update({ activo: false });

  const hoy = todayAR();
  const futuras = await Booking.findAll({ where: { recurring_id: id, fecha: { [Op.gte]: hoy }, estado: { [Op.ne]: 'cancelado' } } });
  for (const b of futuras) {
    await TimeSlot.destroy({ where: { booking_id: b.id } });
    await b.destroy();
  }
  return { tpl, eliminadas: futuras.length };
}

module.exports = { materializar, materializarComplejo, darDeBaja, SEMANAS };
