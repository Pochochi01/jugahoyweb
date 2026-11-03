/**
 * tests/gym.e2e.js — Prueba de punta a punta del módulo Gym por HTTP.
 *
 *   npm run test:gym
 *
 * Crea un complejo y usuarios TEMPORALES, recorre el flujo completo (catálogos, socios,
 * acceso, cobranzas, clases/reservas/espera, asistencia, rutinas, evaluaciones, nutrición,
 * equipos, dashboard, reportes, permisos por rol, app del socio, auditoría) y al final
 * borra todo lo que creó. No toca datos existentes ni envía mensajes.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const m = require('../src/models');
const { todayAR, sumarDias } = require('../src/utils/time');

let fallas = 0, total = 0;

/** Borra los datos gym del complejo respetando las FK RESTRICT (plan/actividad en uso). */
async function limpiarComplejo(id) {
  for (const tabla of ['gym_reservas', 'gym_asistencias']) await m.sequelize.query(`DELETE x FROM ${tabla} x JOIN gym_socios s ON s.id = x.socio_id WHERE s.complex_id = ?`, { replacements: [id] });
  for (const tabla of ['gym_clases', 'gym_pagos', 'gym_membresias']) await m.sequelize.query(`DELETE FROM ${tabla} WHERE complex_id = ?`, { replacements: [id] });
  await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [id] });
}
const ok = (cond, msg) => { total++; console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fallas++; };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/gym`;
  const sufijo = Date.now();
  const admin = await m.User.create({ nombre: 'Test', apellido: 'GymAdmin', email: `gym-admin-${sufijo}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const recep = await m.User.create({ nombre: 'Test', apellido: 'Recepcion', email: `gym-recep-${sufijo}@test.local`, password: 'x', rol: 'collaborator', activo: true });
  const complejo = await m.Complex.create({ nombre: `GYM TEST ${sufijo}`, direccion: 'Test 123', owner_id: admin.id, activo: true, modulo_gym: false });
  const col = await m.Collaborator.create({ complex_id: complejo.id, user_id: recep.id, activo: true, permisos: {} });
  const tk = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body, user = admin, raw = false) => {
    const r = await fetch(`${base}/${complejo.id}${path}`, { method, headers: { Authorization: `Bearer ${tk(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: raw ? await r.text() : await r.json().catch(() => null) };
  };
  const portal = async (method, path, token) => {
    const r = await fetch(`${base}/socio/${token}${path}`, { method });
    return { status: r.status, data: await r.json().catch(() => null) };
  };

  try {
    // ── Módulo deshabilitado ──
    ok((await call('GET', '/contexto')).status === 403, 'módulo deshabilitado → 403');
    await complejo.update({ modulo_gym: true });
    const ctx = await call('GET', '/contexto');
    ok(ctx.status === 200 && ctx.data.total === true, 'dueño del complejo: acceso total');

    // ── Catálogos ──
    const suc = (await call('POST', '/sucursales', { nombre: 'Centro' })).data;
    const act = (await call('POST', '/actividades', { nombre: 'Funcional', tipo: 'funcional' })).data;
    const act2 = (await call('POST', '/actividades', { nombre: 'Spinning', tipo: 'spinning' })).data;
    ok(suc.id && act.id && act2.id, 'sucursal y actividades creadas');
    const plan = await call('POST', '/planes', { nombre: 'Mensual Funcional', tipo: 'funcional', periodo: 'mensual', precio: 20000, descuento_pct: 10, actividad_ids: [act.id] });
    ok(plan.status === 201 && plan.data.actividades.length === 1, 'plan con actividades permitidas');
    ok((await call('POST', '/planes', { nombre: 'X', periodo: 'eterno', precio: 1 })).status === 400, 'plan con período inválido → 400');
    const prof = (await call('POST', '/profesores', { nombre: 'Ana', apellido: 'Profe', valor_hora: 5000, horarios: [{ dia_semana: 1, hora_desde: '08:00', hora_hasta: '12:00' }] })).data;
    ok(prof.id && prof.horarios.length === 1, 'profesor con horarios');

    // ── Socios ──
    const s1 = await call('POST', '/socios', { nombre: 'Juan', apellido: 'Socio', dni: '30111222', sucursal_id: suc.id, whatsapp: '1155550000' });
    ok(s1.status === 201 && s1.data.codigo && s1.data.qr_token, 'alta de socio con código y QR');
    ok((await call('POST', '/socios', { nombre: 'Otro', apellido: 'Igual', dni: '30.111.222' })).status === 409, 'DNI duplicado → 409');
    ok((await call('POST', '/socios', { nombre: 'Sin' })).status === 400, 'socio sin campos obligatorios → 400');
    const socio = s1.data;

    // ── Acceso sin plan / sin apto ──
    let acc = (await call('POST', '/acceso', { metodo: 'dni', dato: '30111222' })).data;
    ok(!acc.permitido && acc.motivos.includes('Sin plan vigente') && acc.motivos.some(x => x.includes('Apto')), 'acceso bloqueado: sin plan y sin apto');

    // ── Cobranzas ──
    const memb = await call('POST', `/socios/${socio.id}/membresias`, { plan_id: plan.data.id });
    ok(memb.status === 201 && Number(memb.data.total) === 18000, 'membresía con descuento del plan (20000 − 10%)');
    acc = (await call('POST', '/acceso', { metodo: 'codigo', dato: socio.codigo })).data;
    ok(!acc.permitido && acc.motivos.some(x => x.includes('adeudada')), 'acceso bloqueado: cuota adeudada');
    const pago = await call('POST', `/socios/${socio.id}/pagos`, { monto: 18000, metodo: 'efectivo', membresia_id: memb.data.id });
    ok(pago.status === 201 && pago.data.cuenta.saldo === 0 && /^G-\d{8}$/.test(pago.data.pago.numero_recibo), 'pago con recibo correlativo y saldo 0');
    await call('POST', `/socios/${socio.id}/aptos`, { fecha_emision: todayAR(), fecha_vencimiento: sumarDias(todayAR(), 365) });
    acc = (await call('POST', '/acceso', { metodo: 'qr', dato: `GYM:${socio.qr_token}` })).data;
    ok(acc.permitido, 'acceso por QR permitido con plan, pago y apto');
    ok((await call('POST', '/acceso', { metodo: 'dni', dato: '99999999' })).data.permitido === false, 'socio inexistente → denegado y registrado');
    const accesos = (await call('GET', '/accesos')).data;
    ok(accesos.length === 4 && accesos.filter(a => a.resultado === 'denegado').length === 3, 'intentos de acceso registrados (3 denegados, 1 permitido)');
    const notif = await m.Notification.count({ where: { user_id: admin.id, tipo: 'gym_alerta' } });
    ok(notif >= 2, 'administrador notificado de los ingresos bloqueados');
    const ficha = (await call('GET', `/socios/${socio.id}`)).data;
    ok(ficha.vigente && ficha.apto_vigente && ficha.historial.some(x => x.tipo === 'pago'), 'ficha: plan vigente, apto y historial');

    // ── Clases, reservas y lista de espera ──
    const manana = sumarDias(todayAR(), 1);
    const clase = await call('POST', '/clases', { actividad_id: act.id, profesor_id: prof.id, sucursal_id: suc.id, fecha: manana, hora_inicio: '10:00', duracion_min: 60, cupo: 1, repetir_semanas: 1 });
    ok(clase.status === 201 && clase.data.creadas.length === 2, 'clase repetida 2 semanas');
    ok((await call('POST', '/clases', { actividad_id: act.id, profesor_id: prof.id, fecha: manana, hora_inicio: '10:30' })).status === 409, 'profesor superpuesto → 409');
    const claseId = clase.data.creadas[0].id;
    const s2 = (await call('POST', '/socios', { nombre: 'Maria', apellido: 'Espera', dni: '30222333' })).data;
    const r1 = await call('POST', `/clases/${claseId}/reservas`, { socio_id: socio.id });
    const r2 = await call('POST', `/clases/${claseId}/reservas`, { socio_id: s2.id });
    ok(!r1.data.en_espera && r2.data.en_espera, 'cupo lleno → segundo socio a lista de espera');
    const lista = (await call('GET', `/clases?desde=${manana}&hasta=${manana}`)).data;
    ok(lista[0].estado === 'completa' && lista[0].espera === 1, 'clase "completa" con 1 en espera');
    const canc = await call('DELETE', `/reservas/${r1.data.reserva.id}`);
    ok(canc.data.promovido === s2.id, 'al cancelar, el primero en espera pasa a reservado');
    await call('PUT', `/clases/${claseId}/asistencia`, { presentes: [s2.id] });
    ok((await m.GymAsistencia.count({ where: { clase_id: claseId, socio_id: s2.id } })) === 1, 'asistencia a clase registrada');

    // ── Rutinas (versionado) ──
    const rut = await call('POST', '/rutinas', { nombre: 'Fuerza', socio_id: socio.id, ejercicios: [{ nombre: 'Sentadilla', series: 4, repeticiones: '10', peso: '40kg', descanso_seg: 90 }] });
    ok(rut.status === 201 && rut.data.version_actual === 1 && rut.data.ejercicios.length === 1, 'rutina v1');
    const v2 = await call('PUT', `/rutinas/${rut.data.id}`, { notas: 'Progresión', ejercicios: [{ nombre: 'Sentadilla', series: 5, repeticiones: '8', peso: '50kg' }, { nombre: 'Plancha', series: 3, repeticiones: '45s' }] });
    ok(v2.data.version_actual === 2 && v2.data.ejercicios.length === 2 && v2.data.versiones.length === 2, 'rutina v2 (historial de versiones)');
    const v1 = (await call('GET', `/rutinas/${rut.data.id}?version=1`)).data;
    ok(v1.ejercicios.length === 1 && v1.ejercicios[0].peso === '40kg', 'versión anterior consultable');
    ok((await call('POST', `/rutinas/${rut.data.id}/comentarios`, { texto: 'Muy bien' })).status === 201, 'comentario en rutina');

    // ── Evaluación / nutrición ──
    const ev = await call('POST', `/socios/${socio.id}/evaluaciones`, { peso: 80, altura: 180, grasa_pct: 18 });
    ok(ev.status === 201 && Number(ev.data.imc) === 24.69, 'evaluación con IMC calculado (80 kg / 1,80 m)');
    ok((await call('POST', `/socios/${socio.id}/nutricion`, { plan: 'Dieta' })).status === 403, 'nutrición deshabilitada → 403');
    await call('PUT', '/config', { nutricion_habilitada: true });
    const nut = await call('POST', `/socios/${socio.id}/nutricion`, { plan: 'Desayuno: avena', objetivo: 'Definición' });
    ok(nut.status === 201 && (await call('POST', `/nutricion/${nut.data.id}/seguimientos`, { peso: 79 })).status === 201, 'plan alimenticio + seguimiento');

    // ── Equipos ──
    const eq = (await call('POST', '/equipos', { nombre: 'Cinta 1', tipo: 'cinta', frecuencia_mant_dias: 30, ultimo_mantenimiento: sumarDias(todayAR(), -40), garantia_hasta: sumarDias(todayAR(), 10) })).data;
    const al = (await call('GET', '/alertas')).data;
    ok(al.equipos.some(a => a.tipo === 'mantenimiento_vencido') && al.equipos.some(a => a.tipo === 'garantia'), 'alertas de mantenimiento vencido y garantía');
    await call('POST', `/equipos/${eq.id}/eventos`, { tipo: 'mantenimiento', descripcion: 'Lubricación', costo: 3000 });
    ok(!(await call('GET', '/alertas')).data.equipos.some(a => a.tipo === 'mantenimiento_vencido'), 'mantenimiento registrado → alerta resuelta');

    // ── Dashboard / reportes ──
    const dash = (await call('GET', '/dashboard')).data;
    ok(dash.tarjetas.socios_activos === 2 && dash.tarjetas.facturacion_hoy === 18000 && dash.tarjetas.nuevos_socios === 2, 'dashboard: activos, nuevos y facturación');
    ok(typeof dash.kpis.retencion === 'number' && typeof dash.kpis.morosidad === 'number' && dash.kpis.ticket_promedio === 18000, 'KPIs calculados');
    const repC = await call('GET', '/reportes/cobranza');
    ok(repC.data.filas.length === 1 && repC.data.total === 18000, 'reporte de cobranza');
    const csv = await call('GET', '/reportes/socios_activos?formato=csv', null, admin, true);
    ok(csv.status === 200 && csv.data.replace(/^﻿/, '').startsWith('Apellido;Nombre'), 'export Excel (CSV)');
    const html = await call('GET', '/reportes/morosos?formato=html', null, admin, true);
    ok(html.status === 200 && html.data.includes('<table>'), 'export PDF (HTML imprimible)');
    ok((await call('GET', '/reportes/inexistente')).status === 400, 'reporte inválido → 400');

    // ── Permisos por rol ──
    ok((await call('GET', '/socios', null, recep)).status === 403, 'colaborador sin rol de gym → 403');
    await call('PUT', `/roles/colaboradores/${col.id}`, { gym_rol: 'recepcionista' });
    ok((await call('GET', '/socios', null, recep)).status === 200, 'recepcionista: ve socios');
    ok((await call('POST', '/planes', { nombre: 'Y', periodo: 'mensual', precio: 1 }, recep)).status === 403, 'recepcionista: no crea planes');
    ok((await call('PUT', `/pagos/${pago.data.pago.id}/anular`, {}, recep)).status === 403, 'recepcionista: no anula pagos (aprobar)');
    ok((await call('GET', '/reportes/cobranza?formato=csv', null, recep, true)).status === 403, 'recepcionista: no exporta');

    // ── App del socio ──
    const ps = await portal('GET', '', socio.qr_token);
    ok(ps.status === 200 && ps.data.habilitado && ps.data.qr.startsWith('data:image/png'), 'app del socio: resumen + QR');
    const disp = (await portal('GET', '/disponibilidad', socio.qr_token)).data;
    const segunda = disp.find(c => c.id === clase.data.creadas[1].id);
    const resPortal = await portal('POST', `/clases/${segunda.id}/reservar`, socio.qr_token);
    ok(resPortal.status === 201, 'socio reserva desde su app');
    const clase2 = (await call('POST', '/clases', { actividad_id: act2.id, fecha: manana, hora_inicio: '18:00' })).data.creadas[0];
    ok((await portal('POST', `/clases/${clase2.id}/reservar`, socio.qr_token)).status === 409, 'plan no incluye la actividad → 409');
    ok((await portal('DELETE', `/reservas/${resPortal.data.reserva.id}`, socio.qr_token)).status === 200, 'socio cancela su reserva');
    ok((await portal('GET', '/rutinas', socio.qr_token)).data[0].version_actual === 2, 'socio ve su rutina vigente');
    ok((await portal('GET', '', 'f'.repeat(48))).status === 404, 'token inválido → 404');

    // ── Anulación y morosos ──
    const an = await call('PUT', `/pagos/${pago.data.pago.id}/anular`, { motivo: 'error' });
    ok(an.data.anulado === true, 'pago anulado (permiso aprobar)');
    ok((await call('GET', '/morosos')).data.some(x => x.id === socio.id && x.saldo === 18000), 'socio pasa a deudor tras anular');

    // ── Estados ──
    await call('PUT', `/socios/${socio.id}/estado`, { estado: 'congelado', motivo: 'viaje' });
    ok((await m.GymMembresia.findByPk(memb.data.id)).estado === 'congelada', 'congelar socio congela su membresía');
    acc = (await call('POST', '/acceso', { metodo: 'manual', dato: String(socio.id) })).data;
    ok(!acc.permitido && acc.motivos.includes('Socio congelado'), 'socio congelado no ingresa');

    // ── Auditoría ──
    const aud = (await call('GET', '/auditoria')).data;
    ok(aud.length > 20 && aud.every(a => a.complex_id === complejo.id) && aud.some(a => a.accion === 'anular' && a.ip), 'auditoría con usuario, acción, IP y empresa');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    // Limpieza: el complejo arrastra en cascada todas las tablas gym_*
    await m.GymAuditoria.destroy({ where: { complex_id: complejo.id } });
    await m.Notification.destroy({ where: { user_id: admin.id } });
    await m.Collaborator.destroy({ where: { id: col.id } });
    await limpiarComplejo(complejo.id);
    await m.User.destroy({ where: { id: [admin.id, recep.id] } });
    server.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    await m.sequelize.close();
    process.exit(fallas ? 1 : 0);
  }
})();
