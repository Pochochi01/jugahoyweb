'use strict';
/**
 * services/actividadesService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista unificada de las ENTIDADES de un complejo (escuelas, profesores y
 * torneos, de cualquier deporte). Fuente única para:
 *   - la web pública (GET /api/public/complexes/:id/actividades)
 *   - el chatbot ("escuelas", "profesores", "torneos de tenis", "mis horarios")
 *   - el panel del profesor (sus escuelas y torneos en todos sus complejos)
 *
 * Todo se filtra por complex_id / id_tenant: nunca se mezclan datos de tenants.
 */
const { Op } = require('sequelize');
const {
  Complex, Field, Profesor, Escuela, EscuelaCategoria, EscuelaAlumno, EscuelaHorario, EscuelaProfesor,
  EscuelaProfesorCategoria, Torneo, TorneoPareja, TorneoJugador, TorneoProfesor,
} = require('../models');
const { ensenaDeporte, edad, DIAS } = require('./escuela/escuelaService');

const DEPORTE_LABEL = { futbol: 'Fútbol', padel: 'Pádel', tenis: 'Tenis', basquet: 'Básquet', voley: 'Vóley', squash: 'Squash', otro: 'Otro' };
// Estados de torneo que se muestran al público (borrador/cancelado no)
const TORNEO_VISIBLE = ['inscripcion', 'zonas', 'llaves', 'finalizado'];
const TORNEO_ACTIVO = ['inscripcion', 'zonas', 'llaves'];

const nombreCancha = (f) => (f ? `${f.nombre}${f.identificador ? ` (${f.identificador})` : ''}` : null);
const horarioJSON = (h) => ({ dia_semana: h.dia_semana, dia: DIAS[h.dia_semana], hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, cancha: nombreCancha(h.field) });
const ordenHorario = (a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio);

/** Normaliza un texto libre a la clave de deporte ('tenis', 'Fútbol 5' → 'futbol'), o null. */
function deporteDeTexto(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/futbol|fulbo|futsal|\bf5\b|\bf7\b/.test(t)) return 'futbol';
  if (/padel/.test(t)) return 'padel';
  if (/tenis/.test(t)) return 'tenis';
  if (/basquet|basket|basquetbol/.test(t)) return 'basquet';
  if (/voley|voleibol|volley/.test(t)) return 'voley';
  if (/squash/.test(t)) return 'squash';
  return null;
}

