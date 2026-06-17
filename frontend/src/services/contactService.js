/**
 * services/contactService.js
 * contactSkill: envío del formulario de contacto.
 */
import api from './api';

export const contactService = {
  send: ({ nombre, email, telefono, asunto, mensaje }) =>
    api.post('/contact', { nombre, email, telefono, asunto, mensaje }),
};
