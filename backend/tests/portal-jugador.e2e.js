/**
 * tests/portal-jugador.e2e.js — Portal de Jugador (solo lectura).
 *
 *   npm run test:portal-jugador
 *
 * Club TEMPORAL con liga A (torneos T1 donde juega el DNI y T2 donde no) y liga B (T3).
 * Verifica: login por DNI, cambio obligatorio de clave, bloqueo, recuperación, visibilidad
 * (propios + misma liga; el resto 403), endpoints de lectura, candado 405 sobre cualquier
 * escritura, rechazo del token en rutas de staff, auditoría y que NO cambió ningún dato.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

(async () => {
  const jwt = require('jsonwebtoken');
  const crypto = require('crypto');
  const app = require('../src/app');
  const m = require('../src/models');
  const server = app.listen(0);
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const s = Date.now();
  const DNI = String(39000000 + (s % 900000));
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Portal', email: `pj-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `PJ TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tkAdmin = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const req = async (method, path, body, token) => {
    const r = await fetch(`${root}${path}`, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const adm = (method, path, body) => req(method, `/torneos/club/${club.id}${path}`, body, tkAdmin);
  const torneos = [];
  try {
    const ligaA = (await adm('POST', '/ligas', { nombre: 'Liga A' })).data;
    const ligaB = (await adm('POST', '/ligas', { nombre: 'Liga B' })).data;
    const base = { categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-20', fecha_fin: '2026-12-21', cupo_parejas: 16, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 };
    const franja = [{ fecha: null, desde: '09:00', hasta: '23:00' }];
    const jug = (n, dni) => ({ nombre: `Jugador ${n}`, dni: dni || String(37000000 + n + (s % 100000)), whatsapp: `5493816${String(n).padStart(6, '0')}`, email: dni ? `pj-${s}@test.local` : undefined, categoria: 5, genero: 'masculino' });
    for (const [nombre, liga] of [['Fecha Uno', ligaA], ['Fecha Dos', ligaA], ['Fecha Tres', ligaB]]) {
      const rt = await adm('POST', '/torneos', { ...base, nombre, liga_id: liga.id });
      if (rt.status !== 201 && rt.status !== 200) throw new Error(JSON.stringify(rt));
      const t = rt.data;
      torneos.push(t.id);
      await adm('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }] });
      await m.Torneo.update({ estado: 'inscripcion' }, { where: { id: t.id } });
    }
    const [T1, T2, T3] = torneos;
    // T1: el DNI juega (6 parejas → 2 zonas); T2 y T3: no juega
    for (let i = 0; i < 6; i++) await adm('POST', `/torneos/${T1}/parejas`, { jugadores: [jug(i * 2 + 1, i === 0 ? DNI : null), jug(i * 2 + 2)], horarios_preferidos: franja, pagado: true });
    for (let i = 0; i < 3; i++) await adm('POST', `/torneos/${T3}/parejas`, { jugadores: [jug(100 + i * 2), jug(101 + i * 2)], horarios_preferidos: franja, pagado: true });
    await adm('POST', `/torneos/${T1}/zonas/generar`, { notificar: false });

    const conteo = async () => (await m.sequelize.query(
      `SELECT (SELECT COUNT(*) FROM torneo_parejas WHERE torneo_id IN (:t)) p, (SELECT COUNT(*) FROM torneo_partidos WHERE torneo_id IN (:t)) pa,
              (SELECT COUNT(*) FROM torneo_resultados r JOIN torneo_partidos x ON x.id = r.partido_id WHERE x.torneo_id IN (:t)) r,
              (SELECT COUNT(*) FROM torneo_jugadores j JOIN torneo_parejas q ON q.id = j.pareja_id WHERE q.torneo_id IN (:t)) j,
              (SELECT GROUP_CONCAT(CONCAT(id, estado, IFNULL(fecha,''), IFNULL(hora,'')) ORDER BY id) FROM torneo_partidos WHERE torneo_id IN (:t)) h,
              (SELECT GROUP_CONCAT(estado ORDER BY id) FROM torneos WHERE id IN (:t)) e`,
      { replacements: { t: torneos }, type: m.sequelize.QueryTypes.SELECT }))[0];
    const antes = await conteo();

    // ── Login ──
    ok((await req('POST', '/player/auth/login', { dni: DNI, password: 'otra' })).status === 401, 'clave incorrecta → 401');
    ok((await req('POST', '/player/auth/login', { dni: '11111111', password: '11111111' })).status === 401, 'DNI que no juega torneos → 401');
    let lg = await req('POST', '/player/auth/login', { dni: DNI, password: DNI });
    ok(lg.status === 200 && lg.data.token && lg.data.must_change_password && lg.data.rol === 'ROLE_PLAYER', 'primer ingreso con DNI/DNI → token ROLE_PLAYER con cambio de clave obligatorio');
    let tk = lg.data.token;
    const d0 = await req('GET', '/player/dashboard', null, tk);
    ok(d0.status === 403 && d0.data.code === 'MUST_CHANGE_PASSWORD', 'sin cambiar la clave no puede ver nada (403 MUST_CHANGE_PASSWORD)');
    ok((await req('POST', '/player/auth/change-password', { actual: DNI, nueva: DNI }, tk)).status === 400, 'la nueva clave no puede ser el DNI');
    ok((await req('POST', '/player/auth/change-password', { actual: DNI, nueva: '123' }, tk)).status === 400, 'clave corta → 400');
    const cp = await req('POST', '/player/auth/change-password', { actual: DNI, nueva: 'clave-nueva-1' }, tk);
    ok(cp.status === 200 && cp.data.must_change_password === false, 'cambio de clave OK');
    ok((await req('POST', '/player/auth/login', { dni: DNI, password: DNI })).status === 401, 'después del cambio el DNI ya no sirve como clave');
    lg = await req('POST', '/player/auth/login', { dni: DNI, password: 'clave-nueva-1' });
    tk = lg.data.token;
    ok(lg.status === 200 && !lg.data.must_change_password, 'login con la clave nueva');

    // ── Índice ──
    const idx = await m.PlayerTournamentIndex.findAll({ where: { dni: DNI }, raw: true });
    ok(idx.length === 1 && idx[0].tournament_id === T1 && idx[0].league_id === ligaA.id && idx[0].season_id === 2026 && idx[0].player_id, 'player_tournament_index: DNI → T1 / liga A / temporada 2026 / jugador vinculado');

    // ── Lecturas ──
    const d = await req('GET', '/player/dashboard', null, tk);
    ok(d.status === 200 && d.data.jugador.dni === DNI && d.data.jugador.nombre === 'Jugador 1' && d.data.jugador.categoria === '5ta' && d.data.jugador.clubes.some(c => c.id === club.id), 'dashboard: nombre, DNI, categoría y club');
    ok(d.data.resumen.torneos_jugados === 1 && d.data.ligas.length === 1 && d.data.ligas[0].id === ligaA.id, 'dashboard: 1 torneo jugado, liga A');
    const ts = await req('GET', '/player/tournaments', null, tk);
    ok(ts.status === 200 && ts.data.total === 1 && ts.data.items[0].id === T1 && ts.data.items[0].participa, 'Mis Torneos: solo T1');
    const tsAll = await req('GET', '/player/tournaments?todos=1&limit=1', null, tk);
    ok(tsAll.data.total === 2 && tsAll.data.items.length === 1, 'con todos=1: T1 + T2 (misma liga), paginado');
    const t1 = await req('GET', `/player/tournament/${T1}`, null, tk);
    ok(t1.status === 200 && t1.data.zonas.length === 2 && t1.data.mi_pareja_id && t1.data.torneo.liga.id === ligaA.id, 'detalle T1: zonas, mi pareja y liga');
    ok(!JSON.stringify(t1.data).includes('5493816') && !JSON.stringify(t1.data).includes('37000'), 'el detalle no expone DNI ni WhatsApp de otros jugadores');
    ok((await req('GET', `/player/tournament/${T2}`, null, tk)).status === 200, 'T2 (misma liga, no juega) → visible');
    const t3 = await req('GET', `/player/tournament/${T3}`, null, tk);
    ok(t3.status === 403, 'T3 (otra liga) → 403');
    for (const sub of ['standings', 'groups', 'brackets', 'matches']) {
      ok((await req('GET', `/player/tournament/${T1}/${sub}`, null, tk)).status === 200 && (await req('GET', `/player/tournament/${T3}/${sub}`, null, tk)).status === 403, `/${sub}: 200 en T1, 403 en T3`);
    }
    const st = await req('GET', `/player/tournament/${T1}/standings`, null, tk);
    ok(Array.isArray(st.data) && st.data.length === 12, 'posiciones: 12 jugadores (incluye 0 puntos)');
    const mios = await req('GET', `/player/tournament/${T1}/matches?mios=1`, null, tk);
    ok(mios.data.partidos.length > 0 && mios.data.partidos.every(p => [p.pareja1?.id, p.pareja2?.id].includes(mios.data.mi_pareja_id)), 'partidos ?mios=1: solo los de su pareja');
    const br = await req('GET', `/player/tournament/${T1}/brackets`, null, tk);
    ok(br.status === 200 && br.data.llave_prevista?.rondas?.length, 'llaves: cuadro de referencia visible');
    const lgA = await req('GET', `/player/league/${ligaA.id}`, null, tk);
    ok(lgA.status === 200 && lgA.data.fechas.length === 2 && lgA.data.temporadas.includes(2026), 'liga A: sus 2 fechas y temporada 2026');
    ok((await req('GET', `/player/league/${ligaB.id}`, null, tk)).status === 403, 'liga B → 403');
    await m.Torneo.update({ estado: 'finalizado' }, { where: { id: T2 } });
    const hist = await req('GET', `/player/league/${ligaA.id}/history?temporada=2026`, null, tk);
    ok(hist.status === 200 && hist.data.total === 1 && hist.data.items[0].id === T2, 'historial de la liga: fechas finalizadas por temporada');
    await m.Torneo.update({ estado: 'inscripcion' }, { where: { id: T2 } });
    ok((await req('GET', `/player/league/${ligaA.id}/history?temporada=2020`, null, tk)).data.total === 0, 'historial de otra temporada: vacío');

    // ── Solo lectura ──
    let bloqueos = 0;
    for (const [mt, p] of [['POST', `/player/tournament/${T1}`], ['PUT', `/player/tournament/${T1}/matches`], ['DELETE', `/player/tournament/${T1}`], ['PATCH', '/player/dashboard'], ['POST', `/player/league/${ligaA.id}`], ['PUT', '/player/auth/login']]) {
      if ((await req(mt, p, { x: 1 }, tk)).status === 405) bloqueos++;
    }
    ok(bloqueos === 6, 'POST/PUT/PATCH/DELETE sobre el portal → 405 (6/6)');
    const staff = await Promise.all([
      req('GET', `/torneos/club/${club.id}/torneos`, null, tk),
      req('POST', `/torneos/club/${club.id}/torneos/${T1}/parejas`, { jugadores: [] }, tk),
      req('PUT', `/torneos/club/${club.id}/torneos/${T1}`, { nombre: 'hack' }, tk),
      req('GET', `/complexes/${club.id}`, null, tk),
      req('GET', '/profesores/me/complejos', null, tk),
    ]);
    ok(staff.every(r => [401, 403].includes(r.status)), `token de jugador rechazado en rutas de staff/admin/profesor (${staff.map(r => r.status).join(',')})`);
    ok((await req('GET', '/player/dashboard', null, tkAdmin)).status === 401, 'token de admin no sirve en el portal');
    const despues = await conteo();
    ok(JSON.stringify(antes) === JSON.stringify(despues), 'ningún dato de torneos cambió (parejas, partidos, resultados, jugadores, horarios, estados)');

    // ── Auditoría ──
    await new Promise(r => setTimeout(r, 300));
    const logs = await m.PlayerAccessLog.findAll({ where: { dni: DNI }, raw: true });
    const acc = (a) => logs.filter(l => l.accion === a).length;
    ok(acc('login_ok') >= 2 && acc('login_fail') >= 1 && acc('view') >= 10 && acc('denied') >= 4 && acc('write_blocked') >= 5 && acc('password_change') === 1, `auditoría: ${['login_ok', 'login_fail', 'view', 'denied', 'write_blocked'].map(a => `${a}=${acc(a)}`).join(' ')}`);

    // ── Push del dispositivo ──
    const sub = { endpoint: `https://push.test.local/${s}`, keys: { p256dh: 'BPx', auth: 'aa' } };
    ok((await req('GET', '/player/push/vapid-public-key')).status === 200, 'push: clave VAPID pública');
    ok((await req('POST', '/player/push/subscribe', { subscription: sub })).status === 401, 'push: suscribir sin sesión → 401');
    ok((await req('POST', '/player/push/subscribe', { subscription: { endpoint: 'x' } }, tk)).status === 400, 'push: suscripción inválida → 400');
    ok((await req('POST', '/player/push/subscribe', { subscription: sub }, tk)).status === 201 && (await req('POST', '/player/push/subscribe', { subscription: sub }, tk)).status === 201, 'push: suscripción guardada (idempotente)');
    ok(await m.PlayerPushSubscription.count({ where: { dni: DNI } }) === 1, 'push: 1 dispositivo por DNI');
    const notifier = require('../src/services/torneos/torneoNotifier');
    const parT1 = await m.TorneoPareja.findOne({ where: { torneo_id: T1 }, include: [{ model: m.TorneoJugador, as: 'jugadores' }] });
    let pushOk = true; try { await notifier.aPareja(club.id, parT1, 'Prueba *aviso*'); } catch { pushOk = false; }
    ok(pushOk, 'aviso de torneo a la pareja: también intenta push sin romper el envío');
    ok((await req('POST', '/player/push/unsubscribe', { endpoint: sub.endpoint }, tk)).status === 200 && await m.PlayerPushSubscription.count({ where: { dni: DNI } }) === 0, 'push: desuscribir');
    ok(JSON.stringify(antes) === JSON.stringify(await conteo()), 'push no modificó datos de torneos');

    // ── Recuperación ──
    ok((await req('POST', '/player/auth/forgot', { dni: DNI })).status === 200, 'forgot: respuesta genérica 200');
    ok((await req('POST', '/player/auth/forgot', { dni: '123' })).status === 200, 'forgot con DNI inexistente: misma respuesta (no revela)');
    const token = crypto.randomBytes(32).toString('hex');
    await m.PlayerAccess.update({ reset_token_hash: crypto.createHash('sha256').update(token).digest('hex'), reset_expira: new Date(Date.now() + 60000) }, { where: { dni: DNI } });
    ok((await req('POST', '/player/auth/reset', { token: 'x', nueva: 'abcdef1' })).status === 400, 'reset con token inválido → 400');
    ok((await req('POST', '/player/auth/reset', { token, nueva: 'recuperada-2' })).status === 200, 'reset con token válido → 200');
    ok((await req('POST', '/player/auth/reset', { token, nueva: 'otra-3' })).status === 400, 'el token es de un solo uso');
    ok((await req('POST', '/player/auth/login', { dni: DNI, password: 'recuperada-2' })).status === 200, 'login con la clave recuperada');

    // ── Bloqueo por intentos ──
    for (let i = 0; i < 5; i++) await req('POST', '/player/auth/login', { dni: DNI, password: 'mal' });
    ok((await req('POST', '/player/auth/login', { dni: DNI, password: 'recuperada-2' })).status === 429, '5 intentos fallidos → bloqueo temporal (429 aun con la clave correcta)');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of torneos) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.PlayerTournamentIndex.destroy({ where: { dni: DNI } });
    await m.PlayerAccessLog.destroy({ where: { dni: DNI } });
    await m.PlayerAccess.destroy({ where: { dni: DNI } });
    await m.PlayerPushSubscription.destroy({ where: { dni: DNI } });
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
