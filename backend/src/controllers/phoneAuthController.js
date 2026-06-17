/**
 * controllers/phoneAuthController.js
 * phoneAuthSkill: verificación por SMS / WhatsApp Business API.
 *
 * Estado actual: el OTP se imprime en consola (desarrollo).
 * Para producción, descomentá el bloque de Twilio o Meta según prefieras.
 *
 * Variables de entorno listas para integrar:
 *   Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM
 *   Meta WA: META_PHONE_NUMBER_ID, META_ACCESS_TOKEN
 */
const jwt  = require('jsonwebtoken');
const { User, Token } = require('../models');

// ── POST /api/auth/phone/send ─────────────────────────────────
async function sendOTP(req, res) {
  try {
    let { telefono } = req.body;
    telefono = String(telefono || '').trim();

    if (!telefono) return res.status(400).json({ message: 'Teléfono requerido' });

    // Buscar o crear usuario solo por teléfono
    let user = await User.findOne({ where: { telefono } });
    if (!user) {
      user = await User.create({
        nombre:   `Usuario ${telefono.slice(-4)}`,
        apellido: '',
        email:    `phone_${telefono.replace(/\D/g, '')}@jugahoy.local`,
        password: null,
        telefono,
        rol:      'player',
      });
    }

    const otp = await Token.createOTP(user.id, 10);

    // ── DESARROLLO: OTP en consola ────────────────────────
    console.log(`📱 OTP para ${telefono}: ${otp}`);

    /* ── TWILIO SMS (descomentar para producción) ─────────
    const twilio = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    await twilio.messages.create({
      body: `Tu código JugaHoy: ${otp}. Válido 10 minutos.`,
      from: process.env.TWILIO_PHONE_FROM,
      to:   telefono,
    });
    */

    /* ── META / WHATSAPP BUSINESS API ────────────────────
    await fetch(
      `https://graph.facebook.com/v20.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:   telefono,
          type: 'text',
          text: { body: `Tu código JugaHoy: ${otp}. Válido 10 minutos.` },
        }),
      }
    );
    */

    return res.json({
      message: 'Código enviado al teléfono indicado.',
      // Solo en dev: mostramos el OTP para pruebas
      ...(process.env.NODE_ENV !== 'production' && { _dev_otp: otp }),
    });

  } catch (err) {
    console.error('[phoneAuthController.sendOTP]', err);
    res.status(500).json({ message: 'Error al enviar el código' });
  }
}

// ── POST /api/auth/phone/verify ───────────────────────────────
async function verifyOTP(req, res) {
  try {
    const { telefono, otp } = req.body;
    if (!telefono || !otp) {
      return res.status(400).json({ message: 'Teléfono y código son requeridos' });
    }

    const user = await User.findOne({ where: { telefono: String(telefono).trim() } });
    if (!user) {
      return res.status(400).json({ message: 'Código inválido o expirado' });
    }

    const record = await Token.verifyToken(String(otp).trim(), 'otp_phone');
    if (!record || record.usuario_id !== user.id) {
      return res.status(400).json({ message: 'Código inválido o expirado' });
    }

    await record.update({ usado: true });

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password, ...safe } = user.toJSON();
    return res.json({
      message: 'Teléfono verificado correctamente.',
      token,
      user: safe,
    });

  } catch (err) {
    console.error('[phoneAuthController.verifyOTP]', err);
    res.status(500).json({ message: 'Error al verificar el código' });
  }
}

module.exports = { sendOTP, verifyOTP };
