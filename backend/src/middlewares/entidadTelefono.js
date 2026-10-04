'use strict';
/**
 * middlewares/entidadTelefono.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cadena de validación ORGANIZADOR → ENTIDAD → TELÉFONO para el WhatsApp propio
 * de torneos, escuelas y profesores. Se usa DESPUÉS del guard de cada módulo
 * (que ya comprobó que el usuario/organizador/profesor accede a ese complejo):
 *
 *   cargarEntidad(tipo, idDe)   la entidad existe y es del tenant de la ruta → req.entidad
 *   telefonoDeEntidad           la fila de entity_phones es de ESA entidad y tenant → req.entityPhone
 *   requiereTelefonoVinculado   además, la sesión viva de Baileys corresponde a esa
 *                               fila y a su número (si no, 409 TELEFONO_NO_CONECTADO)
 */
const { EntityPhone } = require('../models');
const { cargarEntidad: buscarEntidad } = require('../services/whatsappEntidad/entidades');
const sesiones = require('../services/whatsappEntidad/sesiones');

const tenantDe = (req) => Number(req.clubId ?? req.params.complexId);

/** @param {'torneo'|'escuela'|'profesor'} tipo  @param {(req)=>number} idDe */
function cargarEntidad(tipo, idDe) {
  return async (req, res, next) => {
    try {
      const id = Number(idDe(req));
      const entidad = id ? await buscarEntidad(tenantDe(req), tipo, id) : null;
      if (!entidad) return res.status(404).json({ message: 'No encontramos esa entidad en este complejo.' });
      req.entidad = entidad;
      next();
    } catch (err) { next(err); }
  };
}

async function telefonoDeEntidad(req, _res, next) {
  try {
    const e = req.entidad;
    req.entityPhone = await EntityPhone.findOne({ where: { tenant_id: e.tenant_id, entity_type: e.tipo, entity_id: e.id } });
    next();
  } catch (err) { next(err); }
}

function requiereTelefonoVinculado(req, res, next) {
  const fila = req.entityPhone;
  if (!fila || !sesiones.sesionValida(fila)) {
    return res.status(409).json({ message: 'Esta entidad no tiene un teléfono conectado. Tocá "Conectar teléfono" y escaneá el QR.', code: 'TELEFONO_NO_CONECTADO' });
  }
  next();
}

/** Nombre de quien opera (para auditoría): usuario, organizador o profesor. */
function actor(req) {
  if (req.profesor) return `Prof. ${req.profesor.nombre} ${req.profesor.apellido}`;
  if (req.organizador) return `Organizador ${req.organizador.nombre || req.organizador.usuario || req.organizador.id}`;
  if (req.user) return `${req.user.nombre} ${req.user.apellido || ''}`.trim();
  return null;
}

module.exports = { cargarEntidad, telefonoDeEntidad, requiereTelefonoVinculado, actor };
