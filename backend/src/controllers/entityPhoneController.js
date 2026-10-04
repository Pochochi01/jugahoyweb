'use strict';
/**
 * controllers/entityPhoneController.js — WhatsApp propio de una entidad (Baileys)
 *
 * Mismo controlador para torneos, escuelas y profesores; cada módulo lo monta
 * con rutasTelefono() detrás de su guard y de cargarEntidad() (ver middlewares/entidadTelefono):
 *
 *   GET    /whatsapp                 estado (conectado / esperando_qr + QR / desconectado) + últimos envíos
 *   POST   /whatsapp/conectar        genera el QR para vincular el teléfono
 *   DELETE /whatsapp                 desvincula (cierra la sesión en el teléfono)
 *   GET    /whatsapp/destinatarios   inscriptos/alumnos permitidos (?categoria_id para escuelas)
 *   POST   /whatsapp/enviar          { mensaje, numeros?: [], categoria_id? } → 202 (sale en segundo plano)
 */
const router = require('express').Router;
const { EntityPhone } = require('../models');
const sesiones = require('../services/whatsappEntidad/sesiones');
const envios = require('../services/whatsappEntidad/envios');
const { destinatarios } = require('../services/whatsappEntidad/entidades');
const baileysLib = require('../utils/baileysLib');
const { telefonoDeEntidad, requiereTelefonoVinculado, actor } = require('../middlewares/entidadTelefono');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message, ...(err.code ? { code: err.code } : {}), ...(err.ajenos ? { ajenos: err.ajenos } : {}) });
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { send(res, err); } };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

async function respuestaEstado(req) {
  const fila = req.entityPhone;
  return {
    entidad: { tipo: req.entidad.tipo, id: req.entidad.id, nombre: req.entidad.nombre },
    ...(await sesiones.estado(fila)),
    envio_en_curso: Boolean(fila && envios.enCurso.has(fila.id)),
    envios: fila ? await envios.historial(fila) : [],
  };
}

const estado = h(async (req, res) => res.json(await respuestaEstado(req)));

/** Crea/reusa la fila de la entidad y abre la sesión; espera unos segundos el QR. */
const conectar = h(async (req, res) => {
  if (!baileysLib.instalado() && !req.app.get('waEntidadFake')) {
    return res.status(501).json({ message: 'El servidor no tiene instalado Baileys.', code: 'BAILEYS_NOT_INSTALLED' });
  }
  const e = req.entidad;
  let fila = req.entityPhone;
  if (!fila) {
    fila = await EntityPhone.create({ tenant_id: e.tenant_id, entity_type: e.tipo, entity_id: e.id, estado: 'desconectado', vinculado_por: actor(req) });
  } else if (!sesiones.sesionValida(fila)) {
    await fila.update({ vinculado_por: actor(req) });
  }
  req.entityPhone = fila;
  if (!sesiones.sesionValida(fila)) {
    await sesiones.conectar(fila);
    // Esperar hasta ~10 s a que aparezca el QR (o que reconecte con la sesión guardada)
    for (let i = 0; i < 50; i++) {
      const s = sesiones._sesiones.get(fila.id);
      if (!s || s.qrDataUrl || s.estado === 'conectado') break;
      await dormir(200);
    }
    await fila.reload();
  }
  res.json(await respuestaEstado(req));
});

const desconectar = h(async (req, res) => {
  if (req.entityPhone) await sesiones.desconectar(req.entityPhone);
  await req.entityPhone?.reload();
  res.json(await respuestaEstado(req));
});

const listarDestinatarios = h(async (req, res) => {
  const lista = await destinatarios(req.entidad, { categoria_id: req.query.categoria_id });
  res.json({ total: lista.length, destinatarios: lista });
});

const enviar = h(async (req, res) => {
  const b = req.body || {};
  const permitidos = await destinatarios(req.entidad, { categoria_id: b.categoria_id });
  const r = await envios.iniciarEnvio({
    fila: req.entityPhone, entidad: req.entidad, permitidos, numeros: b.numeros, mensaje: b.mensaje, enviadoPor: actor(req),
  });
  res.status(202).json({ ...r, message: `Enviando ${r.total} mensaje(s) desde +${r.desde}. Salen de a uno para cuidar el número.` });
});

/**
 * Router listo para montar en cada módulo.
 * @param {{ acciones?: string[] }} opts  acciones permitidas (por defecto todas):
 *   'estado' | 'conectar' | 'desconectar' | 'destinatarios' | 'enviar'
 */
function rutasTelefono({ acciones = ['estado', 'conectar', 'desconectar', 'destinatarios', 'enviar'] } = {}) {
  const r = router({ mergeParams: true });
  r.use(telefonoDeEntidad);
  const si = (a) => acciones.includes(a);
  const no = (_req, res) => res.status(403).json({ message: 'No tenés permiso para esta acción sobre el teléfono.' });
  r.get('/', si('estado') ? estado : no);
  r.post('/conectar', si('conectar') ? conectar : no);
  r.delete('/', si('desconectar') ? desconectar : no);
  r.get('/destinatarios', si('destinatarios') ? listarDestinatarios : no);
  r.post('/enviar', si('enviar') ? [requiereTelefonoVinculado, enviar] : no);
  return r;
}

module.exports = { rutasTelefono, estado, conectar, desconectar, listarDestinatarios, enviar };
