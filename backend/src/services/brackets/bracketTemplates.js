'use strict';
/**
 * services/brackets/bracketTemplates.js — Selección de plantilla.
 *
 * Prioridad: plantilla del CLUB (BD) → plantilla GLOBAL (BD) → regla INTERNA (bracketRules).
 * Coinciden por cantidad de zonas y clasificados por zona; las plantillas de BD con rango de
 * parejas (min/max) solo aplican si la cantidad de parejas cae en el rango.
 *
 * Las plantillas de BD se mantienen en memoria (la selección es síncrona y se usa en cada
 * vista de la llave): se cargan al iniciar, al guardar desde administración y cada 5 minutos.
 */
const { BRACKET_RULES } = require('./bracketRules');
const { validarRegla } = require('./bracketValidator');

let cache = [];          // plantillas activas de BD, ya validadas
let cargadoEn = 0;
const TTL_MS = 5 * 60 * 1000;

const desdeFila = (t) => ({
  ...(typeof t.template_json === 'string' ? JSON.parse(t.template_json) : t.template_json),
  nombre: t.name, zonas: Number(t.zones), clasifican: Number(t.clasifican),
  min: t.min_pairs ?? undefined, max: t.max_pairs ?? undefined,
  origen: t.id_tenant ? 'club' : 'global', templateId: t.id, id_tenant: t.id_tenant ?? null,
});

/** Lee las plantillas activas de la BD. Las inválidas se ignoran (y se informan). */
async function cargar() {
  try {
    const { TournamentBracketTemplate } = require('../../models');
    const filas = await TournamentBracketTemplate.findAll({ where: { active: true }, order: [['id', 'ASC']], raw: true });
    cache = filas.map(desdeFila).filter(r => {
      const e = validarRegla(r);
      if (e.length) console.error(`[llaves] plantilla ${r.templateId} "${r.nombre}" ignorada: ${e.slice(0, 3).join('; ')}`);
      return !e.length;
    });
    cargadoEn = Date.now();
  } catch (err) {
    console.error('[llaves] no se pudieron leer las plantillas:', err.message);
  }
  return cache.length;
}
function refrescarSiVencio() {
  if (Date.now() - cargadoEn > TTL_MS) { cargadoEn = Date.now(); cargar().catch(() => {}); }
}

const enRango = (r, n) => n == null || ((r.min == null || n >= r.min) && (r.max == null || n <= r.max));

/**
 * Regla para zonas × clasificados (o null).
 * @param {number} numZonas
 * @param {number} clasificanPorZona
 * @param {{ clubId?: number, parejas?: number }} [opts]
 * @returns {import('./bracketTypes').ReglaLlave|null}
 */
function reglaPara(numZonas, clasificanPorZona, { clubId, parejas } = {}) {
  refrescarSiVencio();
  const coincide = (r) => r.zonas === numZonas && r.clasifican === clasificanPorZona;
  const deClub = cache.filter(r => clubId && r.id_tenant === Number(clubId) && coincide(r) && enRango(r, parejas));
  const globales = cache.filter(r => !r.id_tenant && coincide(r) && enRango(r, parejas));
  // Reglas internas: el rango es el del reglamento con zonas de 3; se aplican por zonas
  const internas = Object.entries(BRACKET_RULES).filter(([, r]) => coincide(r)).map(([key, r]) => ({ ...r, key, origen: 'interna' }));
  return deClub.at(-1) || globales.at(-1) || internas[0] || null;   // la más reciente de cada nivel
}

/** Para tests y administración: reemplaza la caché (sin BD). */
const _setCache = (lista) => { cache = lista; cargadoEn = Date.now(); };

module.exports = { cargar, reglaPara, desdeFila, _setCache };
