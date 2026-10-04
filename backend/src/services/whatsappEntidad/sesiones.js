'use strict';
/**
 * services/whatsappEntidad/sesiones.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sesiones de WhatsApp Web (Baileys) de cada ENTIDAD: torneo, escuela o profesor.
 *
 *  - Una sesión por fila de entity_phones (una por entidad).
 *  - Credenciales y claves de Signal se guardan CIFRADAS en
 *    entity_phones.baileys_session (no en disco): sobreviven a reinicios y
 *    quedan atadas a tenant_id + entity_type + entity_id.
 *  - Al vincular (connection 'open') se valida que el número no esté vinculado
 *    a otra entidad: si lo está, se cierra la sesión y se informa el error.
 *  - enviarTexto() solo sale si la sesión viva corresponde a ESA fila y su
 *    número coincide con phone_number (relación organizador–entidad–teléfono).
 *
 * Las sesiones viven en memoria del proceso (pm2 en modo fork, 1 instancia).
 * Al arrancar el servidor, restaurarTodas() reabre las que estaban conectadas.
 *
 * ⚠️ Baileys no es la API oficial de WhatsApp: el número puede ser bloqueado si
 * se usa para mensajes masivos no esperados. Ver envios.js (ritmo y límites).
 */
const QRCode = require('qrcode');
const { EntityPhone } = require('../../models');
const { cifrar, descifrar } = require('../../utils/cifrado');
const baileysLib = require('../../utils/baileysLib');

let pinoSilencioso = null;
try { pinoSilencioso = require('pino')({ level: 'silent' }); } catch { /* Baileys usa su logger */ }

/** id de entity_phones → { sock, estado, qr, qrDataUrl, numero, cerrando, intentos } */
const sesiones = new Map();

// Inyectable para pruebas (socket falso) — ver setSocketFactory()
let socketFactory = null;
// Mensaje de confirmación al propio teléfono al vincularse: (fila) → texto | null
let textoVinculado = null;

const digitos = (t) => String(t || '').replace(/\D/g, '');
const jid = (tel) => `${digitos(tel)}@s.whatsapp.net`;
/** '5493811234567:12@s.whatsapp.net' → '5493811234567' */
const numeroDeJid = (id) => digitos(String(id || '').split(':')[0].split('@')[0]);
const MAX_REINTENTOS = 5;

// ── Estado de autenticación persistido en la BD ──────────────
async function authDesdeBD(fila) {
  const { initAuthCreds, BufferJSON, proto } = await baileysLib.cargar();
  let data = { creds: initAuthCreds(), keys: {} };
  if (fila.baileys_session) {
    try { data = JSON.parse(descifrar(fila.baileys_session), BufferJSON.reviver); } catch (err) {
      console.warn(`[wa-entidad] sesión ilegible de entity_phone ${fila.id}: se pide un QR nuevo (${err.message})`);
    }
  }
  data.keys = data.keys || {};

  // Guardado con antirrebote: Baileys actualiza claves muy seguido
  let timer = null;
  const guardar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      EntityPhone.update({ baileys_session: cifrar(JSON.stringify(data, BufferJSON.replacer)) }, { where: { id: fila.id } })
        .catch(err => console.error(`[wa-entidad] guardar sesión ${fila.id}:`, err.message));
    }, 800);
  };
  const state = {
    creds: data.creds,
    keys: {
      get: async (type, ids) => {
        const out = {};
        for (const id of ids) {
          let v = data.keys[type]?.[id];
          if (v && type === 'app-state-sync-key') v = proto.Message.AppStateSyncKeyData.fromObject(v);
          if (v) out[id] = v;
        }
        return out;
      },
      set: async (d) => {
        for (const type of Object.keys(d)) {
          data.keys[type] = data.keys[type] || {};
          for (const id of Object.keys(d[type])) {
            if (d[type][id] == null) delete data.keys[type][id];
            else data.keys[type][id] = d[type][id];
          }
        }
        guardar();
      },
    },
  };
  return { state, guardar, cancelar: () => clearTimeout(timer) };
}

async function crearSocket(state) {
  if (socketFactory) return socketFactory({ auth: state });
  const lib = await baileysLib.cargar();
  const makeWASocket = lib.default || lib.makeWASocket;
  let version;
  try { ({ version } = await lib.fetchLatestBaileysVersion()); } catch { /* usa la de la librería */ }
  return makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: lib.Browsers.ubuntu('JugaHoy'),
    ...(pinoSilencioso ? { logger: pinoSilencioso } : {}),
  });
}

