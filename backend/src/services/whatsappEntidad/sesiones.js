'use strict';
/**
 * services/whatsappEntidad/sesiones.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sesiones de WhatsApp Web (Baileys) de cada ENTIDAD: torneo, escuela o profesor.
 *
 *  - Una sesión independiente por fila de entity_phones (tenant_id + entity_type
 *    + entity_id): socket, QR, credenciales y reconexión propios. Nunca se
 *    comparten entre entidades.
 *  - Persistencia (almacenes.js): base de datos cifrada (por defecto) o archivos
 *    con useMultiFileAuthState en sessions/<tipo><id> (WA_SESION_STORE=archivo).
 *    Las credenciales se guardan apenas cambian → un reinicio no pide QR.
 *  - Reconexión automática según el motivo del corte (ver politica()):
 *      corte de red / servidor de WhatsApp → reintenta sin límite con espera
 *        creciente (2 s, 4 s, 8 s… hasta 5 min) usando la sesión guardada;
 *      515 restartRequired (tras escanear) → reconecta en el acto;
 *      401/403/411/500 → la sesión ya no sirve: se libera y hay que escanear;
 *      440 connectionReplaced → la sesión se abrió en OTRO proceso: se detiene
 *        (no pelea con el otro) y conserva la sesión para reconectar a mano;
 *      QR vencido sin escanear → se detiene (no genera QR en bucle).
 *  - Vigilancia cada 60 s: detecta sockets caídos sin evento y reconecta.
 *  - Al apagar (SIGINT/SIGTERM de pm2): guarda lo pendiente y cierra SIN logout.
 *  - Logs: "[wa-entidad] escuela#4 (tenant 2) → CONECTADO / RECONECTANDO / DESCONECTADO …"
 *
 * Las sesiones viven en memoria del proceso (pm2 en modo fork, 1 instancia):
 * dos procesos con la misma sesión se desconectan mutuamente (440).
 *
 * ⚠️ Baileys no es la API oficial de WhatsApp: el número puede ser bloqueado si
 * se usa para mensajes masivos no esperados. Ver envios.js (ritmo y límites).
 */
const QRCode = require('qrcode');
const { EntityPhone } = require('../../models');
const baileysLib = require('../../utils/baileysLib');
const almacenes = require('./almacenes');
const red = require('./red');

let pinoSilencioso = null;
try { pinoSilencioso = require('pino')({ level: 'silent' }); } catch { /* Baileys usa su logger */ }

/** id de entity_phones → sesión en memoria (ver nuevaSesion) */
const sesiones = new Map();

// Inyectables para pruebas
let socketFactory = null;
let textoVinculado = null;
const ESPERA_BASE_MS = Number(process.env.WA_RECONEXION_BASE_MS || 2000);
const ESPERA_MAX_MS = Number(process.env.WA_RECONEXION_MAX_MS || 5 * 60 * 1000);

const digitos = (t) => String(t || '').replace(/\D/g, '');
const jid = (tel) => `${digitos(tel)}@s.whatsapp.net`;
/** '5493811234567:12@s.whatsapp.net' → '5493811234567' */
const numeroDeJid = (id) => digitos(String(id || '').split(':')[0].split('@')[0]);
const etiquetaDe = (fila) => `${fila.entity_type}#${fila.entity_id} (tenant ${fila.tenant_id})`;
const log = (s, estado, detalle = '') => console.log(`[wa-entidad] ${s.etiqueta} → ${estado}${detalle ? ` · ${detalle}` : ''}`);

/**
 * Qué hacer ante un cierre de conexión.
 * @param {number|undefined} code   statusCode de Baileys (DisconnectReason)
 * @param {boolean} registrada      la sesión ya estaba emparejada (se escaneó el QR alguna vez)
 * @param {Error} [err]
 * @returns {{accion:'limpiar'|'detener'|'qr_vencido'|'reconectar_ya'|'reconectar', motivo:string}}
 */
