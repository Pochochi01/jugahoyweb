/**
 * Inteligencia de Agenda — analítica operativa de turnos (tabla `bookings`).
 *
 * Todo se agrega en MySQL (GROUP BY) y el resultado es chico (≤ 7×24×6 filas para la
 * grilla), así que el armado de rankings/KPIs en Node es O(1) respecto del volumen de
 * turnos. Sin N+1: 5 consultas agregadas en paralelo por pedido.
 *
 * Definiciones (coherentes con statsController.getAttendanceStats):
 *  - Demanda       = turnos no cancelados (pendiente_pago, pendiente, confirmado, no_asistido)
 *  - Asistidos     = confirmado · Ausentes = no_asistido · Cancelados = cancelado + rechazado
 *  - % asistencia  = asistidos / (asistidos + ausentes)
 *  - % cancelación = cancelados / total
 *  - Ocupación     = horas reservadas (demanda) / horas disponibles de las canchas filtradas
 *                    (según hora_apertura/hora_cierre de cada cancha y los días del rango)
 *  - Facturación   = SUM(monto) de turnos cobrados (cobrado = 1)
 *  - La hora de un turno es la de inicio (hora_inicio); un turno de 90' suma 1,5 h de ocupación.
 */
const { sequelize, Field } = require('../models');
const { QueryTypes, Op } = require('sequelize');

const ESTADOS = ['pendiente_pago', 'pendiente', 'confirmado', 'cancelado', 'rechazado', 'no_asistido'];
const CANCELADOS = ['cancelado', 'rechazado'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];   // índice = DAYOFWEEK-1
const FRANJAS = [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20], [20, 22], [22, 24]];
const GRANULARIDADES = { diaria: '%Y-%m-%d', semanal: '%x-S%v', mensual: '%Y-%m' };
const MAX_DIAS = 731;   // tope del rango (2 años) para acotar el cálculo de capacidad

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function errorValidacion(msg) { const e = new Error(msg); e.status = 400; return e; }
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);   // 1 decimal
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Valida y normaliza los filtros globales (query string). */
function parseFiltros(q = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = q.desde || `${hoy.slice(0, 7)}-01`;
  const hasta = q.hasta || hoy;
  if (!ISO.test(desde) || !ISO.test(hasta)) throw errorValidacion('Fechas inválidas (formato AAAA-MM-DD).');
  if (desde > hasta) throw errorValidacion('"Fecha desde" no puede ser posterior a "Fecha hasta".');
  if (diasEntre(desde, hasta) > MAX_DIAS) throw errorValidacion('El rango máximo es de 2 años.');

  const horaDesde = q.hora_desde || null;
  const horaHasta = q.hora_hasta || null;
  if ((horaDesde && !HHMM.test(horaDesde)) || (horaHasta && !HHMM.test(horaHasta))) throw errorValidacion('Rango horario inválido (HH:MM).');

  const lista = (v) => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
  const estados = lista(q.estado);
  if (estados.some(e => !ESTADOS.includes(e))) throw errorValidacion(`Estado inválido. Valores: ${ESTADOS.join(', ')}.`);
  const fieldIds = lista(q.field_id).map(Number);
  if (fieldIds.some(n => !Number.isInteger(n) || n <= 0)) throw errorValidacion('Cancha inválida.');
  const deportes = lista(q.deporte);

  const granularidad = q.granularidad || 'diaria';
  if (!GRANULARIDADES[granularidad]) throw errorValidacion('Granularidad inválida (diaria, semanal, mensual).');

  return { desde, hasta, horaDesde, horaHasta, estados, fieldIds, deportes, granularidad, comparar: q.comparar !== '0' };
}

/** Canchas del complejo que entran en los filtros de cancha/deporte (con su horario, para la capacidad). */
async function canchasFiltradas(complexId, f) {
  const where = { complex_id: complexId };
  if (f.fieldIds.length) where.id = { [Op.in]: f.fieldIds };
  if (f.deportes.length) where.deporte = { [Op.in]: f.deportes };
  return Field.findAll({ where, attributes: ['id', 'nombre', 'identificador', 'deporte', 'activa', 'hora_apertura', 'hora_cierre'], raw: true });
}

