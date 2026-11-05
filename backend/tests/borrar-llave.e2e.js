/**
 * tests/borrar-llave.e2e.js — Borrar la llave (solo Administrador General).
 *
 *   npm run test:llaves:borrar
 *
 * Club TEMPORAL: admin del club → 403; Administrador General → borra partidos y resultados de
 * llave, la categoría vuelve a "zonas", las zonas y sus resultados quedan intactos y la llave
 * se puede regenerar (mismos cruces). Con puntos del ranking anual asignados → 409.
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
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Club', email: `bl-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const general = await m.User.create({ nombre: 'Admin', apellido: 'General', email: `bg-${s}@test.local`, password: 'x', rol: 'general_admin', activo: true });
  const club = await m.Complex.create({ nombre: `BL TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const c2 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 2', deporte: 'padel', activa: true });
  const tok = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const tkClub = tok(admin), tkGeneral = tok(general);
  const call = async (method, path, body, tk = tkClub) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const torneos = [];
  let n = 0;
  const jug = () => { n++; return { nombre: `Jugador${n} Borrar`, dni: String(44000000 + (s % 10000) * 100 + n), whatsapp: `54938180${String(n).padStart(5, '0')}`, categoria: 5, genero: 'masculino' }; };
  const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
  const crear = async (liga, tipo) => {
    const t = (await call('POST', '/torneos', { nombre: `Copa Borrar ${tipo}`, liga_id: liga.id, categorias: [5], genero: 'masculino', tipo, fecha_inicio: '2026-12-10', fecha_fin: '2026-12-12', cupo_parejas: 16, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneos.push(t.id);
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [c1, c2].map(c => ({ field_id: c.id, disponibilidad_horaria: franja })) });
    for (let i = 0; i < 6; i++) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(), jug()], horarios_preferidos: franja, pagado: true });
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    return t;
  };
  const jugar = async (t, soloZonas) => {
    for (let v = 0; v < 8; v++) {
      const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
      const pend = [...fx.zonas.flatMap(z => z.partidos), ...(soloZonas ? [] : fx.llave.flatMap(r => r.partidos))].filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id);
      if (!pend.length) return fx;
      for (const p of pend) await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: [[6, 3], [6, 4]] });
    }
    return (await call('GET', `/torneos/${t.id}/fixture`)).data;
  };
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Borrar' })).data;
    const t = await crear(liga, 'unico');
    const fx0 = await jugar(t, true);
    ok(fx0.llave.length > 0, 'la llave se generó al terminar las zonas');
    // Una semifinal jugada
    await call('PUT', `/torneos/${t.id}/partidos/${fx0.llave[0].partidos[0].id}/resultado`, { sets: [[6, 1], [6, 1]] });
    const cruces = (fx) => fx.llave[0].partidos.map(p => `${p.pareja1?.id}-${p.pareja2?.id}`).join('|');
    const antes = cruces(fx0);
    const resultadosZona = async () => Number((await m.sequelize.query('SELECT COUNT(*) n FROM torneo_resultados r JOIN torneo_partidos p ON p.id = r.partido_id WHERE p.torneo_id = ? AND p.ronda = "zona"', { replacements: [t.id], type: m.sequelize.QueryTypes.SELECT }))[0].n);
    const zonasAntes = await resultadosZona();

    const r403 = await call('DELETE', `/torneos/${t.id}/categorias/5/llave`);
    ok(r403.status === 403, 'administrador del club → 403 (solo Administrador General)');
    ok((await m.TorneoPartido.count({ where: { torneo_id: t.id, ronda: { [require('sequelize').Op.ne]: 'zona' } } })) === 3, 'la llave sigue intacta tras el intento rechazado');

    const del = await call('DELETE', `/torneos/${t.id}/categorias/5/llave`, null, tkGeneral);
    ok(del.status === 200 && del.data.partidos_borrados === 3 && del.data.resultados_borrados === 1, `Administrador General: llave borrada (${JSON.stringify(del.data)})`);
    const fx1 = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    ok(fx1.llave.length === 0 && fx1.categorias[0].estado === 'zonas' && fx1.llave_prevista?.rondas?.length, 'sin llave: la categoría vuelve a "zonas" y se muestra la llave de referencia');
    const zonasDespues = await resultadosZona();
    ok(zonasAntes > 0 && zonasDespues === zonasAntes && fx1.zonas.every(z => z.completa), 'zonas, posiciones y resultados de zona intactos');
    ok((await call('GET', `/torneos/${t.id}`)).data.estado === 'zonas', 'estado del torneo sincronizado (zonas)');
    ok((await call('DELETE', `/torneos/${t.id}/categorias/5/llave`, null, tkGeneral)).status === 409, 'borrar de nuevo sin llave → 409');

    const gen = await call('POST', `/torneos/${t.id}/llave/generar`, { notificar: false });
    const fx2 = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    ok(gen.status === 200 && cruces(fx2) === antes && fx2.llave.flatMap(r => r.partidos).every(p => !p.resultado), 'se regenera con los mismos cruces oficiales y sin resultados');

    // Con puntos del ranking anual asignados → bloqueado
    const ta = await crear(liga, 'anual');
    await jugar(ta);
    const tca = await m.TorneoCategoria.findOne({ where: { torneo_id: ta.id } });
    ok(tca.estado === 'finalizado' && tca.puntos_asignados, 'torneo anual finalizado con puntos asignados');
    const blq = await call('DELETE', `/torneos/${ta.id}/categorias/5/llave`, null, tkGeneral);
    ok(blq.status === 409 && /ranking anual/.test(blq.data.message), 'con puntos del ranking anual asignados → 409 (no altera el ranking)');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of torneos) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.RankingPunto.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.RankingAjuste.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.RankingResultado?.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(e => console.error('limpieza liga', e.message));
    await m.TimeSlot.destroy({ where: { field_id: [c1.id, c2.id] } });
    await m.Field.destroy({ where: { id: [c1.id, c2.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(e => console.error('limpieza club', e.message));
    await admin.destroy().catch(() => {});
    await general.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