function politica(code, registrada, err) {
  switch (code) {
    case 401: return { accion: 'limpiar', motivo: 'Se cerró la sesión desde el teléfono (Dispositivos vinculados). Volvé a escanear el QR.' };
    case 403: return { accion: 'limpiar', motivo: 'WhatsApp rechazó la sesión (número bloqueado o restringido).' };
    case 411: return { accion: 'limpiar', motivo: 'WhatsApp pidió volver a vincular el dispositivo.' };
    case 500: return { accion: 'limpiar', motivo: 'La sesión guardada está dañada: volvé a escanear el QR.' };
    case 440: return { accion: 'detener', motivo: 'La sesión se abrió en otro lugar (¿otro servidor o proceso con la misma sesión?). Tocá "Reconectar" cuando se cierre el otro.' };
    case 515: return { accion: 'reconectar_ya', motivo: 'Reinicio pedido por WhatsApp' };
    default: break;
  }
  if (!registrada) {
    return red.esErrorDeRed(err)
      ? { accion: 'qr_vencido', motivo: `No se pudo conectar con WhatsApp (${err?.code || err?.message}). Revisá la conexión del servidor.` }
      : { accion: 'qr_vencido', motivo: 'El QR venció sin escanearse. Generá uno nuevo.' };
  }
  return { accion: 'reconectar', motivo: red.esErrorDeRed(err) ? `Corte de red (${err?.code || err?.message})` : `Conexión cerrada (${code || err?.message || 'sin código'})` };
}

function crearSocket(state) {
  if (socketFactory) return socketFactory({ auth: state });
  return baileysLib.cargar().then(async (lib) => {
    const makeWASocket = lib.default || lib.makeWASocket;
    let version;
    try { ({ version } = await lib.fetchLatestBaileysVersion()); } catch { /* usa la de la librería */ }
    const agent = red.agenteProxy();
    return makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: lib.Browsers.ubuntu('JugaHoy'),
      ...(agent ? { agent, fetchAgent: agent } : {}),
      ...(pinoSilencioso ? { logger: pinoSilencioso } : {}),
    });
  });
}

/** Libera la entidad: borra la sesión (BD y archivos), quita el número y deja el motivo. */
async function limpiar(id, motivo = null) {
  const s = sesiones.get(id);
  if (s) {
    s.cerrando = true;
    clearTimeout(s.timerReconexion);
    s.auth?.cancelar();
    try { s.sock?.end?.(undefined); } catch { /* ya cerrado */ }
    sesiones.delete(id);
  }
  const fila = await EntityPhone.findByPk(id);
  if (fila) {
    await almacenes.archivo.borrar(fila).catch(() => {});
    await fila.update({ phone_number: null, baileys_session: null, estado: 'desconectado', ultimo_error: motivo });
  }
  if (s) log(s, 'DESCONECTADO', motivo || 'sesión liberada');
}

/** Detiene la sesión en memoria sin borrar lo guardado (440, QR vencido). */
async function detener(s, motivo, { borrarSesion = false } = {}) {
  s.cerrando = true;
  clearTimeout(s.timerReconexion);
  try { s.sock?.end?.(undefined); } catch { /* ignore */ }
  sesiones.delete(s.id);
  const fila = await EntityPhone.findByPk(s.id);
  if (!fila) return;
  if (borrarSesion) { await almacenes.actual().borrar(fila).catch(() => {}); await almacenes.archivo.borrar(fila).catch(() => {}); }
  await fila.update({ estado: 'desconectado', ultimo_error: motivo, ...(borrarSesion ? { baileys_session: null } : {}) });
  log(s, 'DESCONECTADO', motivo);
}

