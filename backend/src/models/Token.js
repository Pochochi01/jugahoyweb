/**
 * models/Token.js
 * Tokens de un solo uso para: reset de contraseña, verificación de email y OTP telefónico.
 * Los tokens se almacenan como hash SHA-256; el valor en claro solo viaja por email/SMS.
 */
const { DataTypes, Op } = require('sequelize');
const crypto            = require('crypto');
const sequelize         = require('../config/database');

const Token = sequelize.define('Token', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  usuario_id: { type: DataTypes.INTEGER, allowNull: false },

  // Hash SHA-256 del token real; nunca se guarda el token en claro
  token: { type: DataTypes.STRING(255), allowNull: false, unique: true },

  tipo: {
    type: DataTypes.ENUM('reset_password', 'email_verificacion', 'otp_phone'),
    allowNull: false,
  },

  expira_en: { type: DataTypes.DATE, allowNull: false },

  usado: { type: DataTypes.BOOLEAN, defaultValue: false },

}, { tableName: 'tokens' });

// ── Métodos de clase ──────────────────────────────────────────

/**
 * Genera un token aleatorio de 32 bytes para reset de contraseña.
 * Invalida tokens previos del mismo tipo para el mismo usuario.
 * @returns {string} token en texto plano (enviar por email; nunca almacenar)
 */
Token.createResetToken = async function (usuarioId, ttlMinutos = 60) {
  // Invalidar anteriores
  await Token.update(
    { usado: true },
    { where: { usuario_id: usuarioId, tipo: 'reset_password', usado: false } }
  );

  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiraEn  = new Date(Date.now() + ttlMinutos * 60 * 1000);

  await Token.create({
    usuario_id: usuarioId,
    token:      tokenHash,
    tipo:       'reset_password',
    expira_en:  expiraEn,
  });

  return rawToken;
};

/**
 * Genera un OTP de 6 dígitos para verificación telefónica.
 * @returns {string} OTP en texto plano (enviar por SMS/WhatsApp; nunca almacenar)
 */
Token.createOTP = async function (usuarioId, ttlMinutos = 10) {
  await Token.update(
    { usado: true },
    { where: { usuario_id: usuarioId, tipo: 'otp_phone', usado: false } }
  );

  const otp       = String(Math.floor(100000 + Math.random() * 900000));
  const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiraEn  = new Date(Date.now() + ttlMinutos * 60 * 1000);

  await Token.create({
    usuario_id: usuarioId,
    token:      tokenHash,
    tipo:       'otp_phone',
    expira_en:  expiraEn,
  });

  return otp;
};

/**
 * Verifica si un token/OTP es válido (no usado, no expirado).
 * @returns {Token|null} El registro si es válido, null si no.
 */
Token.verifyToken = async function (rawToken, tipo) {
  const tokenHash = crypto.createHash('sha256').update(String(rawToken)).digest('hex');
  return Token.findOne({
    where: {
      token:     tokenHash,
      tipo,
      usado:     false,
      expira_en: { [Op.gt]: new Date() },
    },
  });
};

module.exports = Token;
