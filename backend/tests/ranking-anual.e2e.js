/**
 * tests/ranking-anual.e2e.js — Ranking anual configurable de ligas de pádel.
 *
 *   npm run test:ranking
 *
 * Club TEMPORAL: configuración de puntos por temporada + categoría, acumulación automática al
 * finalizar (idempotente), tabla general con todos los jugadores (0 si nunca jugaron) y
 * estadísticas, ajuste manual que sobrevive al recálculo, recálculo global con progreso,
 * temporadas independientes, siembra desde el ranking y permisos (solo Administrador General).
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const m = require('../src/models');
const anual = require('../src/services/torneos/rankingAnualService');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const owner = await m.User.create({ nombre: 'Dueño', apellido: 'Club', email: `ra-o-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const ag = await m.User.create({ nombre: 'Admin', apellido: 'General', email: `ra-g-${s}@test.local`, password: 'x', rol: 'general_admin', activo: true });
  const club = await m.Complex.create({ nombre: `RA TEST ${s}`, direccion: 'x', owner_id: owner.id, activo: true });
  const cancha = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tk = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body, user = ag) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const torneos = [];
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Anual' })).data;
    // ── Configuración ──
    const cfg0 = (await call('GET', '/ranking/configuracion?temporada=2026')).data;
    const c7 = cfg0.categorias.find(c => c.categoria_id === 7);
    ok(cfg0.categorias.length === 8 && c7.puntos.campeon === 100 && c7.puntos.zona === 10 && '16avos' in c7.puntos, 'temporada 2026 creada con configuración por defecto para las 8 categorías');
    const nuevos = { zona: 10, '16avos': 20, octavos: 40, cuartos: 80, semifinal: 120, final: 180, campeon: 250 };
    ok((await call('PUT', '/ranking/configuracion/2026/7', { puntos: nuevos }, owner)).status === 403, 'dueño del club (no Admin General) no puede editar puntajes → 403');
    ok((await call('PUT', '/ranking/configuracion/2026/7', { puntos: { campeon: -1 } })).status === 400, 'puntaje negativo → 400');
    ok((await call('PUT', '/ranking/configuracion/2026/7', { puntos: { final: 1.5 } })).status === 400, 'puntaje decimal → 400');
    const cfg1 = (await call('PUT', '/ranking/configuracion/2026/7', { puntos: nuevos })).data;
    ok(JSON.stringify(cfg1.categorias.find(c => c.categoria_id === 7).puntos) === JSON.stringify(nuevos), '7ma 2026: puntajes editables guardados en BD');
    ok(cfg1.categorias.find(c => c.categoria_id === 6).puntos.campeon === 100, 'cada categoría tiene su configuración propia (6ta sin cambios)');

    // ── Torneo anual: jugar hasta la final ──
    const t = (await call('POST', '/torneos', { nombre: 'Anual RA', liga_id: liga.id, categorias: [7], genero: 'masculino', tipo: 'anual', fecha_inicio: '2026-11-20', fecha_fin: '2026-11-21', cupo_parejas: 16 })).data;
    torneos.push(t.id);
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: cancha.id, disponibilidad_horaria: [{ fecha: null, desde: '08:00', hasta: '23:00' }] }] });
    const jug = (n) => ({ nombre: `Jugador ${n}`, dni: String(34000000 + n), whatsapp: `5493813${String(n).padStart(6, '0')}`, categoria: 7, genero: 'masculino' });
    const hor = [{ fecha: null, desde: '08:00', hasta: '23:00' }];
    for (const [a, b] of [[1, 2], [3, 4]]) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(a), jug(b)], horarios_preferidos: hor, pagado: true });
    // Jugador registrado en la categoría que nunca jugó
    const nunca = await m.PadelJugador.create({ id_tenant: club.id, dni: '34000099', nombre: 'Zeta Sin Torneos', categoria_actual: 7, genero: 'masculino' });
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    for (let v = 0; v < 4; v++) {
      const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
      const pend = [...fx.zonas.flatMap(z => z.partidos), ...fx.llave.flatMap(r => r.partidos)].filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id);
      if (!pend.length) break;
      for (const p of pend) await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: [[6, 3], [6, 4]] });
    }
    const q = `liga_id=${liga.id}&categoria_id=7&temporada=2026&genero=masculino`;
    let rk = (await call('GET', `/ranking?${q}`, null, owner)).data;
    const campeon = rk.jugadores[0], finalista = rk.jugadores[2];
    ok(rk.jugadores.length === 5, 'tabla general: los 4 que jugaron + el registrado que nunca jugó');
    ok(campeon.puntos === 250 && rk.jugadores[1].puntos === 250 && finalista.puntos === 180, 'puntos según la configuración vigente: campeón 250, finalista 180');
    ok(campeon.torneos_jugados === 1 && campeon.campeonatos === 1 && campeon.finales === 1 && campeon.semifinales === 1 && campeon.ultimo_torneo?.nombre === 'Anual RA', 'estadísticas: torneos, campeonatos, finales, semifinales y último torneo');
    ok(finalista.campeonatos === 0 && finalista.finales === 1, 'finalista: 1 final disputada, 0 títulos');
    const z = rk.jugadores.find(j => j.nombre === 'Zeta Sin Torneos');
    ok(z && z.puntos === 0 && z.torneos_jugados === 0 && z.campeonatos === 0 && z.finales === 0 && z.semifinales === 0 && z.ultimo_torneo === null && z.posicion === 5, 'jugador que nunca jugó: aparece con 0 en todo');
    ok(rk.jugadores.every(j => j.club === club.nombre && j.categoria === '7ma'), 'columnas club y categoría');

    // ── Idempotencia ──
    const tc = await m.TorneoCategoria.findOne({ where: { torneo_id: t.id, categoria_id: 7 } });
    const tor = await m.Torneo.findByPk(t.id);
    const re = await m.sequelize.transaction(tx => anual.applyTournamentPoints(tor, tc, tx));
    ok(re.ya_procesado && (await m.RankingResultado.count({ where: { torneo_id: t.id } })) === 4, 'torneo ya procesado: no vuelve a sumar (control de integridad)');
    ok((await call('GET', `/ranking?${q}`)).data.jugadores[0].puntos === 250, 'el puntaje no se duplicó');

    // ── Ajuste manual (solo Admin General) ──
    const body = { jugador_id: campeon.jugador_id, liga_id: liga.id, categoria_id: 7, genero: 'masculino', temporada: 2026, tipo: 'sumar', puntos: 20, motivo: 'Bonus por fair play' };
    ok((await call('POST', '/ranking/ajustes', body, owner)).status === 403, 'ajuste manual por el dueño del club → 403');
    const aj = await call('POST', '/ranking/ajustes', body);
    ok(aj.status === 201 && aj.data.nuevo === 270, 'Admin General suma 20 → 270');

    // ── Cambio de configuración + recálculo global ──
    await call('PUT', '/ranking/configuracion/2026/7', { puntos: { campeon: 300 } });
    ok((await call('GET', `/ranking?${q}`)).data.jugadores[0].puntos === 270, 'cambiar la configuración no altera puntos ya asignados hasta recalcular');
    ok((await call('POST', '/ranking/recalcular', { temporada: 2026 }, owner)).status === 403, 'recalcular por el dueño del club → 403');
    const job = await call('POST', '/ranking/recalcular', { temporada: 2026 });
    ok(job.status === 202 && job.data.id, 'recálculo iniciado en segundo plano');
    let estado;
    for (let i = 0; i < 40; i++) { estado = (await call('GET', `/ranking/recalcular/${job.data.id}`)).data; if (estado.estado !== 'en_curso') break; await esperar(150); }
    ok(estado.estado === 'completado' && estado.porcentaje === 100 && estado.total === 1 && estado.procesados === 1, `progreso: ${estado.procesados}/${estado.total} (${estado.porcentaje}%)`);
    rk = (await call('GET', `/ranking?${q}`)).data;
    const c2 = rk.jugadores.find(j => j.jugador_id === campeon.jugador_id);
    ok(c2.puntos === 320 && c2.puntos_torneos === 300 && c2.ajuste_manual === 20, 'recálculo: 300 del torneo + 20 manuales (el ajuste manual se conserva)');
    ok(rk.jugadores.find(j => j.jugador_id === finalista.jugador_id).puntos === 180, 'finalista sin cambios (180)');
    const hist = (await call('GET', `/ranking/ajustes?jugador_id=${campeon.jugador_id}`)).data;
    ok(['torneo', 'sumar', 'recalculo'].every(tp => hist.some(h => h.tipo === tp)) && hist.every(h => h.usuario), 'historial del jugador: torneo, ajuste manual y recálculo, con usuario');
    ok((await call('GET', `/ranking/ajustes?jugador_id=${campeon.jugador_id}`, null, owner)).status === 403, 'auditoría: solo Admin General');

    // ── Temporadas independientes ──
    const t27 = await call('POST', '/ranking/temporadas', { anio: 2027 });
    ok(t27.status === 201, 'temporada 2027 creada');
    const cfg27 = (await call('GET', '/ranking/configuracion?temporada=2027')).data;
    ok(cfg27.categorias.find(c => c.categoria_id === 7).puntos.campeon === 300, '2027 hereda la configuración de 2026 y se edita por separado');
    await call('PUT', '/ranking/configuracion/2027/7', { puntos: { campeon: 500 } });
    ok((await call('GET', '/ranking/configuracion?temporada=2026')).data.categorias.find(c => c.categoria_id === 7).puntos.campeon === 300, 'editar 2027 no toca 2026');
    const r27 = (await call('GET', `/ranking?liga_id=${liga.id}&categoria_id=7&temporada=2027&genero=masculino`)).data;
    ok(r27.jugadores.length >= 5 && r27.jugadores.every(j => j.puntos === 0), '2027: ranking independiente (todos en 0, no se arrastran puntos)');
    ok((await call('POST', '/ranking/temporadas', { anio: 2027 })).status === 409, 'temporada duplicada → 409');

    // ── Siembra con el ranking anual ──
    const t2 = (await call('POST', '/torneos', { nombre: 'Anual RA 2', liga_id: liga.id, categorias: [7], genero: 'masculino', tipo: 'anual', fecha_inicio: '2026-12-05', fecha_fin: '2026-12-06', cupo_parejas: 16 })).data;
    torneos.push(t2.id);
    await call('PUT', `/torneos/${t2.id}/canchas`, { canchas: [{ field_id: cancha.id, disponibilidad_horaria: [{ fecha: null, desde: '08:00', hasta: '23:00' }] }] });
    // Parejas mezcladas: (finalista + nuevo) se inscribe primero; (campeón + nuevo) después
    const camp = await m.PadelJugador.findByPk(campeon.jugador_id), fin = await m.PadelJugador.findByPk(finalista.jugador_id);
    const deReg = (r) => ({ nombre: r.nombre, dni: r.dni, whatsapp: '5493819999999', categoria: 7, genero: 'masculino' });
    await call('POST', `/torneos/${t2.id}/parejas`, { jugadores: [deReg(fin), jug(11)], horarios_preferidos: hor, pagado: true });
    await call('POST', `/torneos/${t2.id}/parejas`, { jugadores: [deReg(camp), jug(12)], horarios_preferidos: hor, pagado: true });
    await call('POST', `/torneos/${t2.id}/parejas`, { jugadores: [jug(13), jug(14)], horarios_preferidos: hor, pagado: true });
    await call('POST', `/torneos/${t2.id}/parejas`, { jugadores: [jug(15), jug(16)], horarios_preferidos: hor, pagado: true });
    const prev = (await call('POST', `/torneos/${t2.id}/zonas/preview`, {})).data;
    const top = prev.zonas.flatMap(zz => zz.parejas).sort((a, b) => a.siembra - b.siembra);
    ok(top[0].puntos_totales === 320 && top[1].puntos_totales === 180 && top[2].puntos_totales === 0, 'siembra: pareja = suma del ranking anual de sus jugadores (320, 180, 0, 0)');
    ok(top[0].jugadores.some(j => j.puntos === 320) && top[0].jugadores.some(j => j.puntos === 0), 'vista previa: puntos de cada integrante (COALESCE 0)');
    ok(prev.metodo === 'ranking_anual_snake' && prev.ranking.temporada === 2026 && prev.ranking.liga_id === liga.id, 'método: Ranking Anual + Snake Seeding (liga y temporada usadas)');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of torneos) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.RankingResultado.destroy({ where: { id_tenant: club.id } });
    await m.RankingAjuste.destroy({ where: { id_tenant: club.id } });
    await m.RankingPunto.destroy({ where: { id_tenant: club.id } });
    await m.RankingTemporada.destroy({ where: { id_tenant: club.id } });
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } });
    await m.TimeSlot.destroy({ where: { field_id: cancha.id } });
    await cancha.destroy();
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] });
    await m.User.destroy({ where: { id: [owner.id, ag.id] } });
    server.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    await m.sequelize.close();
    process.exit(fallas ? 1 : 0);
  }
})();
