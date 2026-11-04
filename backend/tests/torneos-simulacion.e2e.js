/**
 * tests/torneos-simulacion.e2e.js — Simulación de horarios de la llave (todas las categorías).
 *
 *   npm run test:torneos:simulacion
 *
 * Club TEMPORAL: torneo de 3 días con 2 categorías que comparten 2 canchas. Verifica que al
 * cargar el inicio de la llave se simulan los horarios con la disponibilidad real, que las
 * categorías no se pisan, que semis y final van por defecto al último día y que se pueden
 * cambiar; y que la llave real respeta esa configuración.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const m = require('../src/models');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };
const cuando = (p) => `${p.fecha} ${p.hora}`;

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Simulación', email: `tsim-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `TSIM TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const c2 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 2', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Simulación' })).data;
    const t = (await call('POST', '/torneos', { nombre: 'Copa Simulación', liga_id: liga.id, categorias: [5, 4], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-19', fecha_fin: '2026-12-21', cupo_parejas: 32, parejas_por_zona: 2, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneoId = t.id;
    const franja = [{ fecha: null, desde: '09:00', hasta: '23:00' }];
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }, { field_id: c2.id, disponibilidad_horaria: franja }] });
    let n = 0;
    const jug = (cat) => { n++; return { nombre: `Jugador ${n}`, dni: String(37000000 + n), whatsapp: `5493816${String(n).padStart(6, '0')}`, categoria: cat, genero: 'masculino' }; };
    for (let i = 0; i < 8; i++) await call('POST', `/torneos/${t.id}/parejas`, { categoria_id: 5, jugadores: [jug(5), jug(5)], horarios_preferidos: franja, pagado: true });
    for (let i = 0; i < 4; i++) await call('POST', `/torneos/${t.id}/parejas`, { categoria_id: 4, jugadores: [jug(4), jug(4)], horarios_preferidos: franja, pagado: true });

    // Sin inicio ni zonas: referencia sin horarios
    let f5 = (await call('GET', `/torneos/${t.id}/fixture?categoria_id=5`)).data;
    ok(f5.llave_prevista && !f5.llave_prevista.simulada && f5.llave_prevista.ronda === 'cuartos', 'sin inicio configurado: llave de referencia sin simular (5ta empieza en cuartos)');

    // ── Inicio de la llave en ambas categorías → simulación ──
    await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { fecha: '2026-12-19', hora: '10:00' });
    await call('PUT', `/torneos/${t.id}/categorias/4/llave-inicio`, { fecha: '2026-12-19', hora: '10:00' });
    f5 = (await call('GET', `/torneos/${t.id}/fixture?categoria_id=5`)).data;
    const f4 = (await call('GET', `/torneos/${t.id}/fixture?categoria_id=4`)).data;
    const pv5 = f5.llave_prevista, pv4 = f4.llave_prevista;
    const ronda = (pv, r) => pv.rondas.find(x => x.ronda === r).partidos.filter(p => !p.es_bye);
    ok(pv5.simulada && ronda(pv5, 'cuartos').every(p => p.fecha && cuando(p) >= '2026-12-19 10:00'), 'cuartos simulados desde el inicio (19/12 10:00)');
    ok(ronda(pv5, 'semifinal').every(p => p.fecha === '2026-12-21') && ronda(pv5, 'final').every(p => p.fecha === '2026-12-21'), 'por defecto semifinales y final el último día (21/12)');
    ok(ronda(pv5, 'final')[0].hora > ronda(pv5, 'semifinal')[0].hora, 'la final después de las semifinales');
    ok(pv4.simulada && pv4.ronda === 'semifinal' && ronda(pv4, 'semifinal').every(p => p.fecha === '2026-12-21'), '4ta (2 zonas) empieza en semis y también el último día');
    const todos = [...pv5.rondas, ...pv4.rondas].flatMap(r => r.partidos).filter(p => p.fecha);
    const claves = todos.map(p => `${p.field_id}|${p.fecha}|${p.hora}`);
    ok(new Set(claves).size === claves.length, 'las dos categorías no se pisan: ningún partido simulado en la misma cancha y horario');
    ok(todos.every(p => p.cancha), 'cada partido simulado trae su cancha');

    // ── Semis y final editables ──
    ok((await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { semis_fecha: '2026-12-21', semis_hora: '20:00', final_fecha: '2026-12-21', final_hora: '18:00' })).status === 400, 'final antes que las semis → 400');
    const cfg = await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { semis_fecha: '2026-12-20', semis_hora: '15:00', final_fecha: '2026-12-21', final_hora: '20:00' });
    ok(cfg.status === 200 && cfg.data.semis_fecha === '2026-12-20' && cfg.data.final_hora === '20:00' && cfg.data.llave_inicio_fecha === '2026-12-19', 'semis y final configuradas sin perder el inicio de la llave');
    f5 = (await call('GET', `/torneos/${t.id}/fixture?categoria_id=5`)).data;
    ok(ronda(f5.llave_prevista, 'semifinal').every(p => cuando(p) >= '2026-12-20 15:00' && p.fecha === '2026-12-20'), 'semis simuladas el 20/12 desde las 15:00');
    ok(ronda(f5.llave_prevista, 'final')[0].fecha === '2026-12-21' && ronda(f5.llave_prevista, 'final')[0].hora >= '20:00', 'final simulada el 21/12 desde las 20:00');

    // ── Llave real de 5ta con la configuración ──
    await call('POST', `/torneos/${t.id}/zonas/generar`, { categoria_id: 5, notificar: false });
    for (let v = 0; v < 4; v++) {
      const fz = (await call('GET', `/torneos/${t.id}/fixture?categoria_id=5`)).data;
      const pend = fz.zonas.flatMap(z => z.partidos).filter(p => !p.resultado && p.pareja1?.id && p.pareja2?.id);
      if (!pend.length) break;
      for (const p of pend) await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: [[6, 2], [6, 2]] });
    }
    const real = (await call('GET', `/torneos/${t.id}/fixture?categoria_id=5`)).data;
    const rr = (r) => real.llave.find(x => x.ronda === r)?.partidos || [];
    ok(rr('cuartos').length === 4 && rr('cuartos').every(p => cuando(p) >= '2026-12-19 10:00'), 'llave real: cuartos desde el inicio configurado');
    ok(rr('semifinal').every(p => p.fecha === '2026-12-20' && p.hora >= '15:00') && rr('final')[0].fecha === '2026-12-21' && rr('final')[0].hora >= '20:00', 'llave real: semis y final en el día y horario configurados');
    // Siguen siendo modificables partido por partido
    const sf = rr('semifinal')[0];
    const rep = await call('PUT', `/torneos/${t.id}/partidos/${sf.id}/programacion`, { field_id: c1.id, fecha: '2026-12-21', hora: '11:00', motivo: 'Cambio de día', notificar: false });
    ok(rep.status === 200 && rep.data.partido.fecha === '2026-12-21', 'la semifinal se puede reprogramar a otro día y horario');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } });
    await m.TimeSlot.destroy({ where: { field_id: [c1.id, c2.id] } });
    await m.Field.destroy({ where: { id: [c1.id, c2.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] });
    await admin.destroy();
    server.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    await m.sequelize.close();
    process.exit(fallas ? 1 : 0);
  }
})();
