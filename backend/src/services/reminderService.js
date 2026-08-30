'use strict';
/**
 * services/reminderService.js — Recordatorios automáticos de turnos (módulo opcional)
 *
 * Envía por WhatsApp un recordatorio ~2 h antes del inicio de cada turno.
 *  - Solo para complejos con el módulo `modulo_lista_recordatorios` habilitado.
 *  - NO se envía si el turno fue reservado con menos de 2 h de anticipación.
 *  - Incluye: nombre, cancha, deporte, horario y duración.
 *
 * Sin dependencia de cron: un setInterval revisa periódicamente (cada 5 min).
 */
const { Op } = require('sequelize');
const { Booking, Field, Complex } = require('../models');
const wa = require('./whatsappService');
const integrations = require('./integrations.service');
const waWindow = require('./whatsappWindowService');
const { todayAR } = require('../utils/time');

const DOS_HORAS = 2 * 60 * 60 * 1000;
const soloDigitos = (t) => String(t || '').replace(/\D/g, '');

const DEPORTE_LABEL = {
  futbol: 'Fútbol', tenis: 'Tenis', padel: 'Pádel', basket: 'Básquet', squash: 'Squash', voley: 'Vóley',
};
const depLabel = (d) => DEPORTE_LABEL[d] || (d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Turno');

// Inicio del turno como Date (el proceso corre en TZ Argentina).
function inicioDe(booking) {
  const [h] = booking.hora_inicio.split(':').map(Number);
  const dt = new Date(`${booking.fecha}T${booking.hora_inicio}:00`);
  if (h < 8) dt.setDate(dt.getDate() + 1);   // madrugada = día siguiente del calendario
  return dt;
}

/** Revisa y envía los recordatorios pendientes (idempotente por `recordatorio_enviado`). */
async function enviarRecordatoriosPendientes() {
  // 1. Complejos con el módulo habilitado
  const complejos = await Complex.findAll({ where: { modulo_lista_recordatorios: true, activo: true }, attributes: ['id'] });
  if (!complejos.length) return { enviados: 0 };
  const complexIds = complejos.map(c => c.id);

  const fields = await Field.findAll({ where: { complex_id: { [Op.in]: complexIds } }, attributes: ['id', 'nombre', 'identificador', 'deporte', 'complex_id'] });
  if (!fields.length) return { enviados: 0 };
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  // 2. Turnos confirmados sin recordatorio, para hoy o mañana
  const hoy = todayAR();
  const mananaDt = new Date(`${hoy}T12:00:00`); mananaDt.setDate(mananaDt.getDate() + 1);
  const manana = mananaDt.toISOString().slice(0, 10);

  const candidatos = await Booking.findAll({
    where: {
      field_id: { [Op.in]: [...fieldMap.keys()] },
      estado: 'confirmado',
      recordatorio_enviado: false,
      fecha: { [Op.in]: [hoy, manana] },
    },
  });

  const now = Date.now();
  const credsCache = new Map();
  let enviados = 0;

  for (const b of candidatos) {
    const inicio = inicioDe(b).getTime();
    const msFalta = inicio - now;
    // Ventana: dentro de las próximas 2 h y aún no comenzó.
    if (msFalta <= 0 || msFalta > DOS_HORAS) continue;
    // No enviar si se reservó con menos de 2 h de anticipación.
    const creado = new Date(b.created_at || b.createdAt).getTime();
    if (inicio - creado < DOS_HORAS) { await b.update({ recordatorio_enviado: true }); continue; }

    const field = fieldMap.get(b.field_id);
    const complexId = field?.complex_id;
    const tel = soloDigitos(b.telefono_cliente);
    if (!tel || !complexId) { await b.update({ recordatorio_enviado: true }); continue; }

    if (!credsCache.has(complexId)) {
      credsCache.set(complexId, await integrations.getMetaCredentials(complexId).catch(() => null));
    }
    const creds = credsCache.get(complexId);

    const canchaLbl = field ? field.nombre : 'la cancha';
    const deporteLbl = depLabel(field?.deporte);
    const cuerpo =
      `⏰ *Recordatorio de turno*\n\n` +
      `Hola ${b.nombre_cliente || ''}! Te esperamos en 2 horas:\n\n` +
      `🏟️ ${canchaLbl}\n` +
      `🎾 ${deporteLbl}\n` +
      `📅 ${b.fecha}\n` +
      `⏰ ${b.hora_inicio} a ${b.hora_fin} hs (${b.duracion} min)\n\n` +
      `¡Nos vemos! 🙌`;

    try {
      // Ramifica según la ventana de 24 h: texto libre (dentro) o plantilla Meta (fuera).
      await waWindow.enviarConVentana(complexId, tel, {
        tipo: 'recordatorio_turno',
        freeText: { type: 'text', text: { body: cuerpo } },
        templateParams: [b.nombre_cliente || '', canchaLbl, deporteLbl, b.fecha, `${b.hora_inicio} a ${b.hora_fin}`],
        creds,
        etiqueta: `turno #${b.id}`,
      });
      await b.update({ recordatorio_enviado: true });
      enviados++;
    } catch (err) {
      console.error('[recordatorios] envío turno', b.id, '→', err.message);
      // No marca enviado: reintenta en la próxima pasada.
    }
  }
  if (enviados) console.log(`[recordatorios] enviados: ${enviados}`);
  return { enviados };
}

let timer = null;
let corriendo = false;

/** Arranca el scheduler (cada `minutos`, default 5). */
function startReminderScheduler(minutos = 5) {
  if (timer) return;
  const tick = async () => {
    if (corriendo) return;
    corriendo = true;
    try { await enviarRecordatoriosPendientes(); }
    catch (err) { console.error('[recordatorios] tick:', err.message); }
    finally { corriendo = false; }
  };
  timer = setInterval(tick, minutos * 60 * 1000);
  if (timer.unref) timer.unref();
  console.log(`✓ Scheduler de recordatorios activo (cada ${minutos} min).`);
  // Primera pasada diferida para no bloquear el arranque.
  setTimeout(tick, 30 * 1000);
}

module.exports = { startReminderScheduler, enviarRecordatoriosPendientes };