/** Conexión abierta: valida unicidad del número y marca la fila como conectada. */
async function alAbrir(s) {
  const numero = numeroDeJid(s.sock.user?.id);
  const otra = numero ? await EntityPhone.findOne({ where: { phone_number: numero } }) : null;
  if (!numero || (otra && otra.id !== s.id)) {
    const motivo = otra
      ? `El número +${numero} ya está vinculado a otra entidad (${otra.entity_type} #${otra.entity_id}). Desvinculalo ahí primero.`
      : 'No se pudo leer el número del teléfono.';
    s.cerrando = true;
    try { await s.sock.logout(); } catch { /* ignore */ }
    await limpiar(s.id, motivo);
    return;
  }
  try {
    await EntityPhone.update(
      { phone_number: numero, ultimo_numero: numero, estado: 'conectado', ultimo_error: null, ...(s.nuevo ? { vinculado_at: new Date() } : {}) },
      { where: { id: s.id } },
    );
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {   // carrera: otra entidad tomó el número
      s.cerrando = true;
      try { await s.sock.logout(); } catch { /* ignore */ }
      await limpiar(s.id, `El número +${numero} ya está vinculado a otra entidad.`);
      return;
    }
    throw err;
  }
  await s.auth.flush();   // asegura credenciales en disco/BD apenas queda vinculada
  const reconexion = s.intentos > 0;
  Object.assign(s, { estado: 'conectado', numero, qr: null, qrDataUrl: null, intentos: 0, conectadoDesde: new Date() });
  log(s, 'CONECTADO', `****${numero.slice(-4)}${reconexion ? ' (reconectado)' : ''}`);
  if (s.nuevo && textoVinculado) {
    s.nuevo = false;
    const fila = await EntityPhone.findByPk(s.id);
    const txt = await Promise.resolve(textoVinculado(fila)).catch(() => null);
    if (txt) s.sock.sendMessage(jid(numero), { text: txt }).catch(() => {});
  }
}

/** Programa el próximo intento con espera creciente (sin límite de intentos). */
function programarReconexion(s, motivo, err) {
  s.intentos += 1;
  const base = Math.min(ESPERA_BASE_MS * 2 ** (s.intentos - 1), ESPERA_MAX_MS);
  const espera = base + Math.floor(Math.random() * base * 0.2);   // +0–20 %: que varias sesiones no reintenten a la vez
  s.estado = 'reconectando';
  s.proximoIntento = new Date(Date.now() + espera);
  log(s, 'RECONECTANDO', `${motivo} · intento ${s.intentos} en ${Math.round(espera / 1000)} s`);
  // Si parece un bloqueo de red, o falla varias veces seguidas, dejar el diagnóstico visible en el panel
  if (red.esErrorDeRed(err) || s.intentos === 3) {
    red.diagnosticar().then(d => {
      if (!d.ok && sesiones.get(s.id) === s) {
        EntityPhone.update({ ultimo_error: `Reconectando: ${d.sugerencia}` }, { where: { id: s.id } }).catch(() => {});
        log(s, 'RED', d.sugerencia);
      }
    }).catch(() => {});
  }
  clearTimeout(s.timerReconexion);
  s.timerReconexion = setTimeout(() => abrirSocket(s).catch(e => {
    log(s, 'ERROR', e.message);
    programarReconexion(s, 'No se pudo abrir el socket', e);
  }), espera);
  s.timerReconexion.unref?.();
}

async function manejarCierre(s, err) {
  if (s.cerrando || sesiones.get(s.id) !== s) return;
  const code = err?.output?.statusCode;
  const { accion, motivo } = politica(code, Boolean(s.auth?.state?.creds?.registered), err);
  if (accion === 'limpiar') return limpiar(s.id, motivo);
  if (accion === 'detener') return detener(s, motivo);
  if (accion === 'qr_vencido') return detener(s, motivo, { borrarSesion: true });
  if (accion === 'reconectar_ya') {
    log(s, 'RECONECTANDO', motivo);
    return abrirSocket(s).catch(e => programarReconexion(s, 'No se pudo abrir el socket', e));
  }
  return programarReconexion(s, motivo, err);
}

