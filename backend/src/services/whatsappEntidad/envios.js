'use strict';
/**
 * services/whatsappEntidad/envios.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Envío de mensajes desde el teléfono vinculado de una entidad a sus
 * destinatarios (lista blanca de entidades.js).
 *
 *  - Se registra cada mensaje en entity_phone_mensajes (auditoría).
 *  - Sale de a uno, con pausa aleatoria (WA_ENTIDAD_PAUSA_MS, def. 2500–4500 ms)
 *    para no disparar el antispam de WhatsApp. Un envío por entidad a la vez.
 *  - Máximo WA_ENTIDAD_MAX_DEST (def. 300) destinatarios por envío.
 *  - Antes de cada mensaje se vuelve a verificar que la sesión viva sea la de
 *    esa entidad y número; si se desvincula a mitad, el resto queda en error.
 */
const crypto = require('crypto');
const { EntityPhone, EntityPhoneMensaje } = require('../../models');
const sesiones = require('./sesiones');

const PAUSA_MS = Number(process.env.WA_ENTIDAD_PAUSA_MS ?? 2500);
const MAX_DEST = Number(process.env.WA_ENTIDAD_MAX_DEST || 300);
const enCurso = new Set();   // entity_phone_id con un envío corriendo
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/** Encabezado y pie: el destinatario sabe de qué entidad y club le escriben. */
function armarTexto(entidad, mensaje, nombre) {
  const cuerpo = String(mensaje).replace(/\{nombre\}/gi, (nombre || '').split(' ')[0] || '');
  return `📣 *${entidad.nombre}*\n\n${cuerpo}\n\n_${entidad.club} · enviado con JugaHoy_`;
}

/**
 * Valida destinatarios contra la lista blanca y arranca el envío en segundo plano.
 * @param {object} p
 * @param {EntityPhone} p.fila           teléfono de la entidad (validado por el middleware)
 * @param {object} p.entidad            { tipo, id, tenant_id, nombre, club }
 * @param {Array} p.permitidos          destinatarios permitidos [{numero,nombre}]
 * @param {string[]|undefined} p.numeros números elegidos (vacío = todos los permitidos)
 * @param {string} p.mensaje
 * @param {string} p.enviadoPor
 */
async function iniciarEnvio({ fila, entidad, permitidos, numeros, mensaje, enviadoPor }) {
  const texto = String(mensaje || '').trim();
  if (texto.length < 2) throw Object.assign(new Error('Escribí el mensaje.'), { status: 400 });
  if (texto.length > 2000) throw Object.assign(new Error('El mensaje no puede superar los 2000 caracteres.'), { status: 400 });
  if (enCurso.has(fila.id)) throw Object.assign(new Error('Ya hay un envío en curso desde este teléfono. Esperá a que termine.'), { status: 409, code: 'ENVIO_EN_CURSO' });

  let destinos = permitidos;
  if (Array.isArray(numeros) && numeros.length) {
    const pedidos = [...new Set(numeros.map(n => String(n).replace(/\D/g, '')))];
    const ajenos = pedidos.filter(n => !permitidos.some(p => p.numero === n));
    if (ajenos.length) {
      throw Object.assign(new Error(`${ajenos.length} número(s) no son inscriptos/alumnos de esta entidad: no se envió nada.`), { status: 403, code: 'DESTINATARIO_NO_PERMITIDO', ajenos });
    }
    destinos = permitidos.filter(p => pedidos.includes(p.numero));
  }
  return encolar({ fila, entidad, destinos: destinos.map(d => ({ ...d, texto })), enviadoPor });
}

/**
 * Encola destinos YA validados contra la lista blanca, cada uno con su texto
 * (permite mensajes personalizados por alumno). Devuelve { envio_id, total, desde }.
 * @param {{fila, entidad, destinos: Array<{numero:string,nombre:string,texto:string}>, enviadoPor?:string}} p
 */
async function encolar({ fila, entidad, destinos, enviadoPor }) {
  if (enCurso.has(fila.id)) throw Object.assign(new Error('Ya hay un envío en curso desde este teléfono. Esperá a que termine.'), { status: 409, code: 'ENVIO_EN_CURSO' });
  if (!destinos.length) throw Object.assign(new Error('No hay destinatarios con WhatsApp válido.'), { status: 400 });
  if (destinos.some(d => String(d.texto || '').trim().length < 2 || d.texto.length > 4000)) throw Object.assign(new Error('Hay un mensaje vacío o demasiado largo.'), { status: 400 });
  if (destinos.length > MAX_DEST) throw Object.assign(new Error(`Máximo ${MAX_DEST} destinatarios por envío.`), { status: 400 });

  const envioId = crypto.randomUUID();
  await EntityPhoneMensaje.bulkCreate(destinos.map(d => ({
    entity_phone_id: fila.id, tenant_id: entidad.tenant_id, entity_type: entidad.tipo, entity_id: entidad.id,
    envio_id: envioId, desde_numero: fila.phone_number, destino: d.numero, destinatario_nombre: d.nombre,
    mensaje: d.texto, estado: 'pendiente', enviado_por: enviadoPor || null,
  })));
  enCurso.add(fila.id);
  procesar(fila.id, entidad, envioId).catch(err => console.error(`[wa-entidad] envío ${envioId}:`, err.message)).finally(() => enCurso.delete(fila.id));
  return { envio_id: envioId, total: destinos.length, desde: fila.phone_number };
}

async function procesar(filaId, entidad, envioId) {
  const pendientes = await EntityPhoneMensaje.findAll({ where: { envio_id: envioId, estado: 'pendiente' }, order: [['id', 'ASC']] });
  for (const [i, m] of pendientes.entries()) {
    // Revalidar en cada mensaje: la fila y la sesión siguen siendo de esa entidad y número
    const fila = await EntityPhone.findByPk(filaId);
    if (!fila || fila.phone_number !== m.desde_numero) {
      await EntityPhoneMensaje.update({ estado: 'error', error: 'El teléfono se desvinculó durante el envío.' }, { where: { envio_id: envioId, estado: 'pendiente' } });
      return;
    }
    try {
      await sesiones.enviarTexto(fila, m.destino, armarTexto(entidad, m.mensaje, m.destinatario_nombre));
      await m.update({ estado: 'enviado' });
    } catch (err) {
      await m.update({ estado: 'error', error: String(err.message).slice(0, 250) });
    }
    if (i < pendientes.length - 1 && PAUSA_MS > 0) await dormir(PAUSA_MS + Math.floor(Math.random() * 2000));
  }
}

/** Últimos envíos de la entidad, agrupados (para el panel). */
async function historial(fila, limite = 10) {
  const filas = await EntityPhoneMensaje.findAll({
    where: { entity_phone_id: fila.id },
    attributes: ['envio_id', 'mensaje', 'estado', 'enviado_por', 'desde_numero', 'created_at'],
    order: [['id', 'DESC']], limit: 2000, raw: true,
  });
  const envios = new Map();
  for (const f of filas) {
    if (!envios.has(f.envio_id)) {
      if (envios.size >= limite) continue;
      envios.set(f.envio_id, { envio_id: f.envio_id, mensaje: f.mensaje, enviado_por: f.enviado_por, desde: f.desde_numero, fecha: f.created_at, total: 0, enviados: 0, errores: 0, pendientes: 0 });
    }
    const e = envios.get(f.envio_id);
    e.total++;
    if (f.estado === 'enviado') e.enviados++; else if (f.estado === 'error') e.errores++; else e.pendientes++;
  }
  return [...envios.values()];
}

module.exports = { iniciarEnvio, encolar, historial, armarTexto, enCurso };
