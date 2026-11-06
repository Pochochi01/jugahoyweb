'use strict';
/**
 * services/brackets/bracketService.js — Fachada del motor de llaves + administración de plantillas.
 *
 * Uso desde torneos:   generateBracketFromZones, validarLlave, nombreRonda, reglaPara
 * Administración:      listarPlantillas, guardarPlantilla, desactivarPlantilla, catalogo, probarPlantilla
 * (solo Administrador General; las rutas lo controlan)
 */
const { BRACKET_RULES, ORDEN_RONDAS, nombreRonda } = require('./bracketRules');
const { validarRegla, validarLlave } = require('./bracketValidator');
const { generateBracketFromZones, generarCuadro } = require('./bracketGenerator');
const { simularPropagacion } = require('./bracketPropagator');
const templates = require('./bracketTemplates');

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/** Vista legible de una regla: "1° Zona A vs 2° Zona C", "Ganador cuartos-2"… */
function describir(regla) {
  const etq = (ref) => (ref == null ? 'BYE' : ref.startsWith('W:') ? `Ganador ${ref.slice(2)}` : `${ref.slice(0, -1)}° Zona ${ref.slice(-1)}`);
  return ORDEN_RONDAS.filter(r => regla.rondas?.[r]?.length).map(r => ({
    ronda: r, nombre: nombreRonda(regla, r),
    partidos: regla.rondas[r].map(p => ({ key: p.key, cruce: `${etq(p.local)} vs ${etq(p.visitante)}`, siguiente: p.siguiente ? `${p.siguiente.key} (lugar ${p.siguiente.slot})` : null })),
  }));
}

/** Reglas internas + plantillas de BD (con su descripción legible). */
async function catalogo(clubId) {
  const { TournamentBracketTemplate } = require('../../models');
  const { Op } = require('sequelize');
  const filas = await TournamentBracketTemplate.findAll({ where: { [Op.or]: [{ id_tenant: null }, { id_tenant: clubId }] }, order: [['zones', 'ASC'], ['id', 'DESC']] });
  return {
    internas: Object.entries(BRACKET_RULES).map(([key, r]) => ({ key, nombre: r.nombre, min: r.min, max: r.max, zonas: r.zonas, clasifican: r.clasifican, rondas: describir(r), regla: r })),
    plantillas: filas.map(f => {
      const r = templates.desdeFila(f.toJSON());
      return { ...f.toJSON(), errores: validarRegla(r), rondas: describir(r) };
    }),
  };
}

function normalizar(body = {}) {
  const tpl = typeof body.template_json === 'string' ? (() => { try { return JSON.parse(body.template_json); } catch { throw httpError(400, 'template_json no es un JSON válido.'); } })() : body.template_json;
  const regla = {
    ...(tpl || {}),
    nombre: String(body.name || '').trim(), zonas: Number(body.zones), clasifican: Number(body.clasifican || 2),
    min: body.min_pairs === '' || body.min_pairs == null ? undefined : Number(body.min_pairs),
    max: body.max_pairs === '' || body.max_pairs == null ? undefined : Number(body.max_pairs),
  };
  if (!regla.nombre) throw httpError(400, 'Poné un nombre a la plantilla.');
  return { regla, template_json: { rondas: tpl?.rondas || {}, ...(tpl?.etiquetas && { etiquetas: tpl.etiquetas }) } };
}

/** Valida sin guardar: errores + vista de la llave resultante. */
function probarPlantilla(body) {
  const { regla } = normalizar(body);
  const errores = validarRegla(regla);
  const vista = errores.length ? null : describir(regla);
  const sim = errores.length ? null : simularPropagacion(generarCuadro(regla, (pl) => pl.key));
  return { valida: !errores.length, errores, rondas: vista, partidos_a_jugar: sim?.jugados ?? null };
}

/** Crea o actualiza una plantilla (validada). clubId null = global. */
async function guardarPlantilla(body, { id, clubId = null, usuario } = {}) {
  const { TournamentBracketTemplate } = require('../../models');
  const { regla, template_json } = normalizar(body);
  const errores = validarRegla(regla);
  if (errores.length) throw httpError(400, `La plantilla tiene errores: ${errores.slice(0, 5).join('; ')}`, { errores });
  const datos = {
    name: regla.nombre, zones: regla.zonas, clasifican: regla.clasifican, min_pairs: regla.min ?? null, max_pairs: regla.max ?? null,
    template_json, active: body.active !== false, id_tenant: body.alcance === 'club' ? clubId : null, usuario: usuario || null,
  };
  let fila;
  if (id) {
    fila = await TournamentBracketTemplate.findByPk(id);
    if (!fila) throw httpError(404, 'Plantilla no encontrada');
    await fila.update(datos);
  } else fila = await TournamentBracketTemplate.create(datos);
  await templates.cargar();
  return fila;
}

async function cambiarActiva(id, active) {
  const { TournamentBracketTemplate } = require('../../models');
  const fila = await TournamentBracketTemplate.findByPk(id);
  if (!fila) throw httpError(404, 'Plantilla no encontrada');
  await fila.update({ active: Boolean(active) });
  await templates.cargar();
  return fila;
}

// Las reglas internas se validan al cargar: una regla mal escrita no llega a producción
for (const [key, regla] of Object.entries(BRACKET_RULES)) {
  const e = validarRegla(regla);
  if (e.length) throw new Error(`BRACKET_RULES.${key} inválida: ${e.join('; ')}`);
}

module.exports = {
  generateBracketFromZones, validarLlave, validarRegla, nombreRonda, reglaPara: templates.reglaPara, cargarPlantillas: templates.cargar,
  catalogo, probarPlantilla, guardarPlantilla, cambiarActiva, describir,
};