/** WHERE común a todas las consultas (parametrizado). `campoFecha` permite filtrar por created_at. */
function whereSql(f, fieldIds, { desde, hasta, campoFecha = 'b.fecha' } = {}) {
  const w = ['b.field_id IN (:fieldIds)', `${campoFecha} BETWEEN :desde AND :hasta`];
  const r = { fieldIds, desde: desde || f.desde, hasta: hasta || f.hasta };
  if (campoFecha !== 'b.fecha') { r.desde = `${r.desde} 00:00:00`; r.hasta = `${r.hasta} 23:59:59`; }
  if (f.horaDesde) { w.push('b.hora_inicio >= :horaDesde'); r.horaDesde = f.horaDesde; }
  if (f.horaHasta) { w.push('b.hora_inicio < :horaHasta'); r.horaHasta = f.horaHasta; }
  if (f.estados.length) { w.push('b.estado IN (:estados)'); r.estados = f.estados; }
  return { sql: w.join(' AND '), r };
}

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const COBRADO = 'SUM(CASE WHEN b.cobrado = 1 THEN b.monto ELSE 0 END)';

/**
 * Horas disponibles por [día de semana][hora]: canchas abiertas a esa hora × cantidad de
 * ese día de semana en el rango. Respeta el rango horario filtrado. Cierre ≤ apertura = cruza medianoche.
 */
function capacidad(canchas, f) {
  const cap = Array.from({ length: 7 }, () => Array(24).fill(0));
  const vecesDia = Array(7).fill(0);
  for (let i = 0, d = f.desde; d <= f.hasta; i++, d = sumarDias(f.desde, i)) vecesDia[new Date(`${d}T12:00:00Z`).getUTCDay()]++;
  const hMin = f.horaDesde ? Number(f.horaDesde.slice(0, 2)) : 0;
  const hMax = f.horaHasta ? Math.ceil(Number(f.horaHasta.slice(0, 2)) + Number(f.horaHasta.slice(3)) / 60) : 24;
  for (const c of canchas) {
    if (c.activa === false || c.activa === 0) continue;
    const ap = Number(String(c.hora_apertura || '08:00').slice(0, 2));
    let ci = Number(String(c.hora_cierre || '00:00').slice(0, 2));
    if (ci <= ap) ci += 24;
    for (let h = ap; h < ci; h++) {
      const hr = h % 24;
      if (hr < hMin || hr >= hMax) continue;
      for (let d = 0; d < 7; d++) cap[d][hr] += vecesDia[d];
    }
  }
  return { cap, vecesDia };
}

/** Acumulador por clave con las métricas base. */
function acumular(filas, clave) {
  const m = new Map();
  for (const x of filas) {
    const k = clave(x);
    const a = m.get(k) || { total: 0, demanda: 0, asistidos: 0, ausentes: 0, cancelados: 0, minutos: 0, facturado: 0 };
    const n = Number(x.n);
    a.total += n;
    if (CANCELADOS.includes(x.estado)) a.cancelados += n;
    else { a.demanda += n; a.minutos += Number(x.minutos || 0); }
    if (x.estado === 'confirmado') a.asistidos += n;
    if (x.estado === 'no_asistido') a.ausentes += n;
    a.facturado += Number(x.cobrado || 0);
    m.set(k, a);
  }
  return m;
}
const tasas = (a) => ({
  ...a,
  facturado: Math.round(a.facturado),
  pct_cancelacion: pct(a.cancelados, a.total),
  pct_asistencia: pct(a.asistidos, a.asistidos + a.ausentes),
  pct_ausentismo: pct(a.ausentes, a.asistidos + a.ausentes),
});
const VACIO = { total: 0, demanda: 0, asistidos: 0, ausentes: 0, cancelados: 0, minutos: 0, facturado: 0 };

/** Totales por estado de un rango (se usa también para el período anterior). */
async function totales(f, fieldIds, rango) {
  const w = whereSql(f, fieldIds, rango);
  const filas = await q(`SELECT b.estado, COUNT(*) n, SUM(b.duracion) minutos, ${COBRADO} cobrado
    FROM bookings b WHERE ${w.sql} GROUP BY b.estado`, w.r);
  return tasas(acumular(filas, () => 't').get('t') || { ...VACIO });
}

/** Opciones para los filtros (canchas y deportes del complejo). */
async function opcionesFiltros(complexId) {
  const canchas = await Field.findAll({ where: { complex_id: complexId }, attributes: ['id', 'nombre', 'identificador', 'deporte', 'activa'], order: [['id', 'ASC']], raw: true });
  return { canchas, deportes: [...new Set(canchas.map(c => c.deporte))], estados: ESTADOS, granularidades: Object.keys(GRANULARIDADES) };
}

