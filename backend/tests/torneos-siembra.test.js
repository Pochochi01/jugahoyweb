/**
 * tests/torneos-siembra.test.js — Siembra por ranking en serpiente (Snake Seeding).
 *
 *   npm run test:torneos:siembra
 *
 * Unitarias (fixtureService, sin BD): ejemplo exacto 12 parejas / 4 zonas, patrón general,
 * desempates, cabezas de serie, validaciones y rendimiento para 8…64 parejas.
 * Integración (HTTP, club TEMPORAL): vista previa → confirmación con firma, cambio de
 * inscripciones detectado, persistencia (siembra / cabeza de serie) y auditoría.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const fx = require('../src/services/torneos/fixtureService');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };
const ids = (z) => z.parejas.map(p => p.id);

function unitarias() {
  console.log('— Unitarias —');
  // Ejemplo del enunciado: 12 parejas (500…360 pts), 4 zonas
  const pts = [500, 480, 470, 450, 430, 420, 410, 400, 390, 380, 370, 360];
  const parejas = pts.map((p, i) => ({ id: i + 1, puntos_totales: p }));
  const zonas = fx.generateSnakeSeedingZones([...parejas].reverse(), { zonas: 4 });
  ok(zonas.map(z => z.zona).join(',') === 'Zona A,Zona B,Zona C,Zona D', '4 zonas A–D');
  ok(JSON.stringify(zonas.map(ids)) === JSON.stringify([[1, 8, 9], [2, 7, 10], [3, 6, 11], [4, 5, 12]]), 'ejemplo exacto: A{1,8,9} B{2,7,10} C{3,6,11} D{4,5,12}');
  ok(zonas.every((z, i) => z.parejas[0].cabeza_serie && z.parejas[0].siembra === i + 1 && z.parejas.filter(p => p.cabeza_serie).length === 1), 'un cabeza de serie por zona (siembras 1…N)');
  ok(zonas[0].parejas.map(p => p.numero_zona).join() === '1,2,3', 'numero_zona = orden de llegada a la zona');
  // Derivado de parejas por zona (12 / 3 = 4 zonas): mismo resultado
  ok(JSON.stringify(fx.generateSnakeSeedingZones(parejas, { parejasPorZona: 3 }).map(ids)) === JSON.stringify(zonas.map(ids)), 'parejasPorZona=3 → 4 zonas con el mismo reparto');

  // Patrón general para N zonas: rondas alternadas 1→N, N→1
  let patronOk = true;
  for (const N of [2, 3, 5, 6, 8]) for (const n of [N, N * 2, N * 3 + 1, N * 4]) {
    const zs = fx.generateSnakeSeedingZones(Array.from({ length: n }, (_, i) => ({ id: i + 1, puntos_totales: 1000 - i })), { zonas: N });
    for (let i = 0; i < n; i++) {
      const ronda = Math.floor(i / N), pos = i % N;
      const esperada = ronda % 2 === 0 ? pos : N - 1 - pos;
      if (!zs[esperada].parejas.some(p => p.siembra === i + 1)) patronOk = false;
    }
  }
  ok(patronOk, 'patrón serpiente correcto para 2–8 zonas y cantidades no múltiplos');

  // Desempates: puntos → títulos → finales → torneos disputados → inscripción → id
  const t0 = '2026-01-01T10:00:00Z', t1 = '2026-01-02T10:00:00Z';
  const empatadas = [
    { id: 10, puntos_totales: 100, titulos: 0, finales: 3, torneos_jugados: 9, inscripcion: t0 },
    { id: 11, puntos_totales: 100, titulos: 2, finales: 2, torneos_jugados: 2, inscripcion: t1 },
    { id: 12, puntos_totales: 100, titulos: 0, finales: 1, torneos_jugados: 5, inscripcion: t0 },
    { id: 13, puntos_totales: 100, titulos: 0, finales: 1, torneos_jugados: 4, inscripcion: t0 },
    { id: 16, puntos_totales: 100, titulos: 0, finales: 1, torneos_jugados: 4, inscripcion: t1 },
    { id: 9, puntos_totales: 100, titulos: 0, finales: 1, torneos_jugados: 4, inscripcion: t1 },
    { id: 14, puntos_totales: null },
    { id: 15, puntos_totales: 150 },
  ];
  const orden = fx.ordenarPorRanking(empatadas).map(p => p.id);
  ok(JSON.stringify(orden) === JSON.stringify([15, 11, 10, 12, 13, 9, 16, 14]), `desempate: puntos > títulos > finales > torneos > inscripción > id (${orden.join(',')})`);
  ok(fx.ordenarPorRanking([{ id: 1, puntos_totales: null }])[0].puntos_totales === 0, 'puntos nulos → 0 (COALESCE)');
  const a = fx.generateSnakeSeedingZones(empatadas, { zonas: 3 }).map(ids), b = fx.generateSnakeSeedingZones([...empatadas].reverse(), { zonas: 3 }).map(ids);
  ok(JSON.stringify(a) === JSON.stringify(b), 'determinista: mismo resultado sin importar el orden de entrada (sin azar)');

  // Validaciones
  let e = null; try { fx.generateSnakeSeedingZones([{ id: 1 }, { id: 2 }], { zonas: 3 }); } catch (x) { e = x; }
  ok(e?.status === 400 && /menos parejas/.test(e.message), 'menos parejas que zonas → 400');
  e = null; try { fx.generateSnakeSeedingZones([{ id: 1 }], { parejasPorZona: 3 }); } catch (x) { e = x; }
  ok(e?.status === 400, 'una sola pareja → 400');

  // Rendimiento y equilibrio: 8…64 parejas
  for (const n of [8, 16, 24, 32, 48, 64]) {
    const lista = Array.from({ length: n }, (_, i) => ({ id: i + 1, puntos_totales: Math.round(Math.random() * 500), torneos_jugados: i % 4, inscripcion: t0 }));
    const ini = process.hrtime.bigint();
    let zs; for (let r = 0; r < 100; r++) zs = fx.generateSnakeSeedingZones(lista, { parejasPorZona: 4 });
    const ms = Number(process.hrtime.bigint() - ini) / 1e6 / 100;
    const k = zs.length;
    const cabezas = zs.map(z => z.parejas[0].siembra).sort((x, y) => x - y);
    const tam = zs.map(z => z.parejas.length);
    const equilibrado = cabezas.every((s, i) => s === i + 1) && Math.max(...tam) - Math.min(...tam) <= 1 && zs.flatMap(z => z.parejas).length === n;
    ok(equilibrado && ms < 5, `${n} parejas → ${k} zonas equilibradas (${tam.join('/')}) en ${ms.toFixed(3)} ms`);
  }
}

async function integracion() {
  console.log('— Integración —');
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Siembra', email: `ts-${s}@test.local`, password: 'x', rol: 'general_admin', activo: true });
  const club = await m.Complex.create({ nombre: `TS TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const cancha = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Siembra' })).data;
    const t = (await call('POST', '/torneos', { nombre: 'Copa Siembra', liga_id: liga.id, categorias: [7], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-12', cupo_parejas: 32, parejas_por_zona: 3 })).data;
    torneoId = t.id;
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: cancha.id, disponibilidad_horaria: [{ fecha: null, desde: '08:00', hasta: '23:00' }] }] });
    const hor = [{ fecha: null, desde: '08:00', hasta: '23:00' }];
    const jug = (n) => ({ nombre: `Jugador ${n}`, dni: String(33000000 + n), whatsapp: `5493812${String(n).padStart(6, '0')}`, categoria: 7, genero: 'masculino' });
    // 12 parejas; puntos del ranking de la liga = 500, 480 … 360 repartidos entre los dos jugadores
    const pts = [500, 480, 470, 450, 430, 420, 410, 400, 390, 380, 370, 360];
    const parejaIds = [];
    for (let i = 0; i < 12; i++) {
      const r = await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(i * 2 + 1), jug(i * 2 + 2)], horarios_preferidos: hor, pagado: true });
      parejaIds.push(r.data.id);
    }
    // Puntos cargados en orden inverso a la inscripción (la pareja inscripta última es la mejor)
    for (let i = 0; i < 12; i++) {
      const p = pts[11 - i];
      for (const [k, v] of [[i * 2 + 1, Math.ceil(p / 2)], [i * 2 + 2, Math.floor(p / 2)]]) {
        await call('POST', '/ranking/ajustes', { dni: String(33000000 + k), nombre: `Jugador ${k}`, liga_id: liga.id, categoria_id: 7, genero: 'masculino', temporada: 2026, tipo: 'fijar', puntos: v, motivo: 'Carga de prueba' });
      }
    }
    const prev = await call('POST', `/torneos/${t.id}/zonas/preview`, {});
    ok(prev.status === 200 && prev.data.cantidad_zonas === 4 && prev.data.metodo === 'ranking_anual_snake' && prev.data.ranking?.liga_id, 'vista previa: 4 zonas por Ranking Anual + Snake Seeding');
    const puntosZona = prev.data.zonas.map(z => z.parejas.map(p => p.puntos_totales));
    ok(JSON.stringify(puntosZona) === JSON.stringify([[500, 400, 390], [480, 410, 380], [470, 420, 370], [450, 430, 360]]), 'vista previa con los puntos reales del ranking: A{500,400,390} B{480,410,380} C{470,420,370} D{450,430,360}');
    ok(prev.data.zonas.every(z => z.parejas[0].cabeza_serie && z.parejas[0].nombre && z.parejas[0].jugadores.length === 2), 'cabeza de serie, pareja y jugadores (con sus puntos) en la vista previa');
    ok((await call('GET', `/torneos/${t.id}/fixture`)).data.zonas.length === 0, 'la vista previa no guarda nada');

    // Se agrega una pareja después de la vista previa → la firma cambia
    await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(91), jug(92)], horarios_preferidos: hor, pagado: true });
    const viejo = await call('POST', `/torneos/${t.id}/zonas/generar`, { firma: prev.data.firma, notificar: false });
    ok(viejo.status === 409 && /vista previa/.test(viejo.data.message), 'inscripción nueva entre vista previa y confirmación → 409 (recalcular)');
    const prev2 = (await call('POST', `/torneos/${t.id}/zonas/preview`, {})).data;
    ok(prev2.parejas === 13 && prev2.firma !== prev.data.firma, 'la vista previa se recalcula con la pareja nueva');
    const conf = await call('POST', `/torneos/${t.id}/zonas/generar`, { firma: prev2.firma, notificar: false });
    ok(conf.status === 200 && conf.data.metodo === 'ranking_anual_snake' && conf.data.zonas === prev2.cantidad_zonas, 'confirmación con la firma vigente → zonas guardadas');
    const fx2 = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const guardado = fx2.zonas.map(z => z.tabla.map(r => r.pareja_id).sort((x, y) => x - y));
    const previsto = prev2.zonas.map(z => z.parejas.map(p => p.id).sort((x, y) => x - y));
    ok(JSON.stringify(guardado) === JSON.stringify(previsto), 'lo guardado coincide exactamente con la vista previa');
    ok(fx2.zonas.every(z => z.tabla.some(r => r.numero_zona === 1 && r.siembra >= 1 && r.siembra <= prev2.cantidad_zonas)), 'cada zona guarda su cabeza de serie con su siembra');
    const hist = await m.TorneoZonaHistorial.findAll({ where: { torneo_id: t.id } });
    ok(hist.length === 1 && hist[0].metodo === 'ranking_anual_snake' && hist[0].zonas === 4 && hist[0].parejas === 13 && hist[0].usuario_id === admin.id && hist[0].reparto.zonas.length === 4 && hist[0].reparto.ranking.temporada === 2026 && hist[0].reparto.zonas[0].parejas[0].jugadores.length === 2, 'auditoría: usuario, fecha, ranking usado, puntos de cada pareja y jugador, método');
    ok((await call('GET', `/torneos/${t.id}/zonas/historial`)).data.length === 1, 'historial de armados consultable');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.RankingAjuste.destroy({ where: { id_tenant: club.id } });
    await m.RankingPunto.destroy({ where: { id_tenant: club.id } });
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } });
    await m.TimeSlot.destroy({ where: { field_id: cancha.id } });
    await cancha.destroy();
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] });
    await admin.destroy();
    server.close();
    await m.sequelize.close();
  }
}

(async () => {
  unitarias();
  if (process.argv.includes('--solo-unitarias')) { console.log(`\n${total - fallas}/${total} OK`); process.exit(fallas ? 1 : 0); }
  await integracion();
  console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
  process.exit(fallas ? 1 : 0);
})();
