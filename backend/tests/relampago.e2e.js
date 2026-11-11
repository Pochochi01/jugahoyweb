/**
 * tests/relampago.e2e.js — Torneo Relámpago por la API real (club TEMPORAL).   npm run test:relampago:e2e
 *
 * Configuración inválida → 400 · formato por fase guardado y devuelto · zonas a 1 set de 4 (válidos / inválidos,
 * W.O. 4-0) · tabla con sets y games · llave con la regla de cada fase (semifinal TB a 10, final 2 sets + súper TB) ·
 * fase con resultados no se reconfigura, fase sin resultados sí · torneo tradicional intacto.
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
  const admin = await m.User.create({ nombre: 'Rita', apellido: 'Rayo', email: `rl-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `RL TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const c2 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 2', deporte: 'padel', activa: true });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const ids = [];
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Relámpago' })).data;
    const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
    const datos = { nombre: 'Relámpago Test', liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-11', cupo_parejas: 8, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 30, descanso_minimo: 0 };
    const formato = {
      zonas: { tipo: 'un_set', games: 4, tiebreak: 7 },
      cuartos: { tipo: 'un_set', games: 5, tiebreak: 7 },
      semifinal: { tipo: 'un_set', games: 6, tiebreak: 10 },
      final: { tipo: 'dos_sets_super_tb', games: 6, tiebreak: 7, super_tiebreak: 10 },
    };
    ok((await call('POST', '/torneos', { ...datos, formato: 'relampago', formato_partidos: { zonas: { games: 30 } } })).status === 400, 'games fuera de rango → 400');
    ok((await call('POST', '/torneos', { ...datos, formato: 'rayo' })).status === 400, 'formato inexistente → 400');
    const cr = await call('POST', '/torneos', { ...datos, formato: 'relampago', formato_partidos: formato });
    const t = cr.data; ids.push(t.id);
    ok([200, 201].includes(cr.status), `torneo relámpago creado (${cr.status} ${cr.data?.message || ''})`);
    const det = (await call('GET', `/torneos/${t.id}/fixture`)).data.torneo;
    ok(det.formato === 'relampago' && det.formato_partidos.zonas.games === 4 && det.formato_partidos.final.super_tiebreak === 10 && det.formato_partidos.zonas.ventaja === true, 'formato por fase guardado y normalizado');

    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [c1, c2].map(c => ({ field_id: c.id, disponibilidad_horaria: franja })) });
    let n = 0;
    const jug = () => { n++; return { nombre: `Jugador${n} Rayo`, dni: String(48000000 + (s % 10000) * 100 + n), whatsapp: `54938151${String(n).padStart(5, '0')}`, categoria: 5, genero: 'masculino' }; };
    for (let i = 0; i < 6; i++) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(), jug()], horarios_preferidos: franja, pagado: true });
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    let fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const put = (p, body) => call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, body);
    const [p1, p2] = fx.zonas[0].partidos;

    const invalidos = [[[6, 2]], [[6, 4]], [[4, 3]], [[5, 4]], [[4, 1], [4, 0]], [[7, 5]]];
    const acepto = [];
    for (const sets of invalidos) if ((await put(p1, { sets })).status !== 400) acepto.push(JSON.stringify(sets));
    ok(!acepto.length, `zona 1 set a 4: inválidos → 400 (6-2, 6-4, 4-3, 5-4 sin TB, 2 sets, 7-5)${acepto.length ? ` · aceptó ${acepto}` : ''}`);
    ok((await put(p1, { sets: [[5, 4]], tie_breaks: [[7, 3]] })).status === 200, 'zona: 5-4 con tie-break a 7 (7-3) válido');
    ok((await put(p2, { walkover_ganador: 1 })).status === 200 && JSON.stringify((await m.TorneoResultado.findOne({ where: { partido_id: p2.id } })).sets) === '[[4,0]]', 'W.O. en zona → 4-0 (un set a 4)');
    fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const fila = fx.zonas[0].tabla.find(r => r.pareja_id === p1.pareja1.id);
    ok(fila.pj >= 1 && fila.sf >= 1 && fila.gf >= 5, `tabla: sets y games de un set único (PJ ${fila.pj}, SF ${fila.sf}, GF ${fila.gf})`);

    // Reconfigurar: zonas con resultados no; final sin resultados sí
    ok((await call('PUT', `/torneos/${t.id}`, { formato_partidos: { ...formato, zonas: { tipo: 'un_set', games: 6, tiebreak: 7 } } })).status === 409, 'cambiar la regla de zonas con resultados → 409');
    const cambio = await call('PUT', `/torneos/${t.id}`, { formato_partidos: { ...formato, final: { tipo: 'dos_sets_super_tb', games: 4, tiebreak: 7, super_tiebreak: 10 } } });
    ok(cambio.status === 200, `cambiar la final (sin resultados) con el fixture armado → 200 (${cambio.status} ${cambio.data?.message || ''})`);
    ok((await call('PUT', `/torneos/${t.id}`, { formato: 'tradicional' })).status === 409, 'cambiar el formato con el fixture armado → 409');

    // Completar zonas y jugar la llave con la regla de cada fase
    for (const z of fx.zonas) for (const p of z.partidos) if (!p.resultado) await put(p, { sets: [[4, 2]] });
    const gl = await call('POST', `/torneos/${t.id}/llave/generar`, { notificar: false });
    ok(gl.status === 200 || /se genera al terminar|ya/i.test(gl.data?.message || ''), 'llave armada al terminar las zonas');
    fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const rondas = fx.llave.map(r => r.ronda);
    ok(rondas.includes('final'), `rondas de la llave: ${rondas.join(', ')}`);
    const cuerpos = { semifinal: [{ sets: [[6, 4]] }, { sets: [[7, 6]], tie_breaks: [[10, 8]] }], final: [{ sets: [[4, 2], [2, 4], [10, 7]] }] };
    for (const ronda of rondas) {
      const partidos = (await call('GET', `/torneos/${t.id}/fixture`)).data.llave.find(r => r.ronda === ronda).partidos.filter(p => !p.es_bye && p.pareja1 && p.pareja2);
      for (const [i, p] of partidos.entries()) {
        if (ronda === 'semifinal' && i === 0) ok((await put(p, { sets: [[7, 6]], tie_breaks: [[7, 5]] })).status === 400, 'semifinal: tie-break a 7 rechazado (la fase usa TB a 10)');
        if (ronda === 'final') {
          ok((await put(p, { sets: [[6, 4], [6, 2]] })).status === 400, 'final reconfigurada a 4 games: 6-4 rechazado');
          ok((await put(p, { sets: [[4, 2], [2, 4]] })).status === 400, 'final 1 set a 1 sin súper TB → 400');
        }
        const lista = cuerpos[ronda] || [{ sets: [[5, 3]] }];
        const body = lista[i % lista.length];
        const r = await put(p, body);
        ok(r.status === 200, `${ronda} ${i + 1}: ${JSON.stringify(body.sets)} → ${r.status} ${r.data?.message || ''}`);
      }
    }
    const fin = (await call('GET', `/torneos/${t.id}/fixture`)).data.llave.find(r => r.ronda === 'final').partidos[0];
    ok(fin.resultado?.ganador_id, 'final cargada: hay campeón');

    // Tradicional: sin cambios
    const tt = (await call('POST', '/torneos', { ...datos, nombre: 'Tradicional Test' })).data; ids.push(tt.id);
    const tdet = (await call('GET', `/torneos/${tt.id}/fixture`)).data.torneo;
    ok(tdet.formato === 'tradicional' && tdet.formato_partidos == null, 'torneo nuevo sin formato → tradicional, sin configuración por fase');
    const tr = (await call('POST', '/torneos', { ...datos, nombre: 'Trad con cfg', formato_partidos: formato })).data; ids.push(tr.id);
    ok(tr.formato_partidos == null, 'tradicional ignora formato_partidos');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of ids) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.TimeSlot.destroy({ where: { field_id: [c1.id, c2.id] } });
    await m.Field.destroy({ where: { id: [c1.id, c2.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(() => {});
    await admin.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
