'use strict';
/**
 * controllers/localidadesController.js
 * Provee provincias y localidades desde la tabla `localidades` (catálogo INDEC).
 * Se usa en el wizard /adherir-complejo (Paso 2) para los selects encadenados
 * Provincia → Ciudad/Localidad.
 *
 * GET /api/public/provincias                → string[]  (provincias únicas, ordenadas)
 * GET /api/public/localidades?provincia=X   → string[]  (localidades de esa provincia)
 */
const { Localidad } = require('../models');

// ── Listado de provincias (distinct) ──────────────────────────
async function getProvincias(req, res) {
  try {
    const rows = await Localidad.findAll({
      attributes: ['provincia_nombre'],
      group     : ['provincia_nombre'],           // DISTINCT
      order     : [['provincia_nombre', 'ASC']],
      raw       : true,
    });
    res.json(rows.map(r => r.provincia_nombre));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Localidades de una provincia (distinct, filtradas) ─────────
async function getLocalidades(req, res) {
  try {
    const provincia = (req.query.provincia || '').trim();
    if (!provincia) {
      return res.status(400).json({ message: 'El parámetro "provincia" es requerido' });
    }

    const rows = await Localidad.findAll({
      attributes: ['localidad_nombre'],
      where     : { provincia_nombre: provincia },
      group     : ['localidad_nombre'],           // evita nombres duplicados entre departamentos
      order     : [['localidad_nombre', 'ASC']],
      raw       : true,
    });

    // Si la provincia no existe / no tiene localidades, devolvemos array vacío (no es error)
    res.json(rows.map(r => r.localidad_nombre));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * Valida la coherencia del par Provincia–Localidad contra el catálogo.
 * Reutilizable desde otros controladores (p. ej. registerComplex).
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function validateProvinciaLocalidad(provincia, localidad) {
  const prov = (provincia || '').trim();
  const loc  = (localidad || '').trim();

  if (!prov) return { ok: false, reason: 'La provincia es obligatoria.' };
  if (!loc)  return { ok: false, reason: 'La ciudad/localidad es obligatoria.' };

  // La provincia debe existir en el catálogo (lista fija de provincias argentinas)
  const provCount = await Localidad.count({ where: { provincia_nombre: prov } });
  if (provCount === 0) return { ok: false, reason: 'La provincia seleccionada no es válida.' };

  // La localidad debe pertenecer a esa provincia (coherencia referencial)
  const pairCount = await Localidad.count({ where: { provincia_nombre: prov, localidad_nombre: loc } });
  if (pairCount === 0) {
    return { ok: false, reason: 'La ciudad/localidad no corresponde a la provincia seleccionada.' };
  }

  return { ok: true };
}

module.exports = { getProvincias, getLocalidades, validateProvinciaLocalidad };
