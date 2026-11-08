/**
 * tests/resultados-carga.e2e.js — Carga de resultados por la API real (club TEMPORAL).
 *
 *   npm run test:resultados:e2e
 *
 * Ningún resultado inválido se guarda por API (10, 6.5, "abc", -1, 7-4, 6-5, 6-6, 7-6 sin tie-break,
 * tie-break > 99…); W.O. se guarda 6-0 6-0 con marca y auditoría (usuario y fecha); la tabla de la
 * zona se recalcula (PJ, sets y games); el perdedor por W.O. no suma puntos; corrección y borrado.
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
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Carla', apellido: 'Carga', email: `rc-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `RC TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Resultados' })).data;
    const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
    const t = (await call('POST', '/torneos', { nombre: 'Copa Resultados', liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-11', cupo_parejas: 8, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneoId = t.id;
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }] });
    let n = 0;
    const jug = () => { n++; return { nombre: `Jugador${n} Resultado`, dni: String(47000000 + (s % 10000) * 100 + n), whatsapp: `54938150${String(n).padStart(5, '0')}`, categoria: 5, genero: 'masculino' }; };
    for (let i = 0; i < 6; i++) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(), jug()], horarios_preferidos: franja, pagado: true });
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    let fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const zona = fx.zonas[0];
    const [p1, p2, p3] = zona.partidos;
    const put = (p, body) => call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, body);

    // ── Rechazos por API ──
    const invalidos = [
      [{ sets: [[10, 2], [6, 0]] }, '10 games'], [{ sets: [[6.5, 3], [6, 0]] }, 'decimal'], [{ sets: [['abc', 3], [6, 0]] }, 'texto'],
      [{ sets: [[-1, 6], [6, 0]] }, 'negativo'], [{ sets: [[7, 4], [6, 0]] }, '7-4'], [{ sets: [[6, 5], [6, 0]] }, '6-5'],
      [{ sets: [[6, 6], [6, 0]] }, '6-6'], [{ sets: [[4, 2], [6, 0]] }, '4-2'], [{ sets: [[7, 6], [6, 0]] }, '7-6 sin tie-break'],
      [{ sets: [[7, 6], [6, 0]], tie_breaks: [[100, 98], null] }, 'tie-break > 99'], [{ sets: [[7, 6], [6, 0]], tie_breaks: [[7, 6], null] }, 'tie-break 7-6'],
      [{ sets: [['', 3], [6, 0]] }, 'vacío'], [{ sets: [[6, 4]] }, 'un set'], [{ sets: [[6, 4], [3, 6]] }, '1 set a 1 sin 3º'],
      [{ walkover_ganador: 3 }, 'W.O. ganador 3'], [{ walkover_ganador: 1, sets: [[6, 0], [6, 0]] }, 'W.O. con sets'],
    ];
    const rechazados = [];
    for (const [body, nombre] of invalidos) if ((await put(p1, body)).status !== 400) rechazados.push(nombre);
    ok(!rechazados.length, `todos los resultados inválidos → 400 (${invalidos.length} casos)${rechazados.length ? ` · aceptó: ${rechazados.join(', ')}` : ''}`);
    ok(!(await m.TorneoResultado.count({ where: { partido_id: p1.id } })), 'ningún resultado inválido quedó guardado');

    // ── Resultado válido con tie-break y 3er set ──
    const r1 = await put(p1, { sets: [[7, 6], [3, 6], [6, 4]], tie_breaks: [[7, 4], null, null] });
    ok(r1.status === 200, 'resultado 7-6 (7-4) / 3-6 / 6-4 guardado');
    const res1 = await m.TorneoResultado.findOne({ where: { partido_id: p1.id } });
    ok(res1.is_walkover === false && res1.cargado_por === 'Carla Carga' && res1.cargado_at && JSON.stringify(res1.sets) === '[[7,6],[3,6],[6,4]]', 'auditoría: quién cargó y cuándo');

    // ── W.O. ──
    const r2 = await put(p2, { walkover_ganador: 2 });
    ok(r2.status === 200, 'W.O. gana la pareja B');
    const res2 = await m.TorneoResultado.findOne({ where: { partido_id: p2.id } });
    const part2 = await m.TorneoPartido.findByPk(p2.id);
    ok(res2.is_walkover === true && JSON.stringify(res2.sets) === '[[0,6],[0,6]]' && res2.ganador_id === p2.pareja2.id && part2.estado === 'walkover', 'W.O. guardado 0-6 0-6 con marca is_walkover y estado walkover');
    ok(res2.cargado_por === 'Carla Carga' && res2.cargado_at, 'W.O.: fecha y usuario registrados');

    // ── Tabla de la zona recalculada ──
    fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const tabla = fx.zonas[0].tabla;
    const fila = (id) => tabla.find(r => r.pareja_id === id);
    const g1 = fila(p1.pareja1.id), l1 = fila(p1.pareja2.id);
    const gw = fila(p2.pareja2.id), lw = fila(p2.pareja1.id);
    const sumar = (ids, k) => ids.reduce((a, id) => a + (fila(id)?.[k] || 0), 0);
    ok(g1.pj >= 1 && sumar([p1.pareja1.id], 'sf') >= 2 && sumar([p1.pareja2.id], 'sc') >= 2, 'partido jugado: PJ y sets a favor / en contra actualizados');
    const ganadorWO = (await call('GET', `/torneos/${t.id}/fixture`)).data.zonas[0].partidos.find(x => x.id === p2.id);
    ok(ganadorWO.resultado.is_walkover && ganadorWO.estado === 'walkover', 'el fixture informa is_walkover (insignia W.O. en los listados)');
    ok(gw.gf >= 12 && lw.gc >= 12, 'W.O. suma 2 sets y 12 games al ganador');
    // Puntos: victoria 2, derrota 1, perder por W.O. 0
    const puntosEsperados = new Map();
    const sumarPts = (id, pts) => puntosEsperados.set(id, (puntosEsperados.get(id) || 0) + pts);
    sumarPts(p1.pareja1.id, 2); sumarPts(p1.pareja2.id, 1); sumarPts(p2.pareja2.id, 2); sumarPts(p2.pareja1.id, 0);
    ok([...puntosEsperados].every(([id, pts]) => fila(id).puntos === pts), `puntos: victoria 2, derrota 1, derrota por W.O. 0 (${[...puntosEsperados].map(([id]) => fila(id).puntos).join('/')})`);
    ok(g1 && l1, 'posiciones recalculadas');

    // ── Corrección: el W.O. pasa a resultado jugado ──
    const r3 = await put(p2, { sets: [[6, 2], [6, 3]] });
    const res3 = await m.TorneoResultado.findOne({ where: { partido_id: p2.id } });
    ok(r3.status === 200 && res3.is_walkover === false && (await m.TorneoPartido.findByPk(p2.id)).estado === 'jugado', 'corregir un W.O. por un resultado jugado quita la marca');
    // ── Borrado ──
    ok((await call('DELETE', `/torneos/${t.id}/partidos/${p3.id}/resultado`)).status !== 500, 'borrar sin resultado no rompe');
    await put(p3, { walkover_ganador: 1 });
    ok((await call('DELETE', `/torneos/${t.id}/partidos/${p3.id}/resultado`)).status === 200 && !(await m.TorneoResultado.count({ where: { partido_id: p3.id } })), 'borrar un W.O.');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
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
