'use strict';
/**
 * services/gym/comun.js — Utilidades compartidas del módulo Gym:
 * auditoría obligatoria, errores HTTP, fechas y validación de campos.
 */
const { GymAuditoria } = require('../../models');
const { todayAR, sumarDias } = require('../../utils/time');

function httpError(status, message, extra = {}) { return Object.assign(new Error(message), { status, ...extra }); }

/** IP real del cliente (detrás de proxy). */
const ipDe = (req) => String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req?.ip || null;

/**
 * Registra una acción en gym_auditoria (usuario, fecha/hora, acción, IP, sucursal, empresa).
 * Nunca lanza: la auditoría no debe romper la operación.
 */
async function auditar(req, accion, entidad, entidadId = null, detalle = null, { complexId, sucursalId } = {}) {
  try {
    const u = req?.user;
    await GymAuditoria.create({
      complex_id: Number(complexId ?? req?.params?.complexId),
      sucursal_id: sucursalId ?? (req?.body?.sucursal_id ? Number(req.body.sucursal_id) : null),
      usuario_id: u?.id ?? null,
      usuario: u ? `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || `#${u.id}` : (req?.socio ? `Socio ${req.socio.nombre} ${req.socio.apellido}` : 'sistema'),
      accion, entidad, entidad_id: entidadId, detalle, ip: ipDe(req),
    });
  } catch (err) {
    console.error(`[gym][auditoría] no se pudo registrar ${accion} ${entidad}#${entidadId}:`, err.message);
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Valida y copia solo los campos permitidos del body.
 * spec: { campo: { req?, tipo?: 'str'|'int'|'num'|'bool'|'fecha'|'hora'|'enum'|'email'|'json', max?, valores?, min? } }
 */
function campos(body = {}, spec, { parcial = false } = {}) {
  const out = {};
  for (const [k, r] of Object.entries(spec)) {
    let v = body[k];
    if (v === undefined) { if (r.req && !parcial) throw httpError(400, `Falta el campo "${r.label || k}".`); continue; }
    if (v === '' || v === null) {
      if (r.req) throw httpError(400, `El campo "${r.label || k}" es obligatorio.`);
      out[k] = null; continue;
    }
    const label = r.label || k;
    switch (r.tipo || 'str') {
      case 'str': v = String(v).trim(); if (r.max && v.length > r.max) throw httpError(400, `"${label}" admite hasta ${r.max} caracteres.`); break;
      case 'int': v = Number(v); if (!Number.isInteger(v) || v < (r.min ?? 0)) throw httpError(400, `"${label}" debe ser un entero válido.`); break;
      case 'num': v = Number(v); if (!Number.isFinite(v) || v < (r.min ?? 0)) throw httpError(400, `"${label}" debe ser un número válido.`); break;
      case 'bool': v = v === true || v === 'true' || v === 1 || v === '1'; break;
      case 'fecha': if (!ISO.test(String(v))) throw httpError(400, `"${label}" debe tener formato AAAA-MM-DD.`); v = String(v); break;
      case 'hora': v = String(v).slice(0, 5); if (!HHMM.test(v)) throw httpError(400, `"${label}" debe tener formato HH:MM.`); break;
      case 'enum': if (!r.valores.includes(v)) throw httpError(400, `"${label}" inválido. Valores: ${r.valores.join(', ')}.`); break;
      case 'email': v = String(v).trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw httpError(400, `"${label}" no es un email válido.`); break;
      case 'json': break;
      default: break;
    }
    out[k] = v;
  }
  return out;
}

/** Respuesta de error uniforme. */
function responderError(res, err, contexto = 'gym') {
  if (err.status) return res.status(err.status).json({ message: err.message, ...(err.code && { code: err.code }) });
  if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ya existe un registro con esos datos.' });
  if (err.name === 'SequelizeForeignKeyConstraintError') return res.status(409).json({ message: 'El registro está en uso por otros datos y no se puede eliminar.' });
  console.error(`[${contexto}]`, err);
  res.status(500).json({ message: 'Error interno del módulo Gym.' });
}

/** Envuelve un handler async con manejo de errores uniforme. */
const h = (fn, contexto) => async (req, res) => { try { await fn(req, res); } catch (err) { responderError(res, err, contexto); } };

/** Fecha fin de un período a partir del inicio (inclusive). */
function finDePeriodo(inicio, periodo) {
  const d = new Date(`${inicio}T12:00:00Z`);
  const meses = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[periodo];
  if (periodo === 'diario') return inicio;
  if (periodo === 'semanal') return sumarDias(inicio, 6);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return sumarDias(d.toISOString().slice(0, 10), -1);
}

const nombreCompleto = (s) => `${s?.apellido || ''}, ${s?.nombre || ''}`.replace(/^, |, $/g, '');

module.exports = { httpError, ipDe, auditar, campos, responderError, h, finDePeriodo, todayAR, sumarDias, nombreCompleto, ISO, HHMM };