/** Deja la fila desvinculada (sin número ni sesión) y libera la memoria. */
async function limpiar(id, motivo = null) {
  const s = sesiones.get(id);
  s?.auth?.cancelar();
  try { s?.sock?.end?.(undefined); } catch { /* ya cerrado */ }
  sesiones.delete(id);
  await EntityPhone.update(
    { phone_number: null, baileys_session: null, estado: 'desconectado', ultimo_error: motivo },
    { where: { id } },
  );
}

/** Conexión abierta: valida unicidad del número y marca la fila como conectada. */
async function alAbrir(id, sesion) {
  const numero = numeroDeJid(sesion.sock.user?.id);
  const otra = numero ? await EntityPhone.findOne({ where: { phone_number: numero } }) : null;
  if (!numero || (otra && otra.id !== id)) {
    const motivo = otra
      ? `El número +${numero} ya está vinculado a otra entidad (${otra.entity_type} #${otra.entity_id}). Desvinculalo ahí primero.`
      : 'No se pudo leer el número del teléfono.';
    sesion.cerrando = true;
    try { await sesion.sock.logout(); } catch { /* ignore */ }
    await limpiar(id, motivo);
    console.warn(`[wa-entidad] ${id}: vínculo rechazado — ${motivo}`);
    return;
  }
  try {
    await EntityPhone.update(
      { phone_number: numero, ultimo_numero: numero, estado: 'conectado', ultimo_error: null, ...(sesion.nuevo ? { vinculado_at: new Date() } : {}) },
      { where: { id } },
    );
  } catch (err) {
    // Carrera: otra entidad tomó el número entre la consulta y el update (índice único)
    if (err.name === 'SequelizeUniqueConstraintError') {
      sesion.cerrando = true;
      try { await sesion.sock.logout(); } catch { /* ignore */ }
      await limpiar(id, `El número +${numero} ya está vinculado a otra entidad.`);
      return;
    }
    throw err;
  }
  sesion.estado = 'conectado';
  sesion.numero = numero;
  sesion.qr = null; sesion.qrDataUrl = null; sesion.intentos = 0;
  console.log(`[wa-entidad] ${id}: conectado como ****${numero.slice(-4)}`);
  if (sesion.nuevo && textoVinculado) {
    sesion.nuevo = false;
    const fila = await EntityPhone.findByPk(id);
    const txt = await Promise.resolve(textoVinculado(fila)).catch(() => null);
    if (txt) sesion.sock.sendMessage(jid(numero), { text: txt }).catch(() => {});
  }
}

/**
 * Abre (o reutiliza) la sesión de la fila. Sin credenciales guardadas, Baileys
 * emite un QR para escanear (queda en estado 'esperando_qr').
 * @param {EntityPhone} filaParam
 */
async function conectar(filaParam) {
  const id = filaParam.id;
  const actual = sesiones.get(id);
  if (actual && !actual.cerrado) return actual;

  const fila = await EntityPhone.scope('conSesion').findByPk(id);
  const auth = await authDesdeBD(fila);
  const nuevo = !fila.baileys_session;
  const sesion = { sock: null, estado: nuevo ? 'esperando_qr' : 'conectando', qr: null, qrDataUrl: null, numero: null, cerrando: false, intentos: actual?.intentos || 0, auth, nuevo };
  sesiones.set(id, sesion);
  if (nuevo) await EntityPhone.update({ estado: 'esperando_qr', ultimo_error: null }, { where: { id } });

  const sock = await crearSocket(auth.state);
  sesion.sock = sock;
  sock.ev.on('creds.update', auth.guardar);
  sock.ev.on('connection.update', async (u) => {
    try {
      if (u.qr) {
        sesion.qr = u.qr;
        sesion.qrDataUrl = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
        sesion.estado = 'esperando_qr';
      }
      if (u.connection === 'open') await alAbrir(id, sesion);
      if (u.connection === 'close') {
        sesion.cerrado = true;
        if (sesion.cerrando) return;                      // logout pedido por nosotros
        const { DisconnectReason } = socketFactory ? { DisconnectReason: { loggedOut: 401, restartRequired: 515 } } : await baileysLib.cargar();
        const code = u.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          await limpiar(id, 'Se cerró la sesión desde el teléfono (Dispositivos vinculados).');
          return;
        }
        // Reconexión (restartRequired tras escanear, caída de red, etc.)
        if (sesion.intentos >= MAX_REINTENTOS) {
          sesiones.delete(id);
          await EntityPhone.update({ ultimo_error: 'No se pudo reconectar con WhatsApp. Probá conectar de nuevo.' }, { where: { id } });
          return;
        }
        sesion.intentos += 1;
        const espera = code === DisconnectReason.restartRequired ? 200 : 2000 * sesion.intentos;
        setTimeout(() => {
          sesiones.delete(id);
          EntityPhone.findByPk(id).then(f => f && conectar(f)).catch(err => console.error(`[wa-entidad] reconexión ${id}:`, err.message));
        }, espera);
      }
    } catch (err) { console.error(`[wa-entidad] ${id} connection.update:`, err.message); }
  });
  return sesion;
}

