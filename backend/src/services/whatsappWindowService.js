'use strict';
/**
 * services/whatsappWindowService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ventana de servicio de 24 h de WhatsApp (Customer Service Window).
 *
 * WhatsApp solo permite mensajes de TEXTO LIBRE dentro de las 24 h posteriores al
 * último mensaje ENTRANTE del cliente. Fuera de esa ventana hay que usar una
 * PLANTILLA aprobada por Meta.
 *
 *  - registrarInbound(): se llama en cada mensaje entrante para abrir/renovar la ventana.
 *  - dentroDeVentana(): indica si todavía se puede enviar texto libre.
 *  - enviarConVentana(): ramifica el envío (texto libre vs plantilla) y audita en logs.
 */
const { Op } = require('sequelize');
const { WaConversation, WaTemplate } = require('../models');
const wa = require('./whatsappService');

const VENTANA_MS = 24 * 60 * 60 * 1000;
const soloDigitos = (t) => String(t || '').replace(/\D/g, '');
const clave = (t) => soloDigitos(t).slice(-10);      // últimos 10 dígitos (formato-agnóstico)

/** Registra/renueva la ventana al recibir un mensaje entrante del cliente. */
async function registrarInbound(complexId, telefono) {
  const tel = clave(telefono);
  if (!complexId || !tel) return;
  try {
    const [conv, creado] = await WaConversation.findOrCreate({
      where: { complex_id: complexId, telefono: tel },
      defaults: { last_inbound_at: new Date() },
    });
    if (!creado) await conv.update({ last_inbound_at: new Date() });
  } catch (err) {
    console.error('[wa-window] registrarInbound:', err.message);
  }
}

/** ¿La ventana de 24 h sigue abierta para este teléfono? (sin registro previo → cerrada) */
async function dentroDeVentana(complexId, telefono) {
  const tel = clave(telefono);
  if (!complexId || !tel) return false;
  const conv = await WaConversation.findOne({ where: { complex_id: complexId, telefono: tel } });
  if (!conv) return false;
  return (Date.now() - new Date(conv.last_inbound_at).getTime()) < VENTANA_MS;
}

/** Plantilla activa configurada para un tipo de recordatorio (o null). */
async function getTemplate(complexId, tipo) {
  return WaTemplate.findOne({ where: { complex_id: complexId, tipo, activo: true } });
}

/**
 * Envía un mensaje ramificando según la ventana de 24 h.
 * @param {number} complexId
 * @param {string} telefono         número destino (dígitos)
 * @param {object} opts
 *   - tipo: 'recordatorio_turno' | 'lista_espera' | 'confirmacion'
 *   - freeText: payload de texto libre (para dentro de la ventana)
 *   - templateParams: string[] con las variables {{1}},{{2}}… de la plantilla
 *   - creds: credenciales Meta del club
 *   - etiqueta: texto corto para el log de auditoría (ej. "turno #123")
 * @returns {{ via:'texto'|'plantilla'|'texto_forzado', nombre?:string }}
 */
async function enviarConVentana(complexId, telefono, { tipo, freeText, templateParams = [], creds, etiqueta = '' }) {
  const tel = soloDigitos(telefono);
  const last4 = tel.slice(-4);
  const dentro = await dentroDeVentana(complexId, tel);

  if (dentro) {
    await wa.sendMessage({ ...freeText, to: tel }, creds);
    console.log(`[WhatsApp][auditoría] ${tipo} ${etiqueta} → TEXTO LIBRE (dentro de 24 h) · tel ****${last4} · complejo ${complexId}`);
    return { via: 'texto' };
  }

  const tpl = await getTemplate(complexId, tipo);
  if (tpl) {
    const msg = wa.buildTemplateMessage(tel, tpl.nombre, tpl.idioma, templateParams);
    await wa.sendMessage(msg, creds);
    console.log(`[WhatsApp][auditoría] ${tipo} ${etiqueta} → PLANTILLA "${tpl.nombre}" (fuera de 24 h) · tel ****${last4} · complejo ${complexId}`);
    return { via: 'plantilla', nombre: tpl.nombre };
  }

  // Fuera de ventana y sin plantilla configurada: se intenta texto libre igual
  // (Meta puede rechazarlo). Queda auditado para revisión.
  console.warn(`[WhatsApp][auditoría] ${tipo} ${etiqueta} → FUERA de 24 h y SIN plantilla configurada; se intenta texto libre (Meta puede rechazarlo) · tel ****${last4} · complejo ${complexId}`);
  await wa.sendMessage({ ...freeText, to: tel }, creds);
  return { via: 'texto_forzado' };
}

module.exports = { registrarInbound, dentroDeVentana, getTemplate, enviarConVentana, VENTANA_MS };
