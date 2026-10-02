'use strict';
/**
 * utils/cifrado.js — cifrado simétrico de secretos en la base (AES-256-GCM).
 *
 * Se usa para los tokens OAuth de MercadoPago: un refresh_token filtrado da
 * acceso a la cuenta del complejo por meses, así que no se guarda en claro.
 *
 * Clave: MP_TOKEN_ENCRYPTION_KEY (recomendado, 32+ caracteres aleatorios).
 * Si falta, se deriva de JWT_SECRET (válido para desarrollo; en producción
 * conviene una clave propia para poder rotar una sin la otra).
 *
 * Formato: "v1:<iv b64>:<tag b64>:<datos b64>"
 */
const crypto = require('crypto');

function clave() {
  const base = process.env.MP_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!base) throw new Error('Falta MP_TOKEN_ENCRYPTION_KEY (o JWT_SECRET) para cifrar tokens.');
  return crypto.createHash('sha256').update(String(base)).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${datos.toString('base64')}`;
}

function descifrar(valor) {
  const [v, iv, tag, datos] = String(valor || '').split(':');
  if (v !== 'v1' || !iv || !tag || !datos) throw new Error('Token cifrado con formato inválido.');
  const d = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}

module.exports = { cifrar, descifrar };
