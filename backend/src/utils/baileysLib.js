'use strict';
/**
 * utils/baileysLib.js — carga perezosa de @whiskeysockets/baileys.
 * Desde la 6.7.x Baileys es ESM: desde CommonJS se carga con import() dinámico.
 * Si no está instalado, cargar() falla con 501 BAILEYS_NOT_INSTALLED.
 */
let mod = null;
let pendiente = null;

const { baileysHabilitado, errorModoManual } = require('../config/whatsappModo');

/** true solo si está instalado Y habilitado (WHATSAPP_BAILEYS=1). */
function instalado() {
  if (!baileysHabilitado()) return false;
  try { require.resolve('@whiskeysockets/baileys'); return true; } catch { return false; }
}

async function cargar() {
  if (!baileysHabilitado()) {
    console.warn('[Baileys] intento de carga bloqueado: modo manual');
    throw errorModoManual();
  }
  if (mod) return mod;
  if (!pendiente) {
    pendiente = import('@whiskeysockets/baileys')
      .then(m => (mod = m))
      .catch(() => {
        pendiente = null;
        throw Object.assign(new Error('Baileys no está instalado en el servidor (npm install @whiskeysockets/baileys).'), { status: 501, code: 'BAILEYS_NOT_INSTALLED' });
      });
  }
  return pendiente;
}

module.exports = { instalado, cargar };
