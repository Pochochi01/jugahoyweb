/**
 * tests/torneos-llave.e2e.js — Llave de referencia por zonas e inicio configurable.
 *
 *   npm run test:torneos:llave
 *
 * Unitarias: cruces fijos por zona/posición ("1° Zona A vs 2° Zona D"), ronda inicial.
 * Integración (club TEMPORAL): 12 parejas → 4 zonas → cuartos; llave prevista antes y
 * después de armar zonas; día y hora de inicio de la llave; al terminar las zonas la llave
 * real coincide con la referencia y reemplaza cada lugar por la pareja que quedó.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const fx = require('../src/services/torneos/fixtureService');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

function unitarias() {
  console.log('— Unitarias —');
  const et = (c) => (id) => c.plazas.find(p => p.key === id)?.etiqueta || 'BYE';
  const c4 = fx.armarLlavePorZonas(4, 2);
  const cruces = c4.rondas[0].partidos.map(p => `${et(c4)(p.pareja1_id)} v ${et(c4)(p.pareja2_id)}`);
  ok(c4.rondas[0].ronda === 'cuartos' && cruces.join(' | ') === '1° Zona A v 2° Zona D | 1° Zona D v 2° Zona A | 1° Zona B v 2° Zona C | 1° Zona C v 2° Zona B', `4 zonas × 2 → cuartos: ${cruces.join(' | ')}`);
  ok(fx.rondaInicial(4, 2).ronda === 'cuartos' && fx.rondaInicial(2, 2).ronda === 'semifinal' && fx.rondaInicial(6, 2).ronda === 'octavos' && fx.rondaInicial(1, 2).ronda === 'final', 'ronda inicial según zonas y clasificados');
  let mismaZona = false;
  for (const [z, k] of [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [8, 2], [3, 3]]) {
    const c = fx.armarLlavePorZonas(z, k);
    for (const p of c.rondas[0].partidos) {
      const a = c.plazas.find(x => x.key === p.pareja1_id), b = c.plazas.find(x => x.key === p.pareja2_id);
      if (a && b && a.zona_idx === b.zona_idx) mismaZona = true;
    }
  }
  ok(!mismaZona, 'ninguna llave cruza en primera ronda a dos parejas de la misma zona (2–8 zonas)');
  const c3 = fx.armarLlavePorZonas(3, 2);
  ok(c3.rondas[0].partidos.filter(p => p.es_bye).length === 2 && c3.rondas[0].partidos.filter(p => p.es_bye).every(p => c3.plazas.find(x => x.key === (p.pareja1_id || p.pareja2_id))?.posicion === 1), '3 zonas × 2 → 2 BYES para los primeros de zona');
}

async function integracion() {
  console.log('— Integración —');
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Llave', email: `tll-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `TLL TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const c2 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 2', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Llave' })).data;
    const t = (await call('POST', '/torneos', { nombre: 'Copa Llave', liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-20', fecha_fin: '2026-12-21', cupo_parejas: 16, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneoId = t.id;
    const franja = [{ fecha: null, desde: '09:00', hasta: '23:00' }];
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }, { field_id: c2.id, disponibilidad_horaria: franja }] });
    const jug = (n) => ({ nombre: `Jugador ${n}`, dni: String(36000000 + n), whatsapp: `5493815${String(n).padStart(6, '0')}`, categoria: 5, genero: 'masculino' });
    for (let i = 0; i < 12; i++) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(i * 2 + 1), jug(i * 2 + 2)], horarios_preferidos: franja, pagado: true });

    // ── Llave de referencia antes de armar zonas ──
    let fx0 = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const prev0 = fx0.llave_prevista;
    ok(prev0 && prev0.estimada && prev0.zonas === 4 && prev0.ronda === 'cuartos' && prev0.clasificados === 8, '12 parejas inscriptas → 4 zonas estimadas → la llave empieza en cuartos');
    ok(prev0.rondas[0].partidos[0].pareja1.nombre === '1° Zona A' && prev0.rondas[0].partidos[0].pareja2.nombre === '2° Zona D', 'referencia: "1° Zona A vs 2° Zona D"');
    ok(prev0.rondas[1].partidos[0].pareja1.nombre === 'Ganador Cuartos 1' && prev0.rondas.at(-1).ronda === 'final', 'rondas siguientes: "Ganador Cuartos 1" … final');

    // ── Inicio de la llave ──
    ok((await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { fecha: '2026-12-25', hora: '16:00' })).status === 400, 'inicio fuera del torneo → 400');
    ok((await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { fecha: '2026-12-21', hora: '25:00' })).status === 400, 'hora inválida → 400');
    const ini = await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { fecha: '2026-12-21', hora: '18:00' });
    ok(ini.status === 200 && ini.data.llave_inicio_hora === '18:00', 'inicio de la llave guardado: 21/12 18:00');

    // ── Zonas → referencia con zonas reales ──
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    fx0 = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    ok(!fx0.llave_prevista.estimada && fx0.llave_prevista.zonas === 4 && fx0.categorias[0].llave_inicio_fecha === '2026-12-21', 'con zonas armadas la referencia usa las zonas reales e informa el inicio');
    // Jugar las zonas: siempre gana la pareja 1 del partido
    for (let v = 0; v < 6; v++) {
      const f = (await call('GET', `/torneos/${t.id}/fixture`)).data;
      const pend = f.zonas.flatMap(z => z.partidos).filter(p => !p.resultado && p.pareja1?.id && p.pareja2?.id);
      if (!pend.length) break;
      for (const p of pend) await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: [[6, 3], [6, 4]] });
    }
    const fz = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    ok(fz.llave.length > 0 && fz.llave[0].ronda === 'cuartos' && !fz.llave_prevista, 'al terminar las zonas se generó la llave (cuartos) y reemplaza a la referencia');
    // La llave real respeta la referencia: cuartos 1 = 1° Zona A vs 2° Zona D
    const pos = (zona, puesto) => fz.zonas.find(z => z.nombre === zona).tabla.find(r => r.posicion === puesto).pareja_id;
    const q1 = fz.llave[0].partidos.find(p => p.orden === 1);
    ok(q1.pareja1.id === pos('Zona A', 1) && q1.pareja2.id === pos('Zona D', 2), 'cuartos 1 con los nombres reales: 1° Zona A vs 2° Zona D');
    const q4 = fz.llave[0].partidos.find(p => p.orden === 4);
    ok(q4.pareja1.id === pos('Zona C', 1) && q4.pareja2.id === pos('Zona B', 2), 'cuartos 4: 1° Zona C vs 2° Zona B');
    const antes = fz.llave.flatMap(r => r.partidos).filter(p => p.fecha).some(p => `${p.fecha} ${p.hora}` < '2026-12-21 18:00');
    ok(!antes && fz.llave[0].partidos.every(p => p.fecha), 'ningún partido de la llave antes del inicio configurado (21/12 18:00)');
    ok((await call('PUT', `/torneos/${t.id}/categorias/5/llave-inicio`, { fecha: '2026-12-21', hora: '19:00' })).status === 409, 'con la llave armada no se cambia el inicio → 409');
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
    await m.sequelize.close();
  }
}

(async () => {
  unitarias();
  await integracion();
  console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
  process.exit(fallas ? 1 : 0);
})();
