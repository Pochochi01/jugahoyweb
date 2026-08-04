'use strict';
/**
 * controllers/verificationController.js
 * Endpoints de verificación de teléfono por WhatsApp (usuario autenticado).
 *
 *   POST /api/verification/phone/send    → envía el OTP al WhatsApp del usuario
 *   POST /api/verification/phone/confirm → valida el OTP { code }
 *   GET  /api/verification/status        → estado de verificación del usuario
 *
 * El usuario se toma de req.user (middleware authenticate): cada uno solo puede
 * verificar SU propio teléfono.
 */
const verification = require('../services/verification.service');

async function sendPhone(req, res) {
  try {
    // Permite actualizar el teléfono en el mismo paso (opcional)
    const nuevoTel = req.body?.telefono;
    if (nuevoTel && String(nuevoTel).trim() !== req.user.telefono) {
      await req.user.update({ telefono: String(nuevoTel).trim(), phone_verified: false });
    }
    if (req.user.phone_verified) {
      return res.json({ ok: true, alreadyVerified: true, message: 'El teléfono ya está verificado.' });
    }

    const result = await verification.sendPhoneOtp(req.user);
    res.json({
      ok: true,
      message: `Código enviado por WhatsApp. Vence en ${verification.OTP_TTL_MIN} minutos.`,
      ...result,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, code: err.code });
  }
}

async function confirmPhone(req, res) {
  try {
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Ingresá el código de 6 dígitos.' });
    }
    const result = await verification.verifyPhoneOtp(req.user, code);
    res.json({ ok: true, verified: result.verified, message: 'Teléfono verificado correctamente. ✅' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, code: err.code, remaining: err.remaining });
  }
}

async function status(req, res) {
  res.json({
    phone_verified: !!req.user.phone_verified,
    telefono: req.user.telefono || null,
    phone_verified_at: req.user.phone_verified_at || null,
  });
}

module.exports = { sendPhone, confirmPhone, status };
