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
 * DIFUSIÓN (suspension / normal): texto GENERAL, igual para todos, sin datos de un
 * alumno ni del responsable → se copia o comparte a un grupo o lista de difusión.
 * Las plantillas son configurables por escuela (escuelas.plantillas_mensajes).
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
  '{detalle}': 'Detalle o motivo (opcional)',
};

/** Tipos de difusión: un solo texto general para grupos / listas de difusión. */
const DIFUSION = ['suspension', 'normal'];
/** Variables admitidas en difusión (no identifican a nadie). */
const VARIABLES_DIFUSION = ['escuela', 'categoria', 'fecha', 'horario', 'detalle'];
/** Variables personales: prohibidas en difusión. */
const VARIABLES_PERSONALES = ['alumno', 'responsable', 'monto', 'vencimiento', 'comprobante', 'fecha_pago', 'metodo', 'periodo'];

const PLANTILLAS = {
  suspension: '⛔ *{escuela}* — {categoria}\n\nInformamos que la actividad prevista para {fecha} ha sido suspendida. Ante cualquier novedad se comunicará oportunamente.\n\n{detalle}',
  normal: '✅ *{escuela}* — {categoria}\n\nInformamos que la actividad programada para {fecha} se realizará normalmente en el horario establecido.\n{horario}\n\n{detalle}',
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

/** Reemplaza las {variables}; las desconocidas quedan como están. Limpia líneas vacías sobrantes. */
function render(contenido, vars) {
  return String(contenido)
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Plantilla vigente de un tipo: la propia de la escuela o la del sistema. */
function plantillaDe(escuela, tipo) {
  const propia = escuela?.plantillas_mensajes?.[tipo];
  return typeof propia === 'string' && propia.trim() ? propia : PLANTILLAS[tipo];
}

/** Valida que un texto de difusión no tenga variables personales. */
function validarDifusion(tipo, contenido) {
  if (!DIFUSION.includes(tipo)) return;
  const usadas = [...String(contenido).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  const prohibidas = [...new Set(usadas.filter(v => VARIABLES_PERSONALES.includes(v)))];
  if (prohibidas.length) {
    throw esc.httpError(400, `Los mensajes de difusión no pueden incluir datos personales: quitá ${prohibidas.map(v => `{${v}}`).join(', ')}.`);
  }
}

/**
 * Guarda (o restablece con null/'') la plantilla de un tipo para la escuela.
 * @returns {object} plantillas_mensajes resultante
 */
async function guardarPlantilla(escuela, tipo, contenido) {
  if (!TIPOS.includes(tipo)) throw esc.httpError(400, 'Tipo de mensaje inválido.');
  const actuales = { ...(escuela.plantillas_mensajes || {}) };
  const txt = String(contenido ?? '').trim();
  if (!txt) delete actuales[tipo];
  else {
    if (txt.length > 2000) throw esc.httpError(400, 'La plantilla no puede superar los 2000 caracteres.');
    validarDifusion(tipo, txt);
    actuales[tipo] = txt;
  }
  await escuela.update({ plantillas_mensajes: Object.keys(actuales).length ? actuales : null });
  console.log(`[escuela] plantilla ${tipo} ${txt ? 'actualizada' : 'restablecida'} · escuela ${escuela.id}`);
  return actuales;
}

/** Horario general de las categorías (para el texto de difusión). */
function horarioGeneral(categorias, fecha) {
  const dia = fecha ? new Date(`${fecha}T12:00:00`).getDay() : null;
  const lineas = [];
  for (const c of categorias) {
    const hs = (c.horarios || []).filter(h => dia == null || h.dia_semana === dia)
      .sort((x, y) => x.hora_inicio.localeCompare(y.hora_inicio))
      .map(h => `${h.hora_inicio} a ${h.hora_fin}${h.field ? ` (${h.field.nombre})` : ''}`);
    if (hs.length) lineas.push(categorias.length > 1 ? `${c.nombre}: ${hs.join(', ')}` : `Horario: ${hs.join(', ')}`);
  }
  return lineas.join('\n');
}

/**
 * Texto de difusión (igual para todos) de un mensaje o aviso de actividad.
 * @param {{tipo, contenido?, fecha?, detalle?}} m
 * @param {object} escuela
 * @param {Array}  categorias  categorías alcanzadas (con horarios); [] = toda la escuela sin horario
 * @param {boolean} todaLaEscuela
 */
function textoDifusion(m, escuela, categorias, todaLaEscuela) {
  return render(m.contenido || plantillaDe(escuela, m.tipo), {
    escuela: escuela.nombre,
    categoria: todaLaEscuela ? 'Todas las categorías' : categorias.map(c => c.nombre).join(', '),
    fecha: m.fecha === esc.hoy() ? `hoy (${fechaLarga(m.fecha)})` : fechaLarga(m.fecha),
    horario: horarioGeneral(categorias, m.fecha),
    detalle: m.detalle ? String(m.detalle).trim() : '',
  });
}

/**
 * Valida/normaliza los datos de un mensaje.
 * @param {object} b         body
 * @param {object} actual    mensaje existente (edición) o {}
 * @param {number[]} catIds  categorías de la escuela
 */
function validar(b, actual = {}, catIds = [], escuela = null) {
  const v = { ...actual, ...b };
  const err = (m) => esc.httpError(400, m);
  const d = {};
  d.tipo = v.tipo;
  if (!TIPOS.includes(d.tipo)) throw err('Tipo de mensaje inválido (suspension, normal, recordatorio_pago o recibo).');
  d.contenido = String(v.contenido ?? plantillaDe(escuela, d.tipo)).trim();
  if (d.contenido.length < 2) throw err('El mensaje no puede estar vacío.');
  if (d.contenido.length > 2000) throw err('El mensaje no puede superar los 2000 caracteres.');
  validarDifusion(d.tipo, d.contenido);
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
  const difusion = DIFUSION.includes(mensaje.tipo);
  let textoGrupo = null;
  if (difusion) {
    const cats = await EscuelaCategoria.findAll({
      where: { id: ids }, order: [['nombre', 'ASC']],
      include: [{ model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['nombre'] }] }],
    });
    textoGrupo = textoDifusion(mensaje, escuela, cats, !mensaje.categoria_id);
  }
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
    const item = { alumno_id: a.id, alumno: a.nombre, categoria: a.categoria.nombre, responsable: a.responsable_nombre, numero, texto: difusion ? textoGrupo : render(mensaje.contenido, vars) };
    if (numero) out.push(item); else sinWa.push(item);
  }
  return { difusion, texto_difusion: textoGrupo, destinatarios: out, sin_whatsapp: sinWa };
}