/** Abre (o reabre) el socket de la sesión con su sesión guardada. */
async function abrirSocket(s) {
  if (s.cerrando) return;
  const fila = await EntityPhone.scope('conSesion').findByPk(s.id);
  if (!fila) { sesiones.delete(s.id); return; }
  s.auth?.cancelar();
  s.auth = await s.almacen.abrir(fila);
  const generacion = (s.generacion || 0) + 1;
  s.generacion = generacion;
  try { s.sock?.end?.(undefined); } catch { /* socket anterior */ }
  const sock = await crearSocket(s.auth.state);
  s.sock = sock;
  const vigente = () => s.generacion === generacion && sesiones.get(s.id) === s;
  sock.ev.on('creds.update', () => { if (vigente()) s.auth.guardarCreds(); });
  sock.ev.on('connection.update', async (u) => {
    if (!vigente()) return;   // eventos de un socket viejo
    try {
      if (u.qr) {
        s.qr = u.qr;
        s.qrDataUrl = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
        if (s.estado !== 'esperando_qr') log(s, 'ESPERANDO QR');
        s.estado = 'esperando_qr';
      }
      if (u.connection === 'open') await alAbrir(s);
      if (u.connection === 'close') await manejarCierre(s, u.lastDisconnect?.error);
    } catch (err) { log(s, 'ERROR', err.message); }
  });
}

/**
 * Abre (o reutiliza) la sesión de la entidad. Con sesión guardada reconecta sin
 * QR; sin sesión, Baileys emite un QR (estado 'esperando_qr').
 * @param {EntityPhone} filaParam
 */
async function conectar(filaParam) {
  const id = filaParam.id;
  const actual = sesiones.get(id);
  if (actual) {
    // Reconectando: el usuario pide "conectar" → intentar ya, sin esperar el backoff
    if (actual.estado === 'reconectando') { clearTimeout(actual.timerReconexion); abrirSocket(actual).catch(() => {}); }
    return actual;
  }
  const fila = await EntityPhone.scope('conSesion').findByPk(id);
  const almacen = almacenes.actual();
  const nuevo = !almacen.tieneSesion(fila);
  const s = {
    id, etiqueta: etiquetaDe(fila), almacen, nuevo, sock: null, auth: null,
    estado: nuevo ? 'esperando_qr' : 'conectando', qr: null, qrDataUrl: null, numero: null,
    cerrando: false, intentos: 0, generacion: 0, timerReconexion: null, proximoIntento: null,
  };
  sesiones.set(id, s);
  await EntityPhone.update(nuevo ? { estado: 'esperando_qr', ultimo_error: null } : { ultimo_error: null }, { where: { id } });
  log(s, nuevo ? 'NUEVA SESIÓN (QR)' : 'CONECTANDO', `almacén: ${almacen.tipo}`);
  try { await abrirSocket(s); } catch (err) {
    if (nuevo) { sesiones.delete(id); throw err; }
    programarReconexion(s, 'No se pudo abrir el socket', err);
  }
  return s;
}

/** Estado para el panel. */
async function estado(fila) {
  if (!fila) return { estado: 'desconectado', numero: null, qr: null };
  const s = sesiones.get(fila.id);
  if (!s && fila.estado === 'conectado') conectar(fila).catch(() => {});   // proceso reiniciado → reabrir
  return {
    estado: s ? s.estado : fila.estado === 'conectado' ? 'conectando' : fila.estado,
    numero: fila.phone_number,
    qr: s?.estado === 'esperando_qr' ? s.qrDataUrl : null,
    vinculado_at: fila.vinculado_at,
    error: fila.ultimo_error,
    reintentos: s?.intentos || 0,
    proximo_intento: s?.estado === 'reconectando' ? s.proximoIntento : null,
    // Sesión guardada sin socket (p. ej. tras 440): se puede reconectar sin QR
    puede_reconectar: !s && Boolean(fila.phone_number) && fila.estado === 'desconectado',
    almacen: almacenes.actual().tipo,
  };
}

