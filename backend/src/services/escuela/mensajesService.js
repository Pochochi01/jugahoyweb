'use strict';
/**
 * services/escuela/mensajesService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mensajes de la escuela a los padres: plantillas por tipo, destinatarios según
 * el tipo y personalización por alumno.
 *
 *   suspension         alumnos activos (de la escuela o de una categoría)
 *   normal             alumnos activos
 *   recordatorio_pago  alumnos activos con la cuota del período pendiente o sin registrar
 *   recibo             alumnos con la cuota del período PAGADA (usa su comprobante)
 *
 * Destinatario = responsable del alumno (escuela_alumnos.responsable_whatsapp).
 * La lista sale SIEMPRE de los alumnos de la escuela y del tenant: no se puede
 * enviar a un teléfono que no esté relacionado a un alumno.
 */
const { EscuelaAlumno, EscuelaCategoria, EscuelaHorario, EscuelaPago, Field } = require('../../models');
const esc = require('./escuelaService');
const { normalizarWa } = require('../whatsappEntidad/entidades');

const TIPOS = ['suspension', 'normal', 'recordatorio_pago', 'recibo'];
const TIPO_LABEL = { suspension: 'Suspensión de clase', normal: 'Clases normales', recordatorio_pago: 'Recordatorio de cuota', recibo: 'Recibo de pago' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Variables disponibles en el contenido (se reemplazan por alumno). */
const VARIABLES = {
  '{alumno}': 'Nombre del alumno', '{categoria}': 'Categoría', '{responsable}': 'Nombre del padre/madre',
  '{escuela}': 'Nombre de la escuela', '{fecha}': 'Día de la clase', '{horario}': 'Horario de entrenamiento',
  '{periodo}': 'Mes de la cuota', '{monto}': 'Monto de la cuota', '{vencimiento}': 'Vencimiento de la cuota',
  '{comprobante}': 'N° de recibo', '{fecha_pago}': 'Fecha de pago', '{metodo}': 'Medio de pago',
};

const PLANTILLAS = {
  suspension: 'Hola {responsable} 👋\n\nTe avisamos que el entrenamiento de *{alumno}* ({categoria}) del *{fecha}* está *SUSPENDIDO* ⛔.\n\nTe avisamos por acá cuando se retome. ¡Gracias!',
  normal: 'Hola {responsable} 👋\n\nHoy *{fecha}* las clases de *{categoria}* son *normales* ✅.\nTe esperamos con {alumno}: {horario}.',
  recordatorio_pago: 'Hola {responsable} 👋\n\nTe recordamos que la cuota de *{periodo}* de *{alumno}* ({categoria}) es de *{monto}* y vence el *{vencimiento}*.\n\nSi ya la pagaste, desestimá este mensaje. ¡Gracias!',
  recibo: '🧾 *Recibo {comprobante}*\n\nAlumno: {alumno} — {categoria}\nPeríodo: {periodo}\nMonto: {monto}\nFecha de pago: {fecha_pago}\nMedio de pago: {metodo}\n\n¡Gracias, {responsable}!',
};

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const ddmm = (f) => (f ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}` : '');
const fechaLarga = (f) => {
  if (!f) return '';
  const d = new Date(`${f}T12:00:00`);
  return `${esc.DIAS[d.getDay()]} ${ddmm(f)}`;
};
const periodoLabel = (p) => (p ? `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : '');
const METODO = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta' };

