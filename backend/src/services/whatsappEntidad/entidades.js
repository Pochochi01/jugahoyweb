'use strict';
/**
 * services/whatsappEntidad/entidades.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entidades que pueden tener teléfono propio y sus DESTINATARIOS permitidos.
 *
 *   torneo   → jugadores inscriptos (parejas pendientes o pagadas) del torneo
 *   escuela  → responsables de los alumnos activos de la escuela (opcional: una categoría)
 *   profesor → alumnos de sus clases (últimos 60 días y futuras) + alumnos de
 *              sus categorías de escuela
 *
 * La lista de destinatarios es una LISTA BLANCA calculada en el servidor: un
 * envío solo puede ir a esos números (nunca a uno que mande el cliente).
 */
const { Op } = require('sequelize');
const {
  Complex, Torneo, TorneoPareja, TorneoJugador, Escuela, EscuelaCategoria, EscuelaAlumno, EscuelaProfesorCategoria,
  Profesor, HorarioProfesor, Alumno,
} = require('../../models');

/**
 * Normaliza un WhatsApp argentino a dígitos con 549 (o null si no es válido).
 * '3811234567' → '5493811234567' · '54 381 1234567' → '5493811234567'
 */
function normalizarWa(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `549${d}`;
  else if (d.length === 12 && d.startsWith('54') && !d.startsWith('549')) d = `549${d.slice(2)}`;
  return /^\d{11,15}$/.test(d) ? d : null;
}

/** Datos visibles de la entidad (o null si no es de ese tenant). */
async function cargarEntidad(tenantId, tipo, id) {
  const club = await Complex.findByPk(tenantId, { attributes: ['id', 'nombre'] });
  if (!club) return null;
  if (tipo === 'torneo') {
    const t = await Torneo.findOne({ where: { id, id_tenant: tenantId }, attributes: ['id', 'nombre', 'deporte'] });
    return t && { tipo, id: t.id, tenant_id: tenantId, nombre: t.nombre, club: club.nombre, etiqueta: 'Torneo' };
  }
  if (tipo === 'escuela') {
    const e = await Escuela.findOne({ where: { id, complex_id: tenantId }, attributes: ['id', 'nombre', 'deporte'] });
    return e && { tipo, id: e.id, tenant_id: tenantId, nombre: e.nombre, club: club.nombre, etiqueta: 'Escuela' };
  }
  if (tipo === 'profesor') {
    const p = await Profesor.findOne({ where: { id, id_tenant: tenantId }, attributes: ['id', 'nombre', 'apellido'] });
    return p && { tipo, id: p.id, tenant_id: tenantId, nombre: `Prof. ${p.nombre} ${p.apellido}`, club: club.nombre, etiqueta: 'Profesor' };
  }
  return null;
}

/** Agrega a la lista sin repetir número (el primero gana). */
function agregar(lista, telefono, nombre, detalle) {
  const numero = normalizarWa(telefono);
  if (!numero) return;
  const ya = lista.find(x => x.numero === numero);
  if (ya) { if (detalle && !ya.detalle.includes(detalle)) ya.detalle += ` · ${detalle}`; return; }
  lista.push({ numero, nombre, detalle: detalle || '' });
}

/**
 * Destinatarios permitidos de la entidad.
 * @param {{tipo:string,id:number,tenant_id:number}} entidad
 * @param {{categoria_id?:number}} filtro  (escuela: una sola categoría)
 * @returns {Promise<Array<{numero:string,nombre:string,detalle:string}>>}
 */
async function destinatarios(entidad, filtro = {}) {
  const lista = [];
  if (entidad.tipo === 'torneo') {
    const jugadores = await TorneoJugador.findAll({
      include: [{ model: TorneoPareja, as: 'pareja', attributes: ['id', 'estado_pago'], where: { torneo_id: entidad.id, estado_pago: ['pendiente', 'pagado'] },
        include: [{ model: Torneo, as: 'torneo', attributes: [], where: { id_tenant: entidad.tenant_id } }] }],
      order: [['nombre', 'ASC']],
    });
    for (const j of jugadores) agregar(lista, j.whatsapp, j.nombre, j.pareja.estado_pago === 'pagado' ? 'pagado' : 'pago pendiente');
  }
  if (entidad.tipo === 'escuela') {
    const where = { escuela_id: entidad.id, complex_id: entidad.tenant_id };
    if (filtro.categoria_id) where.id = Number(filtro.categoria_id);
    const cats = await EscuelaCategoria.findAll({ where, attributes: ['id', 'nombre'] });
    const alumnos = cats.length ? await EscuelaAlumno.findAll({ where: { categoria_id: cats.map(c => c.id), complex_id: entidad.tenant_id, estado: 'activo' }, order: [['nombre', 'ASC']] }) : [];
    for (const a of alumnos) agregar(lista, a.responsable_whatsapp, a.responsable_nombre, `${a.nombre} · ${cats.find(c => c.id === a.categoria_id)?.nombre || ''}`);
  }
  if (entidad.tipo === 'profesor') {
    const desde = new Date(); desde.setDate(desde.getDate() - 60);
    const clases = await HorarioProfesor.findAll({
      where: { profesor_id: entidad.id, estado: 'ocupado', fecha: { [Op.gte]: desde.toISOString().slice(0, 10) } },
      include: [{ model: Alumno, as: 'alumnos' }],
      order: [['fecha', 'DESC']],
    });
    for (const c of clases) for (const a of c.alumnos) agregar(lista, a.celular, a.nombre, 'clases');
    const catIds = (await EscuelaProfesorCategoria.findAll({ where: { profesor_id: entidad.id }, raw: true })).map(x => x.categoria_id);
    const cats = catIds.length ? await EscuelaCategoria.findAll({ where: { id: catIds, complex_id: entidad.tenant_id }, attributes: ['id', 'nombre'] }) : [];
    const alumnos = cats.length ? await EscuelaAlumno.findAll({ where: { categoria_id: cats.map(c => c.id), estado: 'activo' } }) : [];
    for (const a of alumnos) agregar(lista, a.responsable_whatsapp, a.responsable_nombre, `${a.nombre} · ${cats.find(c => c.id === a.categoria_id)?.nombre || ''}`);
  }
  return lista;
}

module.exports = { normalizarWa, cargarEntidad, destinatarios };