/**
 * Agrega `texto_difusion` a cada aviso de actividad (EscuelaAviso), con la plantilla
 * configurada de la escuela. Una sola fuente para el panel y el entrenador.
 * @param {Array} avisos   EscuelaAviso (instancias o JSON)
 * @param {object} escuela
 */
async function conTextoDifusion(avisos, escuela) {
  const lista = avisos.map(a => (a.toJSON ? a.toJSON() : a));
  const catIds = [...new Set(lista.map(a => a.categoria_id).filter(Boolean))];
  const cats = catIds.length ? await EscuelaCategoria.findAll({
    where: { id: catIds },
    include: [{ model: EscuelaHorario, as: 'horarios', include: [{ model: Field, as: 'field', attributes: ['nombre'] }] }],
  }) : [];
  return lista.map(a => {
    const tipo = a.estado === 'suspendida' ? 'suspension' : 'normal';
    const cat = cats.filter(c => c.id === a.categoria_id);
    return { ...a, texto_difusion: textoDifusion({ tipo, fecha: a.fecha, detalle: a.mensaje }, escuela, cat, !a.categoria_id) };
  });
}

module.exports = {
  conTextoDifusion,
  TIPOS, TIPO_LABEL, VARIABLES, PLANTILLAS, DIFUSION, VARIABLES_DIFUSION, VARIABLES_PERSONALES,
  render, validar, destinatarios, periodoLabel, plantillaDe, guardarPlantilla, textoDifusion,
};
