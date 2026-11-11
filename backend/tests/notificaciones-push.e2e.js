/**
 * tests/notificaciones-push.e2e.js — Notificaciones push automáticas de torneos.
 *
 *   npm run test:notificaciones
 *
 * Club TEMPORAL. El transporte (FCM / Web Push) se reemplaza por un doble que registra los envíos.
 * Cubre: cada evento (recordatorio 3 h, pago, ganador/perdedor, clasificado, finalista,
 * semifinal, campeón, subcampeón, torneo finalizado), deduplicación, solo PWA instalada,
 * preferencias, cola con reintentos/backoff, baja de tokens inválidos, seguimiento
 * entregado/abierto, panel admin (listado, filtros, métricas, reenvío) y endpoints del jugador.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
process.env.TORNEO_PUSH_JOBS = '0';

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

(async () => {
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const transport = require('../src/services/notifications/transport');
  const svc = require('../src/services/notifications/NotificationService');
  const jobs = require('../src/jobs/tournamentNotifications');
  // Doble del transporte: comportamiento configurable por token
  const enviados = [];
  let modo = 'ok';
  transport.send = async (sub, payload) => {
    enviados.push({ sub: sub.fcm_token || sub.endpoint, payload });
    if (modo === 'transitorio') return { ok: false, invalido: false, error: '503 temporal' };
    if (modo === 'invalido') return { ok: false, invalido: true, error: 'messaging/registration-token-not-registered' };
    return { ok: true };
  };

  const server = app.listen(0);
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const s = Date.now();
  const sfx = s % 100000;
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Notif', email: `np-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `NP TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const req = async (method, path, body, token = tk) => {
    const r = await fetch(`${root}${path}`, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const call = (method, path, body) => req(method, `/torneos/club/${club.id}${path}`, body);
  const dni = (n) => String(41000000 + sfx * 100 + n);
  const torneos = [];
  const dnis = Array.from({ length: 12 }, (_, i) => dni(i + 1));
  const logs = (where = {}) => m.NotificationLog.findAll({ where: { dni: dnis, ...where }, raw: true });
  
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Push' })).data;
    const base = { liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', cupo_parejas: 16, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 };
    const franja = [{ fecha: null, desde: '08:00', hasta: '23:30' }];
    const crear = async (extra) => {
      const r = await call('POST', '/torneos', { ...base, ...extra });
      if (![200, 201].includes(r.status)) throw new Error(JSON.stringify(r));
      torneos.push(r.data.id);
      await call('PUT', `/torneos/${r.data.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }] });
      return r.data;
    };
    const jug = (n) => ({ nombre: `Jugador${n} Apellido`, dni: dni(n), whatsapp: `549381${String(sfx).padStart(5, '0')}${String(n).padStart(2, '0')}`, categoria: 5, genero: 'masculino' });

    // Dispositivos: jugadores 1..10 con la PWA instalada; 11 en navegador (no instalada); 12 sin dispositivo
    for (let n = 1; n <= 11; n++) {
      await m.PlayerPushSubscription.create({ dni: dni(n), proveedor: n % 2 ? 'fcm' : 'webpush', fcm_token: n % 2 ? `tok-${s}-${n}-xxxxxxxxxxxxxxxxxxxx` : null, endpoint: n % 2 ? null : `https://push.test/${s}/${n}`, keys: n % 2 ? null : { p256dh: 'x', auth: 'y' }, installed: n !== 11, activo: true });
    }

    // ── Torneo A: se juega completo (6 parejas → 2 zonas → semis → final) ──
    const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const A = await crear({ nombre: 'Copa Push', fecha_inicio: hoy, fecha_fin: hoy });
    for (let i = 0; i < 6; i++) await call('POST', `/torneos/${A.id}/parejas`, { jugadores: [jug(i * 2 + 1), jug(i * 2 + 2)], horarios_preferidos: franja, pagado: true });
    await call('POST', `/torneos/${A.id}/zonas/generar`, { notificar: false });
    await m.Torneo.update({ estado: 'zonas' }, { where: { id: A.id } });

    // ── 1. Recordatorio 3 h antes ──
    const en3h = new Date(Date.now() + (3 * 60 - 2) * 60000);   // dentro de la ventana (2 h 50 – 3 h)
    const loc = new Date(en3h.getTime() - 3 * 3600000).toISOString();
    const p0 = await m.TorneoPartido.findOne({ where: { torneo_id: A.id, ronda: 'zona', es_bye: false }, order: [['id', 'ASC']] });
    const jp0 = await m.TorneoJugador.findOne({ where: { pareja_id: p0.pareja1_id }, order: [['id', 'ASC']] });
    await m.NotificationPreference.create({ dni: jp0.dni, recordatorio_partidos: false });
    await p0.update({ estado: 'programado', fecha: loc.slice(0, 10), hora: loc.slice(11, 16), field_id: c1.id });
    const otro = await m.TorneoPartido.findOne({ where: { torneo_id: A.id, ronda: 'zona', id: { [require('sequelize').Op.ne]: p0.id } } });
    const lejos = new Date(Date.now() + 5 * 3600000 - 3 * 3600000).toISOString();
    await otro.update({ estado: 'programado', fecha: lejos.slice(0, 10), hora: lejos.slice(11, 16) });
    const n1 = await jobs.matchReminderJob();
    const rec = await logs({ tipo: 'recordatorio_partido' });
    ok(rec.length === 4 && rec.every(r => r.partido_id === p0.id), 'recordatorio: solo el partido a 3 h, a los 4 jugadores (local y visitante)');
    ok(rec[0].titulo === '🏆 Tu partido comienza en 3 horas' && rec[0].mensaje.includes('Copa Push') && rec[0].mensaje.includes(`🕒 Hora: ${loc.slice(11, 16)}`) && rec[0].mensaje.includes(`📍 Sede: ${club.nombre}`), 'recordatorio: título y mensaje con torneo, hora y sede');
    await jobs.matchReminderJob();
    ok((await logs({ tipo: 'recordatorio_partido' })).length === 4 && n1 >= 0, 'recordatorio: correr el job otra vez no duplica');
    await p0.update({ hora: new Date(en3h.getTime() - 3 * 3600000 + 60000).toISOString().slice(11, 16) });
    await jobs.matchReminderJob();
    ok((await logs({ tipo: 'recordatorio_partido' })).length === 8, 'partido reprogramado → nuevo recordatorio para el horario nuevo');

    // ── Cola: envío, seguimiento ──
    await svc.procesarCola();
    const env = await logs({ tipo: 'recordatorio_partido', estado: 'enviado' });
    ok(env.length > 0 && env.every(r => r.fecha_envio && r.dispositivos === 1), 'cola: pendientes → enviados (1 dispositivo cada uno)');
    const pl = enviados[0].payload;
    ok(pl.log_id && pl.t && pl.url.startsWith('/jugador/torneo/') && pl.titulo, 'payload: id de seguimiento firmado y acción "abrir detalle del partido"');
    const trk = (b) => fetch(`${root}/push-tracking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.status);
    ok(await trk({ id: pl.log_id, t: 'falso', evento: 'entregado' }) === 400, 'seguimiento con firma inválida → 400');
    ok(await trk({ id: pl.log_id, t: pl.t, evento: 'entregado' }) === 204 && (await m.NotificationLog.findByPk(pl.log_id)).estado === 'entregado', 'seguimiento: entregado');
    ok(await trk({ id: pl.log_id, t: pl.t, evento: 'abierto' }) === 204 && (await m.NotificationLog.findByPk(pl.log_id)).abierto_at, 'seguimiento: abierto');

    // ── Solo PWA instalada + preferencias ──
    const enPartido = new Set(rec.map(r => r.dni));
    const omit = await logs({ tipo: 'recordatorio_partido', estado: 'omitido' });
    ok(rec.length === 4 && omit.some(o => o.dni === jp0.dni && /preferencias/.test(o.motivo)), 'preferencia desactivada → omitido con motivo (queda auditado)');

    // ── 3. Resultados de zona + 4. clasificación ──
    const jugar = async () => {
      for (let v = 0; v < 6; v++) {
        const fx = (await call('GET', `/torneos/${A.id}/fixture`)).data;
        const pend = [...fx.zonas.flatMap(z => z.partidos), ...fx.llave.flatMap(r => r.partidos)].filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id && (v < 9));
        const soloZona = pend.filter(p => p.ronda === 'zona');
        const lote = jugar.hasta === 'zona' ? soloZona : pend;
        if (!lote.length) return fx;
        for (const p of lote) await call('PUT', `/torneos/${A.id}/partidos/${p.id}/resultado`, { sets: [[6, 3], [6, 4]] });
      }
      return (await call('GET', `/torneos/${A.id}/fixture`)).data;
    };
    jugar.hasta = 'zona';
    const fxZ = await jugar();
    const nZona = fxZ.zonas.flatMap(z => z.partidos).filter(p => !p.es_bye).length;
    await jobs.resultNotificationJob();
    const g = await logs({ tipo: 'resultado_ganador' });
    const l = await logs({ tipo: 'resultado_perdedor' });
    ok(g.length === nZona * 2 && l.length === nZona * 2, `resultado de zona: ganador y perdedor identificados (${g.length}/${l.length}, ${nZona} partidos)`);
    ok(g[0].titulo === '🎉 ¡Felicitaciones!' && l[0].titulo === '💪 Gran esfuerzo', 'textos de ganador y perdedor');
    await jobs.classificationNotificationJob();
    const cl = await logs({ tipo: 'clasificado_zona' });
    ok(cl.length === 8 && cl[0].titulo === '✅ ¡Clasificaste!', 'clasificación de zona: 2 parejas por zona × 2 zonas (8 jugadores)');
    await jobs.classificationNotificationJob(); await jobs.resultNotificationJob();
    ok((await logs({ tipo: 'clasificado_zona' })).length === 8 && (await logs({ tipo: 'resultado_ganador' })).length === nZona * 2, 'sin duplicados al repetir los jobs');

    // ── 6/7/8/9/10. Semifinal, final, campeón, subcampeón, torneo finalizado ──
    jugar.hasta = 'todo';
    const fxF = await jugar();
    await jobs.resultNotificationJob(); await jobs.finalNotificationJob();
    const tipo = async (t) => (await logs({ tipo: t })).length;
    ok(await tipo('finalista') === 4 && await tipo('eliminado_semifinal') === 4, 'semifinal: 4 finalistas y 4 eliminados');
    ok(await tipo('campeon') === 2 && await tipo('subcampeon') === 2, 'final: campeones y subcampeones');
    const camp = (await logs({ tipo: 'campeon' }))[0];
    const fin = fxF.llave.find(r => r.ronda === 'final').partidos[0];
    ok(camp.titulo === '🥇 ¡Campeón!' && camp.pareja_id === fin.resultado.ganador_id, 'campeón = ganador real de la final');
    const tA = await m.Torneo.findByPk(A.id);
    ok(tA.estado === 'finalizado' && await tipo('torneo_finalizado') === 12, 'torneo finalizado: aviso a los 12 participantes');
    ok((await logs({ tipo: 'torneo_finalizado' })).filter(r => r.estado === 'omitido').length === 2, 'jugadores sin PWA instalada (11: navegador, 12: sin app) → omitidos');

    // ── 2. Recordatorio de pago ──
    const en2d = new Date(Date.now() + 2 * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
    const B = await crear({ nombre: 'Copa Pago', fecha_inicio: en2d, fecha_fin: en2d, precio_inscripcion: 5000 });
    await m.Torneo.update({ estado: 'inscripcion' }, { where: { id: B.id } });
    await call('POST', `/torneos/${B.id}/parejas`, { jugadores: [jug(1), jug(2)], horarios_preferidos: franja });
    await call('POST', `/torneos/${B.id}/parejas`, { jugadores: [jug(3), jug(5)], horarios_preferidos: franja, pagado: true });
    await jobs.paymentReminderJob();
    const pago = await m.NotificationLog.findAll({ where: { tipo: 'recordatorio_pago', torneo_id: B.id }, raw: true });
    ok(pago.length === 2 && pago.every(p => p.dedupe_key.includes(':72h:')) && pago[0].url.includes(`/torneos/${B.id}?pagar=`), 'pago pendiente a 2 días → aviso de 3 días a la pareja que no pagó (con link de pago)');
    ok(pago[0].titulo === '💳 Inscripción pendiente' && JSON.parse(JSON.stringify(pago[0].payload_json)).actions?.[0]?.title === 'Pagar ahora', 'botón "Pagar ahora"');
    await jobs.paymentReminderJob();
    ok(await m.NotificationLog.count({ where: { tipo: 'recordatorio_pago', torneo_id: B.id } }) === 2, 'mismo umbral no se repite');

    // ── Reintentos, backoff e inválidos ──
    await svc.procesarCola();
    modo = 'transitorio';
    const r1 = await svc.sendPush({ dni: dni(1), nombre: 'X', titulo: 'Prueba', mensaje: 'm', torneo: tA, dedupe: `test-retry-${s}` });
    ok(r1.encoladas === 1, 'envío individual encolado');
    await new Promise(r => setTimeout(r, 300));
    await svc.procesarCola();
    let lr = await m.NotificationLog.findOne({ where: { dedupe_key: `test-retry-${s}` } });
    ok(lr.estado === 'pendiente' && lr.intentos === 1 && lr.proximo_intento > new Date(), 'error transitorio → reintento con backoff');
    for (let i = 0; i < 3; i++) { await lr.update({ proximo_intento: new Date(Date.now() - 1000) }); await svc.procesarCola(); lr = await lr.reload(); }
    ok(lr.estado === 'fallido' && lr.intentos === 3, `tras 3 intentos → fallido (${lr.estado}/${lr.intentos})`);
    modo = 'invalido';
    await svc.sendPush({ dni: dni(3), titulo: 'Prueba', mensaje: 'm', torneo: tA, dedupe: `test-inv-${s}` });
    await new Promise(r => setTimeout(r, 300));
    await svc.procesarCola();
    ok((await m.NotificationLog.findOne({ where: { dedupe_key: `test-inv-${s}` } })).estado === 'fallido' && !(await m.PlayerPushSubscription.findOne({ where: { dni: dni(3) } })).activo, 'token inválido → fallido y suscripción dada de baja');
    modo = 'ok';

    // ── Panel administrativo ──
    const lst = await call('GET', `/notificaciones?torneo_id=${A.id}&limit=5`);
    ok(lst.status === 200 && lst.data.total > 40 && lst.data.items.length === 5 && lst.data.items.every(i => i.torneo_id === A.id), 'admin: historial filtrado por torneo y paginado');
    const porJ = await call('GET', `/notificaciones?jugador=${dni(2)}`);
    ok(porJ.data.items.length && porJ.data.items.every(i => i.dni === dni(2)), 'admin: filtro por jugador (DNI)');
    ok((await call('GET', '/notificaciones?jugador=Jugador1 Apellido')).data.items.every(i => i.nombre === 'Jugador1 Apellido'), 'admin: filtro por nombre');
    ok((await call('GET', '/notificaciones?estado=fallido')).data.items.every(i => i.estado === 'fallido'), 'admin: filtro de fallidas');
    const met = (await call('GET', '/notificaciones/metricas')).data;
    ok(met.enviadas > 0 && met.fallidas >= 2 && met.abiertas >= 1 && met.usuarios_pwa === 9 && typeof met.ctr === 'number' && typeof met.tasa_entrega === 'number', `métricas: enviadas ${met.enviadas}, entregadas ${met.entregadas}, abiertas ${met.abiertas}, CTR ${met.ctr}%, entrega ${met.tasa_entrega}%, PWA ${met.usuarios_pwa}`);
    const fallida = await m.NotificationLog.findOne({ where: { dedupe_key: `test-retry-${s}` } });
    const re = await call('POST', `/notificaciones/${fallida.id}/reenviar`);
    if (re.status !== 201) console.log(re);
    ok(re.status === 201 && re.data.reenvio_de === fallida.id && re.data.estado === 'pendiente', 'admin: reenviar crea un envío nuevo enlazado al original');
    await svc.procesarCola();
    ok((await m.NotificationLog.findByPk(re.data.id)).estado === 'enviado', 'el reenvío se envía');
    const otroClub = await call('GET', '/notificaciones?limit=100');
    ok(otroClub.data.items.every(i => i.id_tenant === club.id), 'admin: solo notificaciones de su club');

    // ── Endpoints del jugador ──
    await m.PlayerAccess.create({ dni: dni(6), password_hash: 'x', must_change_password: false });
    const tj = jwt.sign({ tipo: 'jugador', dni: dni(6), rol: 'ROLE_PLAYER' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const pr = await req('GET', '/player/push/preferences', null, tj);
    ok(pr.status === 200 && pr.data.recordatorio_partidos === true && pr.data.promociones === false, 'jugador: preferencias por defecto');
    const pr2 = await req('POST', '/player/push/preferences', { resultado_partidos: false }, tj);
    ok(pr2.status === 200 && pr2.data.resultado_partidos === false, 'jugador: guarda preferencias');
    const tokNuevo = `tok-nuevo-${s}-xxxxxxxxxxxxxxxxxxxxxx`;
    const sb = await req('POST', '/player/push/subscribe', { proveedor: 'fcm', fcm_token: tokNuevo, token_anterior: `tok-${s}-7-xxxxxxxxxxxxxxxxxxxx`, installed: true }, tj);
    ok(sb.status === 201 && await m.PlayerPushSubscription.count({ where: { fcm_token: tokNuevo, installed: true, device_type: 'desktop' } }) === 1, 'jugador: registra token FCM (dispositivo, navegador, instalada)');
    ok((await req('POST', '/player/push/subscribe', { proveedor: 'fcm', fcm_token: 'corto' }, tj)).status === 400, 'token FCM inválido → 400');
    ok((await req('POST', '/player/push/unsubscribe', { fcm_token: tokNuevo }, tj)).status === 200 && !(await m.PlayerPushSubscription.count({ where: { fcm_token: tokNuevo } })), 'jugador: baja del token');
    ok((await req('PUT', '/player/push/preferences', { finales: false }, tj)).status === 405, 'el portal sigue siendo de solo lectura (PUT → 405)');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const tsvc = require('../src/services/torneos/torneoService');
    for (const id of torneos) { const t = await m.Torneo.findByPk(id); if (t) await tsvc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.NotificationLog.destroy({ where: { dni: dnis } });
    await m.NotificationPreference.destroy({ where: { dni: dnis } });
    await m.PlayerPushSubscription.destroy({ where: { dni: dnis } });
    await m.PlayerPushSubscription.destroy({ where: { fcm_token: { [require('sequelize').Op.like]: `tok-%${s}%` } } });
    await m.PlayerAccess.destroy({ where: { dni: dnis } });
    await m.PlayerAccessLog.destroy({ where: { dni: dnis } });
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } });
    await m.TimeSlot.destroy({ where: { field_id: [c1.id] } });
    await m.Field.destroy({ where: { id: [c1.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] });
    await admin.destroy();
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
