'use strict';
/**
 * controllers/escuelaMensajesController.js — Mensajes de la escuela a los padres
 * Rutas: /api/escuela/club/:complexId/mensajes...?escuela_id=N
 * (detrás de authenticate + requireComplexAccess + requirePermission('escuela') + cargarEscuela:
 *  el tenant, el permiso del administrador/colaborador y la escuela ya están validados)
 *
 *   GET    /mensajes/plantillas          tipos, plantilla sugerida y variables
 *   GET    /mensajes                     historial (borradores y enviados, con resultado del envío)
 *   POST   /mensajes                     { tipo, contenido?, categoria_id?, periodo?, fecha? } → borrador
 *   PUT    /mensajes/:id                 editar (solo borradores)
 *   DELETE /mensajes/:id                 borrar (solo borradores)
 *   POST   /mensajes/:id/duplicar        copia como borrador (para reusar uno enviado)
 *   GET    /mensajes/:id/destinatarios   vista previa por alumno (texto personalizado)
 *   POST   /mensajes/:id/enviar          { alumno_ids?, textos?: { [alumno_id]: texto } } → 202
 *        Sale desde el WhatsApp VINCULADO A LA ESCUELA (entity_phones). Sin teléfono → 409.
 */
const { EscuelaMensaje, EntityPhone, EntityPhoneMensaje } = require('../models');
const msvc = require('../services/escuela/mensajesService');
const esc = require('../services/escuela/escuelaService');
const sesiones = require('../services/whatsappEntidad/sesiones');
const envios = require('../services/whatsappEntidad/envios');
const { cargarEntidad } = require('../services/whatsappEntidad/entidades');

const h = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    res.status(err.status || 500).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
};
const quien = (req) => (req.user ? `${req.user.nombre} ${req.user.apellido || ''}`.trim() : null);

async function cargar(req) {
  const m = await EscuelaMensaje.findOne({ where: { id: req.params.id, tenant_id: req.escuela.complex_id, escuela_id: req.escuela.id } });
  if (!m) throw esc.httpError(404, 'Mensaje no encontrado');
  return m;
}
const soloBorrador = (m) => { if (m.estado !== 'borrador') throw esc.httpError(409, 'El mensaje ya se envió: duplicalo para mandarlo de nuevo.'); };

const plantillas = h(async (_req, res) => res.json({
  tipos: msvc.TIPOS.map(t => ({ tipo: t, label: msvc.TIPO_LABEL[t], plantilla: msvc.PLANTILLAS[t] })),
  variables: msvc.VARIABLES,
}));

const listar = h(async (req, res) => {
  const mensajes = await EscuelaMensaje.findAll({ where: { tenant_id: req.escuela.complex_id, escuela_id: req.escuela.id }, order: [['id', 'DESC']], limit: 100 });
  const envioIds = mensajes.map(m => m.envio_id).filter(Boolean);
  const conteos = envioIds.length ? await EntityPhoneMensaje.count({ where: { envio_id: envioIds }, group: ['envio_id', 'estado'] }) : [];
  res.json(mensajes.map(m => {
    const c = (estado) => Number(conteos.find(x => x.envio_id === m.envio_id && x.estado === estado)?.count || 0);
    return { ...m.toJSON(), tipo_label: msvc.TIPO_LABEL[m.tipo], ...(m.envio_id ? { enviados: c('enviado'), errores: c('error'), pendientes: c('pendiente') } : {}) };
  }));
});

const crear = h(async (req, res) => {
  const d = msvc.validar(req.body || {}, {}, req.catIds);
  res.status(201).json(await EscuelaMensaje.create({ ...d, tenant_id: req.escuela.complex_id, escuela_id: req.escuela.id, creado_por: quien(req) }));
});

const editar = h(async (req, res) => {
  const m = await cargar(req);
  soloBorrador(m);
  await m.update(msvc.validar(req.body || {}, m.toJSON(), req.catIds));
  res.json(m);
});

const borrar = h(async (req, res) => {
  const m = await cargar(req);
  soloBorrador(m);
  await m.destroy();
  res.json({ ok: true });
});

const duplicar = h(async (req, res) => {
  const m = await cargar(req);
  const { tipo, contenido, categoria_id, periodo, fecha } = m;
  res.status(201).json(await EscuelaMensaje.create({ tipo, contenido, categoria_id, periodo, fecha, tenant_id: m.tenant_id, escuela_id: m.escuela_id, creado_por: quien(req) }));
});

const vistaPrevia = h(async (req, res) => {
  const m = await cargar(req);
  const r = await msvc.destinatarios(m, req.escuela, req.catIds);
  res.json({ total: r.destinatarios.length, ...r });
});

const enviar = h(async (req, res) => {
  const m = await cargar(req);
  soloBorrador(m);
  // Teléfono VINCULADO A ESTA ESCUELA (tenant + entidad) con sesión viva
  const fila = await EntityPhone.findOne({ where: { tenant_id: req.escuela.complex_id, entity_type: 'escuela', entity_id: req.escuela.id } });
  if (!fila || !sesiones.sesionValida(fila)) {
    throw Object.assign(esc.httpError(409, 'La escuela no tiene un WhatsApp conectado. Vinculalo en la pestaña WhatsApp (escaneando el QR).'), { code: 'TELEFONO_NO_CONECTADO' });
  }
  const { destinatarios } = await msvc.destinatarios(m, req.escuela, req.catIds);
  const b = req.body || {};
  let elegidos = destinatarios;
  if (Array.isArray(b.alumno_ids) && b.alumno_ids.length) {
    const pedidos = [...new Set(b.alumno_ids.map(Number))];
    const ajenos = pedidos.filter(id => !destinatarios.some(d => d.alumno_id === id));
    if (ajenos.length) throw Object.assign(esc.httpError(403, `${ajenos.length} alumno(s) no corresponden a este mensaje o a esta escuela: no se envió nada.`), { code: 'DESTINATARIO_NO_PERMITIDO' });
    elegidos = destinatarios.filter(d => pedidos.includes(d.alumno_id));
  }
  // Textos editados a mano por alumno (p. ej. un recibo puntual)
  const textos = b.textos && typeof b.textos === 'object' ? b.textos : {};
  for (const id of Object.keys(textos)) {
    if (!elegidos.some(d => d.alumno_id === Number(id))) throw Object.assign(esc.httpError(403, 'Hay un texto editado para un alumno que no está en el envío.'), { code: 'DESTINATARIO_NO_PERMITIDO' });
  }
  const entidad = await cargarEntidad(req.escuela.complex_id, 'escuela', req.escuela.id);
  const r = await envios.encolar({
    fila, entidad, enviadoPor: quien(req),
    destinos: elegidos.map(d => ({ numero: d.numero, nombre: `${d.responsable} (${d.alumno})`, texto: String(textos[d.alumno_id] ?? d.texto).trim() })),
  });
  await m.update({ estado: 'enviado', envio_id: r.envio_id, total_destinatarios: r.total, enviado_por: quien(req), enviado_at: new Date() });
  res.status(202).json({ ...r, message: `Enviando ${r.total} mensaje(s) desde el WhatsApp de la escuela (+${r.desde}).` });
});

module.exports = { plantillas, listar, crear, editar, borrar, duplicar, vistaPrevia, enviar };
