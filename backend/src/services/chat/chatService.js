'use strict';
/**
 * services/chat/chatService.js — Strategy del proveedor del chatbot por complejo.
 *
 *   club_integrations.wa_provider = 'meta'    → MetaChatAdapter    (Cloud API oficial)
 *   club_integrations.wa_provider = 'baileys' → BaileysChatAdapter (WhatsApp Web)
 *
 * Todo el chatbot (y los avisos: cancelaciones, recordatorios, lista de espera…)
 * envía con wa.sendMessage(payload, creds). Las credenciales que devuelve
 * integrations.getMetaCredentials() traen `provider`, y sendMessage despacha al
 * adaptador correspondiente con adaptadorPara(creds). Los clubes que ya usan
 * Meta no cambian: 'meta' es el valor por defecto y sus credenciales quedan
 * intactas aunque se pruebe Baileys y se vuelva.
 */
const PROVEEDORES = ['meta', 'baileys'];

/** Adaptador según las credenciales (provider ausente = meta, compatibilidad). */
function adaptadorPara(creds) {
  if (creds?.provider === 'baileys') return require('./baileysChatAdapter');
  return require('./metaChatAdapter');
}

module.exports = { PROVEEDORES, adaptadorPara };
