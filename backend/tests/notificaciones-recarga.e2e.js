/**
 * tests/notificaciones-recarga.e2e.js — Aviso de resultado de zona por la API real (club TEMPORAL).
 *
 *   npm run test:notificaciones:recarga
 *
 * Cubre lo reportado en producción:
 *  - cargar un resultado de zona dispara el aviso al instante (sin esperar al scheduler);
 *  - borrar el resultado y volver a cargarlo vuelve a mandar el aviso (sin duplicar si no cambia nada);
 *  - abrir el portal en el navegador NO desmarca un dispositivo registrado como app instalada;
 *  - si la inscripción no tiene DNI, se usa el de la ficha del jugador;
 *  - diagnóstico del jugador (dispositivos + últimas notificaciones) y notificación de prueba.
 * El transporte (Web Push / FCM) se reemplaza por un doble que registra los envíos.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
process.env.TORNEO_PUSH_JOBS = '1';   // el disparo inmediato está activo (los intervalos no se inician en tests)

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
/** Espera hasta que se cumpla la condición (máx. 10 s): el aviso sale en segundo plano. */
async function hasta(cond, ms = 10000) { const fin = Date.now() + ms; while (Date.now() < fin) { if (cond()) return true; await esperar(200); } return false; }

(async () => {
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const transport = require('../src/services/notifications/transport');
  const enviados = [];
  transport.send = async (sub, payload) => { enviados.push({ sub: sub.endpoint || sub.fcm_token, payload }); return { ok: true }; };
  transport.disponible = () => true;

  const server = app.listen(0);
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const s = Date.now();
  const sfx = s % 100000;
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Recarga', email: `nr-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `NR TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const req = async (method, path, body, token = tk) => {
    const r = await fetch(`${root}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const call = (method, path, body) => req(method, `/torneos/club/${club.id}${path}`, body);
  const dni = (n) => String(46000000 + sfx * 100 + n);
  const dnis = Array.from({ length: 6 }, (_, i) => dni(i + 1));
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Recarga' })).data;
    const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
    const t = (await call('POST', '/torneos', { nombre: 'Copa Recarga', liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-11', cupo_parejas: 8, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneoId = t.id;
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }] });
    const jug = (n) => ({ nombre: `Jugador${n} Recarga`, dni: dni(n), whatsapp: `54938160${String(sfx).padStart(5, '0')}${n}`.slice(0, 13), categoria: 5, genero: 'masculino' });
    for (let i = 0; i < 3; i++) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(i * 2 + 1), jug(i * 2 + 2)], horarios_preferidos: franja, pagado: true });
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });

    // El jugador 1 activa las notificaciones desde la app instalada
    await m.PlayerAccess.create({ dni: dni(1), password_hash: 'x', must_change_password: false });
    const tj = jwt.sign({ tipo: 'jugador', dni: dni(1), rol: 'ROLE_PLAYER' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const sub = { endpoint: `https://push.test/${s}`, keys: { p256dh: 'x', auth: 'y' } };
    ok((await req('POST', '/player/push/subscribe', { subscription: sub, installed: true }, tj)).status === 201, 'jugador 1 activa notificaciones en la app instalada');
    // Después abre el portal en el navegador común (misma suscripción) → sigue marcado como instalado
    await req('POST', '/player/push/subscribe', { subscription: sub, installed: false }, tj);
    ok((await m.PlayerPushSubscription.findOne({ where: { endpoint: sub.endpoint } })).installed === true, 'abrir el portal en el navegador NO desmarca la app instalada (causa del problema en producción)');

    // Jugador 2: la inscripción quedó sin DNI, pero su ficha lo tiene
    await m.PlayerPushSubscription.create({ dni: dni(2), proveedor: 'webpush', endpoint: `https://push.test/${s}-2`, keys: { p256dh: 'x', auth: 'y' }, installed: true, activo: true });
    await m.sequelize.query("UPDATE torneo_jugadores SET dni = '' WHERE dni = ?", { replacements: [dni(2)] });

    // ── Cargar el resultado de zona del jugador 1 ──
    const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const p = fx.zonas[0].partidos.find(x => [x.pareja1?.nombre, x.pareja2?.nombre].some(n => n?.includes('Jugador1 ')));
    const ganaLocal = p.pareja1.nombre.includes('Jugador1 ');
    const r1 = await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: ganaLocal ? [[6, 3], [6, 4]] : [[3, 6], [4, 6]] });
    ok(r1.status === 200, 'resultado de zona cargado');
    await hasta(() => enviados.length >= 2);
    const aJ1 = () => enviados.filter(e => e.sub === sub.endpoint && e.payload.tipo !== 'manual');
    ok(aJ1().length === 1 && aJ1()[0].payload.titulo === '🎉 ¡Felicitaciones!', `aviso enviado al instante al cargar el resultado (${aJ1().map(e => e.payload.titulo).join(', ')})`);
    ok(enviados.some(e => e.sub === `https://push.test/${s}-2`), 'jugador sin DNI en la inscripción: se usa el DNI de su ficha');
    const log1 = await m.NotificationLog.findOne({ where: { dni: dni(1), partido_id: p.id } });
    ok(log1?.estado === 'enviado', 'queda registrado como enviado');

    // ── Volver a cargar el mismo resultado (sin borrar) → no duplica ──
    await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: ganaLocal ? [[6, 3], [6, 4]] : [[3, 6], [4, 6]] });
    await esperar(3000);
    ok(aJ1().length === 1, 'cargar de nuevo el mismo resultado no duplica el aviso');

    // ── Borrar y volver a cargar → vuelve a mandar ──
    ok((await call('DELETE', `/torneos/${t.id}/partidos/${p.id}/resultado`)).status === 200, 'resultado borrado');
    await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: ganaLocal ? [[6, 1], [6, 1]] : [[1, 6], [1, 6]] });
    await hasta(() => aJ1().length >= 2);
    ok(aJ1().length === 2, `borrar y volver a cargar → se vuelve a mandar el aviso (${aJ1().length} envíos)`);
    // Corrección con otro ganador → aviso nuevo (perdió)
    await call('DELETE', `/torneos/${t.id}/partidos/${p.id}/resultado`);
    await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: ganaLocal ? [[3, 6], [4, 6]] : [[6, 3], [6, 4]] });
    await hasta(() => aJ1().length >= 3);
    ok(aJ1().length === 3 && aJ1().at(-1).payload.titulo === '💪 Gran esfuerzo', 'corrección con otro ganador → aviso nuevo con el resultado correcto');

    // ── Diagnóstico y prueba del jugador ──
    const est = await req('GET', '/player/push/estado', null, tj);
    ok(est.status === 200 && est.data.dispositivos.length === 1 && est.data.dispositivos[0].installed && est.data.ultimas.length >= 3, 'diagnóstico: dispositivo instalado y últimas notificaciones');
    const pr = await req('POST', '/player/push/test', {}, tj);
    ok(pr.status === 200 && pr.data.estado === 'enviado' && pr.data.dispositivos === 1, 'notificación de prueba enviada al dispositivo');
    const met = (await call('GET', '/notificaciones/metricas')).data;
    ok(met.motor && typeof met.motor.activos === 'boolean' && met.motor.jobs.resultNotificationJob?.corridas > 0, 'métricas del admin informan el estado del envío automático');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const tsvc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await tsvc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.NotificationLog.destroy({ where: { dni: dnis } });
    await m.PlayerPushSubscription.destroy({ where: { dni: dnis } });
    await m.PlayerAccess.destroy({ where: { dni: dnis } });
    await m.PlayerAccessLog.destroy({ where: { dni: dnis } });
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.TimeSlot.destroy({ where: { field_id: [c1.id] } });
    await m.Field.destroy({ where: { id: [c1.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(() => {});
    await admin.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
