'use strict';
/**
 * config/whatsappModo.js — Interruptor único de Baileys (WhatsApp Web).
 *
 * Por defecto Baileys está DESHABILITADO: no se abre ninguna sesión, no hay QR,
 * reconexiones ni listeners, y nada se envía solo por WhatsApp Web. Los mensajes
 * de escuelas, torneos y profesores pasan a MODO MANUAL: el sistema genera el texto
 * y el usuario lo comparte desde su propio dispositivo (copiar, whatsapp://send,
 * navigator.share).
 *
 * El chatbot oficial (Meta Cloud API) NO se ve afectado.
 *
 * Para volver a habilitarlo (no recomendado): WHATSAPP_BAILEYS=1 en .env y reiniciar.
 */
const baileysHabilitado = () => ['1', 'true', 'si', 'sí'].includes(String(process.env.WHATSAPP_BAILEYS || '').toLowerCase());

const CODIGO = 'WHATSAPP_MODO_MANUAL';
const MENSAJE = 'El envío automático por WhatsApp está deshabilitado: el mensaje se genera para compartirlo manualmente desde tu dispositivo.';

/** Error estándar para cualquier intento de conexión o envío por Baileys. */
function errorModoManual() {
  return Object.assign(new Error(MENSAJE), { status: 410, code: CODIGO });
}

module.exports = { baileysHabilitado, errorModoManual, CODIGO_MODO_MANUAL: CODIGO, MENSAJE_MODO_MANUAL: MENSAJE };
