/**
 * controllers/contactController.js
 * contactSkill: guarda el formulario de contacto y envía confirmación al usuario.
 */
const { Contact } = require('../models');
const { sendMail } = require('../config/mailer');

// ── POST /api/contact ─────────────────────────────────────────
async function createContact(req, res) {
  try {
    let { nombre, email, telefono, asunto, mensaje } = req.body;

    nombre  = String(nombre  || '').trim();
    email   = String(email   || '').trim().toLowerCase();
    mensaje = String(mensaje || '').trim();

    if (!nombre || nombre.length < 2) {
      return res.status(400).json({ message: 'Nombre requerido (mínimo 2 caracteres)' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    if (!mensaje || mensaje.length < 10) {
      return res.status(400).json({ message: 'El mensaje debe tener al menos 10 caracteres' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

    await Contact.create({
      nombre,
      email,
      telefono: telefono ? String(telefono).trim() : null,
      asunto:   asunto   ? String(asunto).trim()   : null,
      mensaje,
      ip_origen: ip,
    });

    // Confirmación al usuario (no bloqueante)
    sendMail({
      to:      email,
      subject: 'Recibimos tu mensaje — JugaHoy',
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:auto">
          <h2 style="color:#22c55e">¡Hola, ${nombre}!</h2>
          <p>Recibimos tu mensaje y te responderemos a la brevedad.</p>
          <blockquote style="border-left:3px solid #22c55e;padding-left:14px;color:#555;margin:16px 0">
            ${mensaje.replace(/\n/g, '<br>')}
          </blockquote>
          <p style="color:#888;font-size:12px">JugaHoy — soporte@jugahoy.com.ar</p>
        </div>`,
    });

    return res.status(201).json({ message: 'Mensaje recibido. Te responderemos pronto.' });

  } catch (err) {
    console.error('[contactController]', err);
    res.status(500).json({ message: 'Error al enviar el mensaje' });
  }
}

module.exports = { createContact };
