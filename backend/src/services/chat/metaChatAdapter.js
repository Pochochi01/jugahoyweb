'use strict';
/**
 * services/chat/metaChatAdapter.js — Adaptador del chatbot para la Cloud API de Meta.
 * Es el envío de siempre (POST /{phone_number_id}/messages); vive en
 * whatsappService.enviarPorMeta y acá solo se expone con la interfaz común.
 */
module.exports = {
  send: (payload, creds) => require('../whatsappService').enviarPorMeta(payload, creds),
};
