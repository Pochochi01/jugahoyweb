'use strict';
/**
 * services/whatsappEntidad/almacenes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dónde se guarda la sesión de Baileys de cada entidad (WA_SESION_STORE):
 *
 *   'db'      (por defecto) entity_phones.baileys_session, cifrada (AES-256-GCM).
 *             Sobrevive a redeploys y no depende del disco del servidor.
 *   'archivo' useMultiFileAuthState en WA_SESSIONS_DIR/<tipo><id>
 *             (p. ej. backend/sessions/torneo1, sessions/escuela2, sessions/profesor3)
 *             + meta.json con tenant_id / entity_type / entity_id / entity_phone_id.
 *
 * En ambos casos la fila de entity_phones (tenant_id + entity_type + entity_id)
 * es la que relaciona la sesión con la entidad. Las credenciales (creds) se
 * guardan EN EL ACTO al cambiar (al escanear el QR): un reinicio inmediato no
 * vuelve a pedir QR. Las claves de Signal (muy frecuentes) se agrupan ~800 ms.
 *
 * Interfaz de un almacén abierto:
 *   { state, guardarCreds(), flush(), cancelar() }
 * y del módulo: abrir(fila), tieneSesion(fila), borrar(fila), tipo
 */
const fs = require('fs');
const path = require('path');
const { EntityPhone } = require('../../models');
const { cifrar, descifrar } = require('../../utils/cifrado');
const baileysLib = require('../../utils/baileysLib');

const SESSIONS_DIR = process.env.WA_SESSIONS_DIR || path.join(__dirname, '..', '..', '..', 'sessions');
const carpeta = (fila) => path.join(SESSIONS_DIR, `${fila.entity_type}${fila.entity_id}`);

// ── Base de datos ─────────────────────────────────────────────
const db = {
  tipo: 'db',
  tieneSesion: (fila) => Boolean(fila.baileys_session),
  async abrir(fila) {
    const { initAuthCreds, BufferJSON, proto } = await baileysLib.cargar();
    let data = { creds: initAuthCreds(), keys: {} };
    if (fila.baileys_session) {
      try { data = JSON.parse(descifrar(fila.baileys_session), BufferJSON.reviver); } catch (err) {
        console.warn(`[wa-entidad] sesión ilegible de entity_phone ${fila.id}: se pedirá un QR nuevo (${err.message})`);
      }
    }
    data.keys = data.keys || {};
    let timer = null;
    let cadena = Promise.resolve();   // escrituras en orden
    const escribir = () => {
      clearTimeout(timer); timer = null;
      const blob = cifrar(JSON.stringify(data, BufferJSON.replacer));
      cadena = cadena.then(() => EntityPhone.update({ baileys_session: blob }, { where: { id: fila.id } }))
        .catch(err => console.error(`[wa-entidad] guardar sesión ${fila.id}:`, err.message));
      return cadena;
    };
    const diferido = () => { clearTimeout(timer); timer = setTimeout(escribir, 800); };
    return {
      state: {
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
            diferido();
          },
        },
      },
      guardarCreds: escribir,                                    // inmediato
      flush: () => (timer ? escribir() : cadena),
      cancelar: () => { clearTimeout(timer); timer = null; },
    };
  },
  async borrar(fila) {
    await EntityPhone.update({ baileys_session: null }, { where: { id: fila.id } });
  },
};

// ── Archivos (useMultiFileAuthState) ──────────────────────────
const archivo = {
  tipo: 'archivo',
  tieneSesion: (fila) => fs.existsSync(path.join(carpeta(fila), 'creds.json')),
  async abrir(fila) {
    const { useMultiFileAuthState } = await baileysLib.cargar();
    const dir = carpeta(fila);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      entity_phone_id: fila.id, tenant_id: fila.tenant_id, entity_type: fila.entity_type, entity_id: fila.entity_id,
    }, null, 2));
    const { state, saveCreds } = await useMultiFileAuthState(dir);   // las claves se escriben solas
    return { state, guardarCreds: saveCreds, flush: () => saveCreds(), cancelar: () => {} };
  },
  async borrar(fila) {
    fs.rmSync(carpeta(fila), { recursive: true, force: true });
  },
};

const actual = () => ((process.env.WA_SESION_STORE || 'db').toLowerCase() === 'archivo' ? archivo : db);

module.exports = { actual, db, archivo, carpeta, SESSIONS_DIR };