/** Cierra la sesión en WhatsApp (el dispositivo desaparece del teléfono) y libera todo. */
async function desconectar(fila) {
  const s = sesiones.get(fila.id);
  if (s) {
    s.cerrando = true;
    clearTimeout(s.timerReconexion);
    try { await s.sock?.logout(); } catch { /* ya cerrada */ }
  }
  // Sin socket abierto (p. ej. tras 440) se borra la sesión local; el dispositivo
  // puede quedar listado en el teléfono hasta que WhatsApp lo dé de baja.
  await limpiar(fila.id, null);
}

/** ¿La sesión viva corresponde a esta fila y a su número? */
function sesionValida(fila) {
  const s = sesiones.get(fila.id);
  return Boolean(s && s.estado === 'conectado' && fila.estado === 'conectado' && fila.phone_number && s.numero === fila.phone_number);
}

function exigir(fila) {
  if (!sesionValida(fila)) throw Object.assign(new Error('El teléfono de esta entidad no está conectado.'), { status: 409, code: 'TELEFONO_NO_CONECTADO' });
  return sesiones.get(fila.id).sock;
}
const enviarTexto = (fila, telefono, texto) => exigir(fila).sendMessage(jid(telefono), { text: texto });
/** Imagen (Buffer o URL) con epígrafe. */
const enviarImagen = (fila, telefono, imagen, caption = '') =>
  exigir(fila).sendMessage(jid(telefono), { image: Buffer.isBuffer(imagen) ? imagen : { url: imagen }, caption });

/** Al arrancar: reabre las sesiones que estaban conectadas (escalonadas). */
async function restaurarTodas() {
  if (!socketFactory && !baileysLib.instalado()) return 0;
  // Las que quedaron esperando QR ya no tienen QR válido
  await EntityPhone.update({ estado: 'desconectado' }, { where: { estado: 'esperando_qr' } });
  const filas = await EntityPhone.findAll({ where: { estado: 'conectado' } });
  for (const [i, f] of filas.entries()) {
    const t = setTimeout(() => conectar(f).catch(err => console.error(`[wa-entidad] restaurar ${etiquetaDe(f)}:`, err.message)), i * 1500);
    t.unref?.();
  }
  return filas.length;
}

/** Vigilancia: sockets caídos sin evento o reconexiones perdidas. */
function vigilar() {
  for (const s of sesiones.values()) {
    if (s.cerrando) continue;
    const ws = s.sock?.ws;
    if (s.estado === 'conectado' && ws && typeof ws.isOpen === 'boolean' && !ws.isOpen && !ws.isConnecting) {
      log(s, 'VIGILANCIA', 'socket caído sin aviso');
      manejarCierre(s, Object.assign(new Error('socket cerrado (vigilancia)'), { output: { statusCode: 428 } }));
    } else if (s.estado === 'reconectando' && !s.timerReconexion) {
      programarReconexion(s, 'reconexión perdida');
    }
  }
}
let timerVigilancia = null;
function iniciarVigilancia(ms = 60000) {
  if (timerVigilancia) return;
  timerVigilancia = setInterval(vigilar, ms);
  timerVigilancia.unref?.();
}

/** Apagado ordenado: guarda lo pendiente y cierra los sockets SIN cerrar sesión en WhatsApp. */
async function cerrarTodo() {
  const todas = [...sesiones.values()];
  for (const s of todas) { s.cerrando = true; clearTimeout(s.timerReconexion); }
  await Promise.all(todas.map(s => Promise.resolve(s.auth?.flush()).catch(() => {})));
  for (const s of todas) { try { s.sock?.end?.(undefined); } catch { /* ignore */ } }
  sesiones.clear();
  return todas.length;
}

module.exports = {
  conectar, estado, desconectar, enviarTexto, enviarImagen, sesionValida, restaurarTodas, numeroDeJid,
  politica, vigilar, iniciarVigilancia, cerrarTodo,
  setSocketFactory: (f) => { socketFactory = f; },
  setTextoVinculado: (f) => { textoVinculado = f; },
  _sesiones: sesiones,
};