/** Escuelas ACTIVAS del complejo con categorías (cupos), horarios y entrenadores. */
async function escuelasPublicas(complexId, deporte = null) {
  const escuelas = await Escuela.findAll({
    where: { complex_id: complexId, estado: 'activa', ...(deporte ? { deporte } : {}) },
    include: [
      { model: Profesor, as: 'profesores', attributes: ['id', 'nombre', 'apellido'], through: { attributes: [] }, where: { activo: true }, required: false },
      { model: EscuelaCategoria, as: 'categorias', where: { activa: true }, required: false,
        include: [
          { model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador'] }] },
          { model: Profesor, as: 'profesores', attributes: ['id', 'nombre', 'apellido'], through: { attributes: [] } },
        ] },
    ],
    order: [['nombre', 'ASC']],
  });
  const catIds = escuelas.flatMap(e => e.categorias.map(c => c.id));
  const ocupados = catIds.length
    ? await EscuelaAlumno.count({ where: { categoria_id: catIds, estado: 'activo' }, group: ['categoria_id'] })
    : [];
  return escuelas.map(e => {
    const entrenadores = new Map();
    for (const p of e.profesores) entrenadores.set(p.id, `${p.nombre} ${p.apellido}`);
    for (const c of e.categorias) for (const p of c.profesores) entrenadores.set(p.id, `${p.nombre} ${p.apellido}`);
    return {
      id: e.id, nombre: e.nombre, deporte: e.deporte, deporte_label: DEPORTE_LABEL[e.deporte], descripcion: e.descripcion,
      entrenadores: [...entrenadores.values()],
      categorias: e.categorias
        .sort((a, b) => a.edad_min - b.edad_min)
        .map(c => {
          const n = Number(ocupados.find(o => o.categoria_id === c.id)?.count || 0);
          return {
            id: c.id, nombre: c.nombre, edad_min: c.edad_min, edad_max: c.edad_max,
            cuota_mensual: Number(c.cuota_mensual) || 0, cupos: c.cupos, cupos_libres: Math.max(0, c.cupos - n),
            entrenadores: c.profesores.map(p => `${p.nombre} ${p.apellido}`),
            horarios: c.horarios.map(horarioJSON).sort(ordenHorario),
          };
        }),
    };
  });
}

/** Profesores ACTIVOS del complejo (sin DNI ni datos privados). */
async function profesoresPublicos(complexId, deporte = null) {
  const profes = await Profesor.findAll({
    where: { id_tenant: complexId, activo: true },
    attributes: ['id', 'nombre', 'apellido', 'deportes'],
    include: [{ model: Escuela, as: 'escuelas', attributes: ['id', 'nombre', 'deporte'], through: { attributes: [] }, where: { estado: 'activa' }, required: false }],
    order: [['apellido', 'ASC'], ['nombre', 'ASC']],
  });
  return profes
    .filter(p => !deporte || ensenaDeporte(p, deporte))
    .map(p => ({ id: p.id, nombre: `${p.nombre} ${p.apellido}`, deportes: p.deportes || [], escuelas: p.escuelas.map(e => e.nombre) }));
}

/** Torneos visibles del complejo, con cupos e inscriptos. */
async function torneosPublicos(complexId, deporte = null, { soloActivos = false } = {}) {
  const torneos = await Torneo.findAll({
    where: { id_tenant: complexId, estado: soloActivos ? TORNEO_ACTIVO : TORNEO_VISIBLE, ...(deporte ? { deporte } : {}) },
    include: [{ model: Profesor, as: 'profesores', attributes: ['nombre', 'apellido'], through: { attributes: ['rol'] } }],
    order: [['fecha_inicio', 'ASC']],
  });
  const conteos = torneos.length ? await TorneoPareja.count({ where: { torneo_id: torneos.map(t => t.id), estado_pago: ['pendiente', 'pagado'] }, group: ['torneo_id'] }) : [];
  return torneos.map(t => {
    const inscriptas = Number(conteos.find(c => c.torneo_id === t.id)?.count || 0);
    return {
      id: t.id, nombre: t.nombre, deporte: t.deporte, deporte_label: DEPORTE_LABEL[t.deporte], estado: t.estado,
      categoria: t.categoria, genero: t.genero, fecha_inicio: t.fecha_inicio, fecha_fin: t.fecha_fin,
      precio_inscripcion: Number(t.precio_inscripcion) || 0, cupo_parejas: t.cupo_parejas, inscriptas,
      cupos_libres: Math.max(0, t.cupo_parejas - inscriptas), inscripcion_abierta: t.estado === 'inscripcion' && inscriptas < t.cupo_parejas,
      imagen_evento: t.imagen_evento,
      staff: t.profesores.map(p => `${p.nombre} ${p.apellido}${p.TorneoProfesor?.rol ? ` (${p.TorneoProfesor.rol})` : ''}`),
    };
  });
}

/** Catálogo completo del complejo (opcionalmente de un deporte). */
async function catalogoComplejo(complexId, deporte = null) {
  const [escuelas, profesores, torneos, canchas] = await Promise.all([
    escuelasPublicas(complexId, deporte),
    profesoresPublicos(complexId, deporte),
    torneosPublicos(complexId, deporte),
    Field.findAll({ where: { complex_id: complexId, activa: true }, attributes: ['deporte'], raw: true }),
  ]);
  const deportes = [...new Set([...canchas.map(c => c.deporte), ...escuelas.map(e => e.deporte), ...torneos.map(t => t.deporte)])];
  return { deporte, deportes: deportes.map(d => ({ value: d, label: DEPORTE_LABEL[d] || d })), escuelas, profesores, torneos };
}

/**
 * Escuelas (categorías + horarios) y torneos asignados a un profesor, en todos
 * los complejos donde trabaja. Recibe sus registros de `profesores` (uno por complejo).
 */
async function actividadesProfesor(profesores) {
  const ids = profesores.map(p => p.id);
  if (!ids.length) return [];
  const [clubs, directas, porCategoria, torneos] = await Promise.all([
    Complex.findAll({ where: { id: profesores.map(p => p.id_tenant) }, attributes: ['id', 'nombre', 'ciudad'] }),
    EscuelaProfesor.findAll({ where: { profesor_id: ids }, raw: true }),
    EscuelaProfesorCategoria.findAll({ where: { profesor_id: ids }, raw: true }),
    TorneoProfesor.findAll({ where: { profesor_id: ids }, include: [{ model: Torneo, as: 'torneo' }] }),
  ]);
  const catIds = porCategoria.map(x => x.categoria_id);
  const categorias = catIds.length ? await EscuelaCategoria.findAll({
    where: { id: catIds },
    include: [{ model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador'] }] }],
  }) : [];
  const escuelaIds = [...new Set([...directas.map(d => d.escuela_id), ...categorias.map(c => c.escuela_id).filter(Boolean)])];
  const escuelas = escuelaIds.length ? await Escuela.findAll({ where: { id: escuelaIds } }) : [];

  return profesores.map(p => {
    const misCats = categorias.filter(c => porCategoria.some(x => x.profesor_id === p.id && x.categoria_id === c.id));
    const misEscuelaIds = new Set([...directas.filter(d => d.profesor_id === p.id).map(d => d.escuela_id), ...misCats.map(c => c.escuela_id)]);
    return {
      profesor_id: p.id,
      club: clubs.find(c => c.id === p.id_tenant)?.toJSON() || { id: p.id_tenant },
      escuelas: escuelas
        .filter(e => misEscuelaIds.has(e.id) && e.complex_id === p.id_tenant)
        .map(e => ({
          id: e.id, nombre: e.nombre, deporte: e.deporte, deporte_label: DEPORTE_LABEL[e.deporte],
          categorias: misCats.filter(c => c.escuela_id === e.id).map(c => ({ id: c.id, nombre: c.nombre, horarios: c.horarios.map(horarioJSON).sort(ordenHorario) })),
        })),
      torneos: torneos
        .filter(tp => tp.profesor_id === p.id && tp.torneo && tp.torneo.id_tenant === p.id_tenant && tp.torneo.estado !== 'cancelado')
        .map(tp => ({ id: tp.torneo.id, nombre: tp.torneo.nombre, deporte: tp.torneo.deporte, estado: tp.torneo.estado, fecha_inicio: tp.torneo.fecha_inicio, fecha_fin: tp.torneo.fecha_fin, rol: tp.rol })),
    };
  });
}

/** Últimos 10 dígitos: compara teléfonos con o sin 549 / 0 / 15. */
const ult10 = (t) => String(t || '').replace(/\D/g, '').slice(-10);

/**
 * Lo que una persona tiene en ESTE complejo según su WhatsApp (chatbot "mis horarios"):
 * hijos/alumnos de escuelas (responsable), actividades como profesor e inscripciones a torneos.
 */
async function actividadesPorTelefono(complexId, telefono) {
  const tel = ult10(telefono);
  if (tel.length < 10) return { alumnos: [], profesor: null, torneos: [] };
  const like = { [Op.like]: `%${tel}` };
  const [alumnos, profes, jugadores] = await Promise.all([
    EscuelaAlumno.findAll({
      where: { complex_id: complexId, responsable_whatsapp: like, estado: ['activo', 'pendiente'] },
      include: [{ model: EscuelaCategoria, as: 'categoria',
        include: [
          { model: Escuela, as: 'escuela', attributes: ['nombre', 'deporte'] },
          { model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['nombre', 'identificador'] }] },
        ] }],
    }),
    Profesor.findAll({ where: { id_tenant: complexId, activo: true, whatsapp: like } }),
    TorneoJugador.findAll({
      where: { whatsapp: like },
      include: [{ model: TorneoPareja, as: 'pareja', where: { estado_pago: ['pendiente', 'pagado'] },
        include: [{ model: Torneo, as: 'torneo', where: { id_tenant: complexId, estado: TORNEO_ACTIVO } }] }],
    }),
  ]);
  return {
    alumnos: alumnos.map(a => ({
      nombre: a.nombre, edad: edad(a.fecha_nacimiento), estado: a.estado,
      escuela: a.categoria?.escuela?.nombre, deporte: a.categoria?.escuela?.deporte, categoria: a.categoria?.nombre,
      horarios: (a.categoria?.horarios || []).map(horarioJSON).sort(ordenHorario),
    })),
    profesor: profes.length ? (await actividadesProfesor(profes))[0] : null,
    torneos: jugadores.map(j => ({ nombre: j.pareja.torneo.nombre, deporte: j.pareja.torneo.deporte, estado: j.pareja.torneo.estado, fecha_inicio: j.pareja.torneo.fecha_inicio, fecha_fin: j.pareja.torneo.fecha_fin, pago: j.pareja.estado_pago })),
  };
}

module.exports = {
  DEPORTE_LABEL, TORNEO_VISIBLE, TORNEO_ACTIVO, deporteDeTexto, ult10,
  escuelasPublicas, profesoresPublicos, torneosPublicos, catalogoComplejo,
  actividadesProfesor, actividadesPorTelefono,
};