/** Estado para el panel: conectado / esperando_qr (con el QR como data URL) / desconectado. */
async function estado(fila) {
  if (!fila) return { estado: 'desconectado', numero: null, qr: null };
  const s = sesiones.get(fila.id);
  // Había sesión guardada pero el proceso se reinició → reabrir en segundo plano
  if (!s && fila.estado === 'conectado') conectar(fila).catch(() => {});
  return {
    estado: s?.estado === 'conectado' ? 'conectado' : s ? s.estado : fila.estado,
    numero: fila.phone_number,
    qr: s?.estado === 'esperando_qr' ? s.qrDataUrl : null,
    vinculado_at: fila.vinculado_at,
    error: fila.ultimo_error,
  };
}

/** Cierra la sesión en WhatsApp (el dispositivo desaparece del teléfono) y desvincula. */
async function desconectar(fila) {
  const s = sesiones.get(fila.id);
  if (s) {
    s.cerrando = true;
    try { await s.sock?.logout(); } catch { /* ya cerrada */ }
  }
  await limpiar(fila.id, null);
}

/** ¿La sesión viva corresponde a esta fila y a su número? */
function sesionValida(fila) {
  const s = sesiones.get(fila.id);
  return Boolean(s && s.estado === 'conectado' && fila.estado === 'conectado' && fila.phone_number && s.numero === fila.phone_number);
}

/** Envía un texto desde el teléfono de la entidad. Lanza 409 si no está vinculado/vivo. */
async function enviarTexto(fila, telefono, texto) {
  if (!sesionValida(fila)) {
    throw Object.assign(new Error('El teléfono de esta entidad no está conectado.'), { status: 409, code: 'TELEFONO_NO_CONECTADO' });
  }
  return sesiones.get(fila.id).sock.sendMessage(jid(telefono), { text: texto });
}

/** Imagen (Buffer o URL) con epígrafe, mismas validaciones que enviarTexto. */
async function enviarImagen(fila, telefono, imagen, caption = '') {
  if (!sesionValida(fila)) {
    throw Object.assign(new Error('El teléfono de esta entidad no está conectado.'), { status: 409, code: 'TELEFONO_NO_CONECTADO' });
  }
  const image = Buffer.isBuffer(imagen) ? imagen : { url: imagen };
  return sesiones.get(fila.id).sock.sendMessage(jid(telefono), { image, caption });
}

/** Al arrancar el servidor: reabre las sesiones que estaban conectadas. */
async function restaurarTodas() {
  if (!socketFactory && !baileysLib.instalado()) return 0;
  const filas = await EntityPhone.findAll({ where: { estado: 'conectado' } });
  for (const [i, f] of filas.entries()) {
    setTimeout(() => conectar(f).catch(err => console.error(`[wa-entidad] restaurar ${f.id}:`, err.message)), i * 1500);
  }
  // Las que quedaron esperando QR al reiniciar ya no tienen QR válido
  await EntityPhone.update({ estado: 'desconectado' }, { where: { estado: 'esperando_qr' } });
  return filas.length;
}

module.exports = {
  conectar, estado, desconectar, enviarTexto, enviarImagen, sesionValida, restaurarTodas, numeroDeJid,
  setSocketFactory: (f) => { socketFactory = f; },
  setTextoVinculado: (f) => { textoVinculado = f; },
  _sesiones: sesiones,
};
