'use strict';
/**
 * utils/complejoNombre.js
 *  - nombreDisponible(): el nombre de un complejo es ÚNICO sin importar
 *    mayúsculas/minúsculas, tildes ni espacios extra ("Pinta Futbol" = "pinta  fútbol").
 *  - slugInvitacion(): link de invitación legible y único por complejo:
 *    /invite/pinta-futbol, y si el nombre ya lo usa otro complejo → pinta-futbol-2, -3…
 */
const { Op, fn, col, where } = require('sequelize');
const { Complex, Invite } = require('../models');

/** "  Pinta  Fútbol " → "pinta futbol" (para comparar) */
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** "Pinta Fútbol 5!" → "pinta-futbol-5" */
const slugify = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'complejo';

/**
 * ¿El nombre está libre? (comparación sin mayúsculas, tildes ni espacios extra)
 * @returns {Promise<{ok:boolean, existente?:object}>}
 */
async function nombreDisponible(nombre, excluirId = null) {
  const buscado = normalizar(nombre);
  if (!buscado) return { ok: false };
  // Prefiltro en SQL por la versión en minúsculas sin espacios de borde; se confirma en JS (tildes)
  const candidatos = await Complex.findAll({
    where: { ...(excluirId ? { id: { [Op.ne]: excluirId } } : {}) },
    attributes: ['id', 'nombre'],
  });
  const existente = candidatos.find(c => normalizar(c.nombre) === buscado);
  return existente ? { ok: false, existente } : { ok: true };
}

const MSG_DUPLICADO = (nombre) => `Ya existe un complejo llamado "${nombre}". Elegí otro nombre.`;

/** Token de invitación legible y único: slug del nombre (+ -2, -3… si está tomado por otro complejo). */
async function slugInvitacion(complex) {
  const base = slugify(complex.nombre);
  const usados = await Invite.findAll({
    where: { [Op.or]: [{ token: base }, { token: { [Op.like]: `${base}-%` } }] },
    attributes: ['token', 'complex_id'], raw: true,
  });
  const propio = usados.find(u => u.complex_id === complex.id && (u.token === base || new RegExp(`^${base}-\\d+$`).test(u.token)));
  if (propio) return propio.token;
  const tomados = new Set(usados.map(u => u.token));
  if (!tomados.has(base)) return base;
  for (let n = 2; ; n++) if (!tomados.has(`${base}-${n}`)) return `${base}-${n}`;
}

module.exports = { normalizar, slugify, nombreDisponible, slugInvitacion, MSG_DUPLICADO, _sql: { fn, col, where } };
