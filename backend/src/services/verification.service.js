'use strict';
/**
 * services/verification.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verificación del teléfono de un usuario mediante OTP enviado por WhatsApp.
 *
 * Reutiliza el modelo Token (OTP de 6 dígitos, guardado como hash SHA-256, con
 * expiración) y el whatsappService multi-tenant.
 *
 * Seguridad:
 *   - Token de un solo uso (se marca `usado` al validar).
 *   - Nunca se guarda en texto plano (solo el hash).
 *   - Límite de reintentos por OTP (MAX_ATTEMPTS).
 *   - Cooldown entre reenvíos (RESEND_COOLDOWN_S).
 */
const { User, Token } = require('../models');
const wa = require('./whatsappService');
const integrations = require('./integrations.service');

const OTP_TTL_MIN       = parseInt(process.env.OTP_TTL_MIN || '5', 10);   // vigencia del código
const MAX_ATTEMPTS      = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const RESEND_COOLDOWN_S = parseInt(process.env.OTP_RESEND_COOLDOWN_S || '30', 10);
const isDev             = process.env.NODE_ENV !== 'production';

/**
 * ¿Enviar el OTP por PLANTILLA de autenticación (obligatoria fuera de la
 * ventana de 24 h) o por texto libre (útil en dev / dentro de las 24 h)?
 *   OTP_USE_TEMPLATE=true  → siempre plantilla
 *   OTP_USE_TEMPLATE=false → siempre texto libre
 *   (sin definir)          → plantilla en producción, texto libre en desarrollo
 */
function shouldUseTemplate() {
  if (process.env.OTP_USE_TEMPLATE === 'true')  return true;
  if (process.env.OTP_USE_TEMPLATE === 'false') return false;
  return !isDev;
}

/** Payload de OTP como texto libre (dev / dentro de la ventana de 24 h). */
function buildTextOtpPayload(telefono, otp) {
  return {
    to: telefono,
    type: 'text',
    text: { body: `🔐 Tu código de verificación JugaHoy es *${otp}*.\nVence en ${OTP_TTL_MIN} minutos. No lo compartas con nadie.` },
  };
}

/** Construye el payload del OTP (plantilla o texto libre) para WhatsApp. */
function buildOtpPayload(telefono, otp) {
  return shouldUseTemplate()
    ? wa.buildOtpTemplate(telefono, otp)
    : buildTextOtpPayload(telefono, otp);
}

/** Normaliza un teléfono a solo dígitos (formato que espera WhatsApp: 549...) */
function normalizePhone(tel) {
  return String(tel || '').replace(/\D/g, '');
}

/** Club del usuario (para resolver las credenciales de WhatsApp del tenant) */
function clubIdOf(user) {
  return user?.default_complex_id ?? null;
}

/**
 * Genera y envía un OTP al WhatsApp del usuario.
 * @param {User} user  usuario (debe tener `telefono`)
 * @returns {Promise<{sent:boolean, dev_otp?:string}>}
 */
async function sendPhoneOtp(user) {
  const telefono = normalizePhone(user.telefono);
  if (!telefono) {
    const e = new Error('El usuario no tiene un teléfono válido.'); e.status = 400; throw e;
  }

  // Cooldown: no permitir spamear reenvíos
  const activo = await Token.getActiveOTP(user.id);
  if (activo) {
    const edadS = (Date.now() - new Date(activo.createdAt || activo.created_at).getTime()) / 1000;
    if (edadS < RESEND_COOLDOWN_S) {
      const e = new Error(`Esperá ${Math.ceil(RESEND_COOLDOWN_S - edadS)} segundos antes de pedir otro código.`);
      e.status = 429; e.code = 'OTP_COOLDOWN'; throw e;
    }
  }

  const otp = await Token.createOTP(user.id, OTP_TTL_MIN); // invalida anteriores + intentos=0

  // Credenciales del club del usuario (o plataforma como fallback en dev)
  const creds = await integrations.getMetaCredentials(clubIdOf(user));

  // Plantilla de autenticación en producción (obligatoria fuera de la ventana
  // de 24 h) o texto libre en desarrollo. Ver shouldUseTemplate().
  try {
    await wa.sendMessage(buildOtpPayload(telefono, otp), creds);
  } catch (err) {
    // Respaldo: si la plantilla no existe/está sin aprobar (#132001) u otro
    // fallo, reintentar como texto libre (llega dentro de la ventana de 24 h).
    // No hace que el OTP salga fuera de las 24 h, pero evita el fallo duro.
    if (shouldUseTemplate()) {
      const metaMsg = err.response?.data?.error?.message || err.message;
      console.warn(`[verify] Falló envío por plantilla (${metaMsg}); reintentando como texto libre.`);
      await wa.sendMessage(buildTextOtpPayload(telefono, otp), creds);
    } else {
      throw err;
    }
  }

  console.log(`[verify] OTP enviado a ${telefono} (user ${user.id})` + (isDev ? ` → ${otp}` : ''));

  return { sent: true, ...(isDev && { dev_otp: otp }) };
}

/**
 * Valida el OTP ingresado por el usuario.
 * @returns {Promise<{verified:boolean}>}
 * @throws  error con .status/.code y (en fallo) .remaining
 */
async function verifyPhoneOtp(user, code) {
  const record = await Token.getActiveOTP(user.id);
  if (!record) {
    const e = new Error('El código expiró o no existe. Pedí uno nuevo.'); e.status = 400; e.code = 'OTP_EXPIRED';
    throw e;
  }

  if (record.intentos >= MAX_ATTEMPTS) {
    await record.update({ usado: true });           // quemar el OTP
    const e = new Error('Demasiados intentos. Pedí un código nuevo.'); e.status = 429; e.code = 'OTP_MAX_ATTEMPTS';
    throw e;
  }

  if (!Token.matches(code, record)) {
    await record.update({ intentos: record.intentos + 1 });
    const remaining = Math.max(0, MAX_ATTEMPTS - record.intentos);
    const e = new Error(`Código incorrecto. Te quedan ${remaining} intento(s).`);
    e.status = 400; e.code = 'OTP_INVALID'; e.remaining = remaining;
    throw e;
  }

  // ✅ Correcto: token de un solo uso + marcar teléfono verificado
  await record.update({ usado: true });
  await User.update(
    { phone_verified: true, phone_verified_at: new Date() },
    { where: { id: user.id } }
  );

  console.log(`[verify] teléfono verificado para user ${user.id}`);
  return { verified: true };
}

module.exports = {
  sendPhoneOtp,
  verifyPhoneOtp,
  normalizePhone,
  OTP_TTL_MIN,
  MAX_ATTEMPTS,
};
