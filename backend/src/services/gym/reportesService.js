'use strict';
/**
 * services/gym/reportesService.js — Dashboard ejecutivo, KPIs y reportes exportables.
 * Todo se calcula con consultas agregadas (GROUP BY) en MySQL: sin N+1 ni cálculos
 * de volumen en el frontend.
 *
 * Exportación: CSV con BOM (abre directo en Excel) y HTML imprimible (Guardar como PDF
 * desde el navegador), sin dependencias nuevas.
 */
const { sequelize } = require('../../models');
const cobranzas = require('./cobranzasService');
const { httpError, todayAR, sumarDias } = require('./comun');

const Q = (sql, r) => sequelize.query(sql, { replacements: r, type: sequelize.QueryTypes.SELECT });
const n = (v) => Number(v || 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function rango(q = {}) {
  const hoy = todayAR();
  const desde = q.desde || `${hoy.slice(0, 7)}-01`, hasta = q.hasta || hoy;
  if (!ISO.test(desde) || !ISO.test(hasta) || desde > hasta) throw httpError(400, 'Rango de fechas inválido.');
  return { desde, hasta, sucursal: q.sucursal_id ? Number(q.sucursal_id) : null };
}

/** Dashboard ejecutivo: KPIs + series para gráficos. */
async function dashboard(complexId, q) {
  const { desde, hasta, sucursal } = rango(q);
  const hoy = todayAR();
  const r = { c: complexId, desde, hasta, hoy, suc: sucursal, mes: `${hoy.slice(0, 7)}-01`, seis: sumarDias(`${hoy.slice(0, 7)}-01`, -150) };
  const fs = sucursal ? 'AND sucursal_id = :suc' : '';

  const [socios, fact, factHoy, factMes, asistHoy, clases, profes, costos, ocupClases, altasBajas, ingresos, asistencia, porHora, topActividades, pagosN] = await Promise.all([
    Q(`SELECT
         SUM(estado = 'activo') activos, SUM(estado = 'moroso') morosos, SUM(estado = 'congelado') congelados, SUM(estado = 'suspendido') suspendidos,
         SUM(fecha_alta BETWEEN :desde AND :hasta) nuevos, SUM(fecha_baja BETWEEN :desde AND :hasta) bajas,
         SUM(fecha_alta < :desde AND (fecha_baja IS NULL OR fecha_baja >= :desde)) al_inicio,
         SUM(fecha_alta < :desde AND (fecha_baja IS NULL OR fecha_baja > :hasta)) retenidos
       FROM gym_socios WHERE complex_id = :c ${fs}`, r),
    Q(`SELECT COALESCE(SUM(monto),0) t, COUNT(*) n FROM gym_pagos WHERE complex_id = :c AND anulado = 0 AND fecha BETWEEN :desde AND :hasta ${fs}`, r),
    Q(`SELECT COALESCE(SUM(monto),0) t FROM gym_pagos WHERE complex_id = :c AND anulado = 0 AND fecha = :hoy ${fs}`, r),
    Q(`SELECT COALESCE(SUM(monto),0) t FROM gym_pagos WHERE complex_id = :c AND anulado = 0 AND fecha BETWEEN :mes AND :hoy ${fs}`, r),
    Q(`SELECT COUNT(DISTINCT socio_id) n FROM gym_asistencias WHERE complex_id = :c AND fecha = :hoy ${fs}`, r),
    Q(`SELECT SUM(fecha = :hoy AND estado <> 'cancelada') hoy, SUM(fecha BETWEEN :hoy AND DATE_ADD(:hoy, INTERVAL 6 DAY) AND estado IN ('disponible','completa')) proximas
       FROM gym_clases WHERE complex_id = :c ${fs}`, r),
    Q('SELECT COUNT(*) n FROM gym_profesores WHERE complex_id = :c AND activo = 1', r),
    // Costos del período: horas dictadas × valor hora + mantenimiento de equipos
    Q(`SELECT
         (SELECT COALESCE(SUM(c.duracion_min / 60 * p.valor_hora), 0) FROM gym_clases c JOIN gym_profesores p ON p.id = c.profesor_id
           WHERE c.complex_id = :c AND c.estado = 'finalizada' AND c.fecha BETWEEN :desde AND :hasta) profesores,
         (SELECT COALESCE(SUM(e.costo), 0) FROM gym_equipo_eventos e JOIN gym_equipos q ON q.id = e.equipo_id
           WHERE q.complex_id = :c AND e.fecha BETWEEN :desde AND :hasta) mantenimiento`, r),
    Q(`SELECT COALESCE(SUM(c.cupo),0) cupos, COALESCE(SUM(x.ocupados),0) ocupados FROM gym_clases c
       LEFT JOIN (SELECT clase_id, SUM(estado IN ('reservada','asistio','ausente')) ocupados FROM gym_reservas GROUP BY clase_id) x ON x.clase_id = c.id
       WHERE c.complex_id = :c AND c.estado <> 'cancelada' AND c.fecha BETWEEN :desde AND :hasta ${sucursal ? 'AND c.sucursal_id = :suc' : ''}`, r),
    Q(`SELECT m.mes, COALESCE(a.altas,0) altas, COALESCE(b.bajas,0) bajas FROM
         (SELECT DATE_FORMAT(DATE_ADD(:seis, INTERVAL k MONTH), '%Y-%m') mes FROM (SELECT 0 k UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) x) m
       LEFT JOIN (SELECT DATE_FORMAT(fecha_alta, '%Y-%m') mes, COUNT(*) altas FROM gym_socios WHERE complex_id = :c ${fs} GROUP BY mes) a ON a.mes = m.mes
       LEFT JOIN (SELECT DATE_FORMAT(fecha_baja, '%Y-%m') mes, COUNT(*) bajas FROM gym_socios WHERE complex_id = :c AND fecha_baja IS NOT NULL ${fs} GROUP BY mes) b ON b.mes = m.mes
       ORDER BY m.mes`, r),
    Q(`SELECT fecha, SUM(monto) total FROM gym_pagos WHERE complex_id = :c AND anulado = 0 AND fecha BETWEEN :desde AND :hasta ${fs} GROUP BY fecha ORDER BY fecha`, r),
    Q(`SELECT fecha, COUNT(*) total FROM gym_asistencias WHERE complex_id = :c AND fecha BETWEEN :desde AND :hasta ${fs} GROUP BY fecha ORDER BY fecha`, r),
    Q(`SELECT CAST(SUBSTRING(hora,1,2) AS UNSIGNED) h, COUNT(*) total FROM gym_asistencias WHERE complex_id = :c AND fecha BETWEEN :desde AND :hasta ${fs} GROUP BY h ORDER BY h`, r),
    Q(`SELECT a.nombre, COUNT(*) total FROM gym_asistencias s JOIN gym_actividades a ON a.id = s.actividad_id
       WHERE s.complex_id = :c AND s.fecha BETWEEN :desde AND :hasta ${sucursal ? 'AND s.sucursal_id = :suc' : ''} GROUP BY a.id ORDER BY total DESC LIMIT 8`, r),
    Q('SELECT COUNT(DISTINCT socio_id) pagadores FROM gym_pagos WHERE complex_id = :c AND anulado = 0 AND fecha BETWEEN :desde AND :hasta', r),
  ]);

  const s = socios[0];
  const activos = n(s.activos), morosos = n(s.morosos), alInicio = n(s.al_inicio);
  const facturado = n(fact[0].t), costoTotal = n(costos[0].profesores) + n(costos[0].mantenimiento);
  return {
    periodo: { desde, hasta },
    tarjetas: {
      socios_activos: activos, socios_morosos: morosos, socios_congelados: n(s.congelados), socios_suspendidos: n(s.suspendidos),
      nuevos_socios: n(s.nuevos), bajas: n(s.bajas), asistencia_hoy: n(asistHoy[0].n),
      facturacion_hoy: n(factHoy[0].t), facturacion_mes: n(factMes[0].t), facturacion_periodo: facturado,
      clases_hoy: n(clases[0].hoy), clases_proximas: n(clases[0].proximas), profesores_activos: n(profes[0].n),
      costos_periodo: Math.round(costoTotal), rentabilidad: Math.round(facturado - costoTotal),
    },
    kpis: {
      retencion: pct(n(s.retenidos), alInicio),
      churn: pct(n(s.bajas), alInicio),
      ticket_promedio: n(fact[0].n) ? Math.round(facturado / n(fact[0].n)) : 0,
      ingreso_por_socio: n(pagosN[0].pagadores) ? Math.round(facturado / n(pagosN[0].pagadores)) : 0,
      ocupacion_clases: pct(n(ocupClases[0].ocupados), n(ocupClases[0].cupos)),
      morosidad: pct(morosos, activos + morosos),
      margen: pct(facturado - costoTotal, facturado),
    },
    graficos: {
      altas_bajas: altasBajas.map(x => ({ mes: x.mes, altas: n(x.altas), bajas: n(x.bajas) })),
      ingresos: ingresos.map(x => ({ fecha: x.fecha, total: n(x.total) })),
      asistencia: asistencia.map(x => ({ fecha: x.fecha, total: n(x.total) })),
      ocupacion_horaria: porHora.map(x => ({ hora: `${String(x.h).padStart(2, '0')}:00`, total: n(x.total) })),
      actividades: topActividades.map(x => ({ nombre: x.nombre, total: n(x.total) })),
    },
  };
}

// ── Reportes ────────────────────────────────────────────────────────────────
const fmtMoney = (v) => `$${Math.round(n(v)).toLocaleString('es-AR')}`;
const REPORTES = {
  socios_activos: {
    titulo: 'Socios activos',
    columnas: [['apellido', 'Apellido'], ['nombre', 'Nombre'], ['dni', 'DNI'], ['codigo', 'Código'], ['telefono', 'Teléfono'], ['plan', 'Plan'], ['vence', 'Vence'], ['fecha_alta', 'Alta']],
    datos: (c) => Q(`SELECT s.apellido, s.nombre, s.dni, s.codigo, COALESCE(s.whatsapp, s.telefono) telefono, p.nombre plan, m.fecha_fin vence, s.fecha_alta
      FROM gym_socios s
      LEFT JOIN gym_membresias m ON m.id = (SELECT id FROM gym_membresias WHERE socio_id = s.id AND estado = 'vigente' ORDER BY fecha_fin DESC LIMIT 1)
      LEFT JOIN gym_planes p ON p.id = m.plan_id
      WHERE s.complex_id = :c AND s.estado = 'activo' ORDER BY s.apellido, s.nombre`, { c }),
  },
  morosos: {
    titulo: 'Socios morosos',
    columnas: [['apellido', 'Apellido'], ['nombre', 'Nombre'], ['dni', 'DNI'], ['whatsapp', 'WhatsApp'], ['ultimo_vencimiento', 'Último vencimiento'], ['saldo', 'Deuda', fmtMoney]],
    datos: (c) => cobranzas.morosos(c),
  },
  cobranza: {
    titulo: 'Cobranza',
    columnas: [['fecha', 'Fecha'], ['numero_recibo', 'Recibo'], ['socio', 'Socio'], ['dni', 'DNI'], ['concepto', 'Concepto'], ['metodo', 'Medio'], ['monto', 'Monto', fmtMoney]],
    datos: (c, r) => Q(`SELECT p.fecha, p.numero_recibo, CONCAT(s.apellido, ', ', s.nombre) socio, s.dni, p.concepto, p.metodo, p.monto
      FROM gym_pagos p JOIN gym_socios s ON s.id = p.socio_id WHERE p.complex_id = :c AND p.anulado = 0 AND p.fecha BETWEEN :desde AND :hasta ORDER BY p.fecha, p.id`, { c, ...r }),
    total: 'monto',
  },
  asistencia: {
    titulo: 'Asistencia',
    columnas: [['fecha', 'Fecha'], ['hora', 'Hora'], ['socio', 'Socio'], ['dni', 'DNI'], ['actividad', 'Actividad'], ['profesor', 'Profesor'], ['sucursal', 'Sucursal'], ['origen', 'Origen']],
    datos: (c, r) => Q(`SELECT a.fecha, a.hora, CONCAT(s.apellido, ', ', s.nombre) socio, s.dni, ac.nombre actividad, CONCAT(p.nombre, ' ', p.apellido) profesor, su.nombre sucursal, a.origen
      FROM gym_asistencias a JOIN gym_socios s ON s.id = a.socio_id LEFT JOIN gym_actividades ac ON ac.id = a.actividad_id
      LEFT JOIN gym_profesores p ON p.id = a.profesor_id LEFT JOIN gym_sucursales su ON su.id = a.sucursal_id
      WHERE a.complex_id = :c AND a.fecha BETWEEN :desde AND :hasta ORDER BY a.fecha, a.hora`, { c, ...r }),
  },
  actividades: {
    titulo: 'Actividades',
    columnas: [['actividad', 'Actividad'], ['clases', 'Clases'], ['cupos', 'Cupos'], ['reservas', 'Reservas'], ['asistentes', 'Asistentes'], ['ocupacion', 'Ocupación %']],
    datos: async (c, r) => (await Q(`SELECT a.nombre actividad, COUNT(DISTINCT cl.id) clases, COALESCE(SUM(cl.cupo),0) cupos, COALESCE(SUM(x.res),0) reservas, COALESCE(SUM(x.asis),0) asistentes
      FROM gym_actividades a LEFT JOIN gym_clases cl ON cl.actividad_id = a.id AND cl.estado <> 'cancelada' AND cl.fecha BETWEEN :desde AND :hasta
      LEFT JOIN (SELECT clase_id, SUM(estado IN ('reservada','asistio','ausente')) res, SUM(estado = 'asistio') asis FROM gym_reservas GROUP BY clase_id) x ON x.clase_id = cl.id
      WHERE a.complex_id = :c GROUP BY a.id ORDER BY asistentes DESC`, { c, ...r })).map(f => ({ ...f, ocupacion: pct(n(f.reservas), n(f.cupos)) })),
  },
  profesores: {
    titulo: 'Profesores',
    columnas: [['apellido', 'Apellido'], ['nombre', 'Nombre'], ['rol', 'Rol'], ['clases', 'Clases'], ['horas', 'Horas'], ['asistentes', 'Asistentes'], ['pct_asistencia', 'Asistencia %'], ['liquidacion_horas', 'Liquidación', fmtMoney]],
    datos: async (c, r) => (await require('./catalogosService').estadisticasProfesores(c, r)).profesores,
  },
  rentabilidad: {
    titulo: 'Rentabilidad por mes',
    columnas: [['mes', 'Mes'], ['ingresos', 'Ingresos', fmtMoney], ['costo_profesores', 'Profesores', fmtMoney], ['costo_mantenimiento', 'Mantenimiento', fmtMoney], ['resultado', 'Resultado', fmtMoney]],
    datos: async (c, r) => {
      const [ing, prof, mant] = await Promise.all([
        Q("SELECT DATE_FORMAT(fecha,'%Y-%m') mes, SUM(monto) t FROM gym_pagos WHERE complex_id = :c AND anulado = 0 AND fecha BETWEEN :desde AND :hasta GROUP BY mes", { c, ...r }),
        Q("SELECT DATE_FORMAT(c.fecha,'%Y-%m') mes, SUM(c.duracion_min / 60 * p.valor_hora) t FROM gym_clases c JOIN gym_profesores p ON p.id = c.profesor_id WHERE c.complex_id = :c AND c.estado = 'finalizada' AND c.fecha BETWEEN :desde AND :hasta GROUP BY mes", { c, ...r }),
        Q("SELECT DATE_FORMAT(e.fecha,'%Y-%m') mes, SUM(e.costo) t FROM gym_equipo_eventos e JOIN gym_equipos q ON q.id = e.equipo_id WHERE q.complex_id = :c AND e.fecha BETWEEN :desde AND :hasta GROUP BY mes", { c, ...r }),
      ]);
      const meses = [...new Set([...ing, ...prof, ...mant].map(x => x.mes))].sort();
      const de = (arr, m) => n(arr.find(x => x.mes === m)?.t);
      return meses.map(m => ({ mes: m, ingresos: de(ing, m), costo_profesores: de(prof, m), costo_mantenimiento: de(mant, m), resultado: de(ing, m) - de(prof, m) - de(mant, m) }));
    },
  },
};

async function reporte(complexId, tipo, q) {
  const def = REPORTES[tipo];
  if (!def) throw httpError(400, `Reporte inválido. Opciones: ${Object.keys(REPORTES).join(', ')}.`);
  const { desde, hasta } = rango(q);
  const filas = await def.datos(complexId, { desde, hasta });
  const total = def.total ? filas.reduce((s, f) => s + n(f[def.total]), 0) : null;
  return { tipo, titulo: def.titulo, desde, hasta, columnas: def.columnas.map(([k, l]) => ({ key: k, label: l })), filas, total };
}

const celda = (col, f) => { const v = f[col[0]]; return col[2] ? col[2](v) : (v ?? ''); };

/** CSV separado por ";" con BOM UTF-8 (Excel en español lo abre con columnas). */
function aCsv(tipo, rep) {
  const cols = REPORTES[tipo].columnas;
  const esc = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lineas = [cols.map(c => esc(c[1])).join(';'), ...rep.filas.map(f => cols.map(c => esc(f[c[0]] ?? '')).join(';'))];
  if (rep.total !== null) lineas.push(cols.map((c, i) => (i === 0 ? 'TOTAL' : c[0] === REPORTES[tipo].total ? rep.total : '')).join(';'));
  return `﻿${lineas.join('\r\n')}`;
}

/** HTML imprimible (el usuario lo guarda como PDF desde el diálogo de impresión). */
function aHtml(tipo, rep, complejo) {
  const cols = REPORTES[tipo].columnas;
  const e = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${e(rep.titulo)} · ${e(complejo)}</title>
<style>body{font:12px system-ui,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0}p{color:#555;margin:4px 0 16px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:left}th{background:#f3f4f6}
tfoot td{font-weight:700}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:6px 12px">Imprimir / Guardar PDF</button>
<h1>${e(rep.titulo)}</h1><p>${e(complejo)} · ${e(rep.desde)} a ${e(rep.hasta)} · ${rep.filas.length} registro(s) · generado ${e(new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }))}</p>
<table><thead><tr>${cols.map(c => `<th>${e(c[1])}</th>`).join('')}</tr></thead><tbody>
${rep.filas.map(f => `<tr>${cols.map(c => `<td>${e(celda(c, f))}</td>`).join('')}</tr>`).join('\n')}
</tbody>${rep.total !== null ? `<tfoot><tr><td colspan="${cols.length - 1}">Total</td><td>${e(fmtMoney(rep.total))}</td></tr></tfoot>` : ''}</table>
<script>setTimeout(()=>print(),400)</script></body></html>`;
}

module.exports = { dashboard, reporte, aCsv, aHtml, REPORTES };