/** Punto de entrada: todas las métricas de Inteligencia de Agenda con los filtros dados. */
async function analizar(complexId, query) {
  const f = parseFiltros(query);
  const canchas = await canchasFiltradas(complexId, f);
  const fieldIds = canchas.map(c => c.id);
  const dias = diasEntre(f.desde, f.hasta) + 1;
  const prevHasta = sumarDias(f.desde, -1);
  const prevDesde = sumarDias(prevHasta, -(dias - 1));
  if (!fieldIds.length) return { filtros: f, vacio: true };

  const w = whereSql(f, fieldIds);
  const wc = whereSql(f, fieldIds, { campoFecha: 'b.created_at' });
  const hora = 'CAST(SUBSTRING(b.hora_inicio, 1, 2) AS UNSIGNED)';
  const bucket = (col) => `DATE_FORMAT(${col}, '${GRANULARIDADES[f.granularidad]}')`;

  const t0 = Date.now();
  const [grilla, porCancha, serie, creados, anterior] = await Promise.all([
    // 1) Grilla día×hora×estado: alimenta heatmap, rankings, cancelaciones, ausentismo, franjas y rentabilidad
    q(`SELECT DAYOFWEEK(b.fecha) dia, ${hora} hora, b.estado, COUNT(*) n, SUM(b.duracion) minutos, ${COBRADO} cobrado
       FROM bookings b WHERE ${w.sql} GROUP BY dia, hora, b.estado`, w.r),
    // 2) Por cancha (desglose por recurso)
    q(`SELECT b.field_id, b.estado, COUNT(*) n, SUM(b.duracion) minutos, ${COBRADO} cobrado
       FROM bookings b WHERE ${w.sql} GROUP BY b.field_id, b.estado`, w.r),
    // 3) Evolución temporal por fecha del turno
    q(`SELECT ${bucket('b.fecha')} periodo, b.estado, COUNT(*) n FROM bookings b WHERE ${w.sql} GROUP BY periodo, b.estado`, w.r),
    // 4) Turnos creados (fecha de alta del registro)
    q(`SELECT ${bucket('b.created_at')} periodo, COUNT(*) n FROM bookings b WHERE ${wc.sql} GROUP BY periodo`, wc.r),
    // 5) Totales del período anterior de igual duración (comparación)
    f.comparar ? totales(f, fieldIds, { desde: prevDesde, hasta: prevHasta }) : null,
  ]);
  const ms = Date.now() - t0;
  if (ms > 1500) console.warn(`[agenda-analitica] complejo ${complexId}: consultas lentas (${ms} ms, ${dias} días)`);

  const { cap, vecesDia } = capacidad(canchas, f);
  const tot = tasas(acumular(grilla, () => 't').get('t') || { ...VACIO });
  const horasDisp = cap.flat().reduce((s, n) => s + n, 0);

  // ── Heatmap y celdas día×hora ──
  const celdasMap = acumular(grilla, x => `${Number(x.dia) - 1}|${Number(x.hora)}`);
  const celdas = [...celdasMap].map(([k, a]) => {
    const [dia, h] = k.split('|').map(Number);
    return { dia, dia_nombre: DIAS[dia], hora: hh(h), h, ...tasas(a), capacidad: cap[dia][h], pct_ocupacion: pct(a.minutos / 60, cap[dia][h]) };
  });
  const horasConDatos = [...new Set(celdas.map(c => c.h))];
  const horasAbiertas = [...new Set(cap.flatMap(fila => fila.map((n, h) => (n > 0 ? h : null))).filter(h => h !== null))];
  const ejeHoras = [...new Set([...horasAbiertas, ...horasConDatos])].sort((a, b) => ((a + 18) % 24) - ((b + 18) % 24));   // de 06:00 a 05:00

  // ── Por hora y por día ──
  const porHora = [...acumular(grilla, x => Number(x.hora))].map(([h, a]) => ({ hora: hh(h), h, ...tasas(a), pct_ocupacion: pct(a.minutos / 60, cap.reduce((s, fila) => s + fila[h], 0)) }));
  const diasMap = acumular(grilla, x => Number(x.dia) - 1);
  const porDia = [0, 1, 2, 3, 4, 5, 6].map(d => [d, diasMap.get(d) || { ...VACIO }]).map(([d, a]) => ({ dia: d, dia_nombre: DIAS[d], ...tasas(a), pct_demanda: pct(a.demanda, tot.demanda), pct_cancelaciones: pct(a.cancelados, tot.cancelados), pct_ocupacion: pct(a.minutos / 60, cap[d].reduce((s, n) => s + n, 0)) }));
  const ordenDia = (x) => (x.dia + 6) % 7;   // lunes primero

  // ── Franjas de 2 h ──
  const franjas = FRANJAS.map(([a, b]) => {
    const sel = porHora.filter(x => x.h >= a && x.h < b);
    const demanda = sel.reduce((s, x) => s + x.demanda, 0);
    const minutos = sel.reduce((s, x) => s + x.minutos, 0);
    const capF = cap.reduce((s, fila) => s + fila.slice(a, b).reduce((p, n) => p + n, 0), 0);
    return { franja: `${hh(a)}-${hh(b % 24)}`, demanda, pct_demanda: pct(demanda, tot.demanda), facturado: Math.round(sel.reduce((s, x) => s + x.facturado, 0)), pct_ocupacion: pct(minutos / 60, capF) };
  }).filter(x => x.demanda > 0 || x.pct_ocupacion > 0 || FRANJAS.slice(0, 6).some(([a]) => x.franja.startsWith(hh(a))));

  // ── Por cancha ──
  const nombreCancha = Object.fromEntries(canchas.map(c => [c.id, c.identificador ? `${c.identificador} · ${c.nombre}` : c.nombre]));
  const porCanchaRes = [...acumular(porCancha, x => x.field_id)].map(([id, a]) => ({ field_id: id, nombre: nombreCancha[id] || `#${id}`, deporte: canchas.find(c => c.id === id)?.deporte, ...tasas(a) }))
    .sort((a, b) => b.total - a.total);
  // Por deporte (= especialidad), derivado del desglose por cancha
  const porDeporte = [...porCanchaRes.reduce((m, c) => {
    const a = m.get(c.deporte) || { ...VACIO };
    for (const k of Object.keys(VACIO)) a[k] += c[k];
    return m.set(c.deporte, a);
  }, new Map())].map(([deporte, a]) => ({ deporte, ...tasas(a) }));

  // ── Franjas críticas (alertas): celdas con capacidad, baja ocupación y/o alta cancelación ──
  const MIN_MUESTRA = 3;
  const criticas = celdas
    .filter(c => c.capacidad > 0 && c.total >= MIN_MUESTRA && (c.pct_ocupacion < 30 || c.pct_cancelacion >= 20))
    .map(c => ({ ...c, motivo: [c.pct_ocupacion < 30 && 'baja ocupación', c.pct_cancelacion >= 20 && 'alta cancelación'].filter(Boolean),
      mensaje: `${c.dia_nombre} ${c.hora} presenta ${c.pct_ocupacion}% de ocupación y ${c.pct_cancelacion}% de cancelación.` }))
    .sort((a, b) => (b.pct_cancelacion - b.pct_ocupacion) - (a.pct_cancelacion - a.pct_ocupacion))
    .slice(0, 10);
  // Horas ociosas: abiertas en el horario de las canchas pero sin ningún turno en el período
  const ociosas = [];
  for (let d = 0; d < 7; d++) for (const h of horasAbiertas) if (cap[d][h] > 0 && !celdasMap.has(`${d}|${h}`)) ociosas.push(`${DIAS[d]} ${hh(h)}`);

  // ── Patrones detectados (texto) ──
  const patrones = [];
  const topCancDia = [...porDia].sort((a, b) => b.cancelados - a.cancelados)[0];
  if (topCancDia?.cancelados > 0) patrones.push(`${topCancDia.pct_cancelaciones}% de las cancelaciones se producen los ${topCancDia.dia_nombre.toLowerCase()}.`);
  const topCancHora = [...porHora].sort((a, b) => b.cancelados - a.cancelados)[0];
  if (topCancHora?.cancelados > 0) patrones.push(`El horario con más cancelaciones es ${topCancHora.hora} (${topCancHora.cancelados}, ${topCancHora.pct_cancelacion}% de sus turnos).`);
  const topAusDia = [...porDia].sort((a, b) => b.pct_ausentismo - a.pct_ausentismo)[0];
  if (topAusDia?.ausentes > 0) patrones.push(`Los ${topAusDia.dia_nombre.toLowerCase()} tienen el mayor ausentismo (${topAusDia.pct_ausentismo}%).`);

  // ── Evolución temporal ──
  const periodos = new Map();
  const fila = (p) => { if (!periodos.has(p)) periodos.set(p, { periodo: p, creados: 0, realizados: 0, cancelados: 0, ausentes: 0, total: 0 }); return periodos.get(p); };
  for (const x of serie) {
    const r = fila(x.periodo), n = Number(x.n);
    r.total += n;
    if (x.estado === 'confirmado') r.realizados += n;
    else if (CANCELADOS.includes(x.estado)) r.cancelados += n;
    else if (x.estado === 'no_asistido') r.ausentes += n;
  }
  for (const x of creados) fila(x.periodo).creados += Number(x.n);
  const evolucion = [...periodos.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));

  // ── KPIs ejecutivos ──
  const max = (arr, k) => arr.reduce((b, x) => (!b || x[k] > b[k] ? x : b), null);
  const horaTop = max(porHora, 'demanda');
  const diaTop = max(porDia, 'demanda');
  const horaCanc = max(porHora.filter(x => x.cancelados > 0), 'cancelados');
  const franjaRent = max(franjas.filter(x => x.facturado > 0), 'facturado');
  const semanas = dias / 7;
  const kpis = {
    horario_mas_solicitado: horaTop ? { hora: horaTop.hora, turnos: horaTop.demanda } : null,
    dia_mas_demanda: diaTop ? { dia: diaTop.dia_nombre, turnos: diaTop.demanda } : null,
    horario_mas_cancelaciones: horaCanc ? { hora: horaCanc.hora, cancelados: horaCanc.cancelados } : null,
    pct_asistencia: tot.pct_asistencia,
    promedio_diario: Math.round((tot.demanda / dias) * 10) / 10,
    promedio_semanal: Math.round((tot.demanda / semanas) * 10) / 10,
    ocupacion_global: pct(tot.minutos / 60, horasDisp),
    franja_mas_rentable: franjaRent ? { franja: franjaRent.franja, facturado: franjaRent.facturado } : null,
  };

  const top = (arr, k, n = 10) => [...arr].filter(x => x[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n);
  return {
    filtros: f,
    periodo: { desde: f.desde, hasta: f.hasta, dias, anterior: f.comparar ? { desde: prevDesde, hasta: prevHasta } : null },
    resumen: { ...tot, horas_disponibles: horasDisp, horas_reservadas: Math.round(tot.minutos / 6) / 10, pct_ocupacion: kpis.ocupacion_global, dias_semana_en_rango: vecesDia },
    anterior,
    kpis,
    heatmap: { dias: [1, 2, 3, 4, 5, 6, 0].map(d => ({ dia: d, nombre: DIAS[d] })), horas: ejeHoras.map(hh), celdas, max: Math.max(0, ...celdas.map(c => c.demanda)) },
    top_horarios: top(porHora, 'demanda'),
    top_dias: [...porDia].sort((a, b) => b.demanda - a.demanda),
    cancelaciones: {
      total: tot.cancelados, pct: tot.pct_cancelacion,
      por_dia: [...porDia].sort((a, b) => ordenDia(a) - ordenDia(b)),
      por_horario: top(porHora, 'cancelados', 24).sort((a, b) => ((a.h + 18) % 24) - ((b.h + 18) % 24)),
      por_cancha: porCanchaRes, por_deporte: porDeporte,
    },
    ausentismo: {
      asistidos: tot.asistidos, ausentes: tot.ausentes, pct_asistencia: tot.pct_asistencia, pct_ausentismo: tot.pct_ausentismo,
      por_dia: [...porDia].sort((a, b) => ordenDia(a) - ordenDia(b)),
      por_horario: porHora.filter(x => x.asistidos + x.ausentes > 0).sort((a, b) => ((a.h + 18) % 24) - ((b.h + 18) % 24)),
      por_cancha: porCanchaRes,
    },
    criticas, ociosas: ociosas.slice(0, 30), ociosas_total: ociosas.length, patrones,
    franjas,
    rentabilidad: {
      total: tot.facturado,
      por_hora: top(porHora, 'facturado'),
      por_dia: [...porDia].sort((a, b) => b.facturado - a.facturado),
      por_cancha: [...porCanchaRes].sort((a, b) => b.facturado - a.facturado),
    },
    evolucion,
    meta: { ms, consultas: f.comparar ? 5 : 4 },
  };
}

module.exports = { analizar, opcionesFiltros, parseFiltros, ESTADOS };
