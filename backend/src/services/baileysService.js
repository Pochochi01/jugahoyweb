'use strict';
/**
 * services/baileysService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Proveedor alternativo de WhatsApp: Baileys (sesión de WhatsApp Web, sin Meta).
 * Una sesión por club, persistida en BAILEYS_AUTH_DIR/<clubId>.
 *
 * Dependencia OPCIONAL (no se instala por defecto):
 *     npm install @whiskeysockets/baileys
 * Si no está instalada, isAvailable() devuelve false y los envíos fallan con
 * un error claro (el notificador lo registra y sigue).
 *
 * El vínculo del número (escaneo del QR) lo hace SOLO el superadmin desde
 * Configuración → Integraciones.
 *
 * ⚠️ Baileys no es una API oficial de WhatsApp: usarlo con volúmenes bajos y
 * mensajes esperados por el usuario, para no arriesgar el bloqueo del número.
 */
const path = require('path');
const fs   = require('fs');
const QRCode = require('qrcode');

const baileysLib = require('../utils/baileysLib');   // import() dinámico (Baileys es ESM)

const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || path.join(__dirname, '..', '..', 'baileys_auth');
const sesiones = new Map(); // clubId → { sock, estado: 'conectando'|'qr'|'conectado'|'desconectado', qr }

function isAvailable() { return baileysLib.instalado(); }

const requireLib = () => baileysLib.cargar();

/** Abre (o reutiliza) la sesión del club. */
async function conectar(clubId) {
  const lib = await requireLib();
  const id = Number(clubId);
  const actual = sesiones.get(id);
  if (actual && actual.estado !== 'desconectado') return actual;

  const makeWASocket = lib.default || lib.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason } = lib;
  const dir = path.join(AUTH_DIR, String(id));
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const sesion = { sock: null, estado: 'conectando', qr: null };
  sesiones.set(id, sesion);

  const sock = makeWASocket({ auth: state, printQRInTerminal: false, syncFullHistory: false });
  sesion.sock = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { sesion.qr = qr; sesion.estado = 'qr'; }
    if (connection === 'open') { sesion.estado = 'conectado'; sesion.qr = null; console.log(`[Baileys] club ${id} conectado`); }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      sesion.estado = 'desconectado';
      if (code === DisconnectReason.loggedOut) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.warn(`[Baileys] club ${id}: sesión cerrada desde el teléfono`);
      } else {
        setTimeout(() => conectar(id).catch(err => console.error('[Baileys] reconexión:', err.message)), 3000);
      }
    }
  });
  return sesion;
}

/** Estado de la sesión + QR (data URL) para escanear, si corresponde. */
async function estado(clubId) {
  if (!isAvailable()) return { disponible: false, estado: 'no_instalado', qr: null };
  const s = sesiones.get(Number(clubId));
  // Hay credenciales guardadas → reconectar en segundo plano
  if (!s && fs.existsSync(path.join(AUTH_DIR, String(clubId), 'creds.json'))) {
    conectar(clubId).catch(() => {});
    return { disponible: true, estado: 'conectando', qr: null };
  }
  return {
    disponible: true,
    estado: s?.estado || 'desconectado',
    qr: s?.qr ? await QRCode.toDataURL(s.qr) : null,
  };
}

async function desconectar(clubId) {
  const id = Number(clubId);
  const s = sesiones.get(id);
  try { await s?.sock?.logout(); } catch { /* ya cerrada */ }
  sesiones.delete(id);
  fs.rmSync(path.join(AUTH_DIR, String(id)), { recursive: true, force: true });
}

async function socketListo(clubId) {
  const s = await conectar(clubId);
  if (s.estado !== 'conectado') {
    const e = new Error('La sesión de WhatsApp (Baileys) del club no está vinculada.');
    e.status = 409; e.code = 'BAILEYS_NOT_CONNECTED';
    throw e;
  }
  return s.sock;
}

const jid = (tel) => `${String(tel).replace(/\D/g, '')}@s.whatsapp.net`;

async function enviarTexto(clubId, telefono, texto) {
  const sock = await socketListo(clubId);
  return sock.sendMessage(jid(telefono), { text: texto });
}

/** Imagen (Buffer o URL) con epígrafe. */
async function enviarImagen(clubId, telefono, imagen, caption = '') {
  const sock = await socketListo(clubId);
  const image = Buffer.isBuffer(imagen) ? imagen : { url: imagen };
  return sock.sendMessage(jid(telefono), { image, caption });
}

module.exports = { isAvailable, conectar, estado, desconectar, enviarTexto, enviarImagen };