/** Reemplaza las {variables}; las desconocidas quedan como están. */
function render(contenido, vars) {
  return String(contenido).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/**
 * Valida/normaliza los datos de un mensaje.
 * @param {object} b         body
 * @param {object} actual    mensaje existente (edición) o {}
 * @param {number[]} catIds  categorías de la escuela
 */
function validar(b, actual = {}, catIds = []) {
  const v = { ...actual, ...b };
  const err = (m) => esc.httpError(400, m);
  const d = {};
  d.tipo = v.tipo;
  if (!TIPOS.includes(d.tipo)) throw err('Tipo de mensaje inválido (suspension, normal, recordatorio_pago o recibo).');
  d.contenido = String(v.contenido ?? PLANTILLAS[d.tipo]).trim();
  if (d.contenido.length < 2) throw err('El mensaje no puede estar vacío.');
  if (d.contenido.length > 2000) throw err('El mensaje no puede superar los 2000 caracteres.');
  d.categoria_id = v.categoria_id ? Number(v.categoria_id) : null;
  if (d.categoria_id && !catIds.includes(d.categoria_id)) throw err('La categoría no pertenece a esta escuela.');
  if (['recordatorio_pago', 'recibo'].includes(d.tipo)) {
    d.periodo = esc.validarPeriodo(v.periodo || esc.periodoActual());
    d.fecha = null;
  } else {
    d.fecha = v.fecha || esc.hoy();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw err('Fecha inválida.');
    d.periodo = null;
  }
  return d;
}

/**
 * Alumnos destinatarios del mensaje, con su texto ya personalizado.
 * @returns {Promise<{destinatarios: Array, sin_whatsapp: Array}>}
 */
async function destinatarios(mensaje, escuela, catIds) {
  const ids = mensaje.categoria_id ? [mensaje.categoria_id].filter(id => catIds.includes(id)) : catIds;
  if (!ids.length) return { destinatarios: [], sin_whatsapp: [] };
  const periodo = mensaje.periodo || esc.periodoActual();
  const alumnos = await EscuelaAlumno.findAll({
    where: { complex_id: escuela.complex_id, categoria_id: ids, estado: 'activo' },
    include: [
      { model: EscuelaCategoria, as: 'categoria', include: [{ model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['nombre'] }] }] },
      { model: EscuelaPago, as: 'pagos', where: { periodo }, required: false },
    ],
    order: [['nombre', 'ASC']],
  });
  const diaClase = mensaje.fecha ? new Date(`${mensaje.fecha}T12:00:00`).getDay() : null;
  const vence = `${periodo}-${String(escuela.dia_vencimiento || 10).padStart(2, '0')}`;
  const out = [], sinWa = [];
  for (const a of alumnos) {
    const { estado, pago } = esc.estadoPago(a.pagos, periodo);
    if (mensaje.tipo === 'recordatorio_pago' && (estado === 'pagado' || !(Number(pago?.monto ?? a.categoria.cuota_mensual) > 0))) continue;
    if (mensaje.tipo === 'recibo' && estado !== 'pagado') continue;
    const horarios = (a.categoria.horarios || []).filter(h => diaClase == null || h.dia_semana === diaClase);
    const horarioTxt = (horarios.length ? horarios : a.categoria.horarios || [])
      .sort((x, y) => x.dia_semana - y.dia_semana || x.hora_inicio.localeCompare(y.hora_inicio))
      .map(h => `${horarios.length ? '' : `${esc.DIAS[h.dia_semana]} `}${h.hora_inicio} a ${h.hora_fin}${h.field ? ` (${h.field.nombre})` : ''}`).join(', ') || 'a confirmar';
    const vars = {
      alumno: a.nombre, categoria: a.categoria.nombre, responsable: a.responsable_nombre.split(' ')[0], escuela: escuela.nombre,
      fecha: fechaLarga(mensaje.fecha), horario: horarioTxt, periodo: periodoLabel(periodo),
      monto: money(pago?.monto ?? a.categoria.cuota_mensual), vencimiento: ddmm(vence),
      comprobante: pago?.comprobante || '', fecha_pago: pago?.fecha_pago ? ddmm(pago.fecha_pago) : '', metodo: METODO[pago?.metodo_pago] || pago?.metodo_pago || '',
    };
    const numero = normalizarWa(a.responsable_whatsapp);
    const item = { alumno_id: a.id, alumno: a.nombre, categoria: a.categoria.nombre, responsable: a.responsable_nombre, numero, texto: render(mensaje.contenido, vars) };
    if (numero) out.push(item); else sinWa.push(item);
  }
  return { destinatarios: out, sin_whatsapp: sinWa };
}

module.exports = { TIPOS, TIPO_LABEL, VARIABLES, PLANTILLAS, render, validar, destinatarios, periodoLabel };
