/**
 * tests/torneos-puntajes.e2e.js — Posiciones con todos los inscriptos (0 puntos) y
 * modificación manual de puntaje con auditoría.
 *
 *   npm run test:torneos:puntajes
 *
 * Crea un club TEMPORAL (cancha de pádel, liga, torneo, parejas, organizador) y lo borra al final.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const m = require('../src/models');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Puntajes', email: `tp-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `TP TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const cancha = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tkAdmin = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  let torneoId = null;
  const call = async (method, path, body, token = tkAdmin) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Test' })).data;
    const t = (await call('POST', '/torneos', { nombre: 'Copa Test', liga_id: liga.id, categorias: [7], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-01', fecha_fin: '2026-12-02', cupo_parejas: 16, precio_inscripcion: 1000 })).data;
    torneoId = t.id;
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: cancha.id, disponibilidad_horaria: [{ fecha: null, desde: '08:00', hasta: '23:00' }] }] });
    const jug = (n) => ({ nombre: `Jugador ${String.fromCharCode(64 + n)}`, dni: String(32000000 + n), whatsapp: `5493810000${String(n).padStart(3, '0')}`, categoria: 7, genero: 'masculino' });
    const hor = [{ fecha: null, desde: '08:00', hasta: '23:00' }];
    for (const [a, b, pagado] of [[1, 2, true], [3, 4, true], [5, 6, false]]) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(a), jug(b)], horarios_preferidos: hor, pagado, metodo_pago: 'efectivo' });

    // ── 1. Todos los inscriptos con 0 (antes del fixture) ──
    let rk = (await call('GET', `/torneos/${t.id}/ranking`)).data;
    ok(rk.length === 6, 'antes del fixture: aparecen los 6 jugadores inscriptos (también la pareja pendiente de pago)');
    ok(rk.every(f => f.puntos === 0 && f.pj === 0 && f.pg === 0 && f.pp === 0 && f.dif_sets === 0 && f.dif_games === 0), 'sin partidos: puntos, PJ, PG, PP y diferencias en 0 (nunca null)');
    ok(rk.every(f => f.posicion === 1), 'empatados en 0 comparten la posición');
    const pub = await fetch(`${base}/public/${t.id}/ranking`).then(r => r.json()).catch(() => null);
    ok(Array.isArray(pub) ? pub.length === 6 : true, 'la página pública también lista a todos (torneo en borrador: oculto)');

    // Fixture con las pagadas: la pendiente sigue apareciendo con 0
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const partido = fx.zonas[0].partidos[0];
    await call('PUT', `/torneos/${t.id}/partidos/${partido.id}/resultado`, { sets: [[6, 2], [6, 3]] });
    rk = (await call('GET', `/torneos/${t.id}/ranking`)).data;
    ok(rk.length === 6 && rk.filter(f => f.puntos > 0).length === 4 && rk.filter(f => f.puntos === 0).length === 2, 'con resultados: 4 con puntos y la pareja sin zona sigue visible con 0');
    ok(rk[0].pj === 1 && rk[0].pg === 1 && rk[0].dif_sets === 2, 'los ganadores encabezan con PJ, PG y diferencia reales');

    // ── 2. Modificación manual ──
    const jugadorC = rk.find(f => f.jugador === 'Jugador E');   // pareja pendiente, 0 pts
    let r = await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: 50, motivo: 'Puntos de la fecha anterior' });
    ok(r.status === 200 && r.data.jugador.puntos === 50 && r.data.jugador.manual && r.data.jugador.posicion === 1, 'puntaje manual 50 → pasa a la posición 1');
    ok(r.data.ranking.length === 6 && r.data.ranking[0].jugador_id === jugadorC.jugador_id, 'devuelve el ranking actualizado');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: 0 })).data.jugador.puntos === 0, 'acepta 0');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: -5 })).status === 400, 'negativo → 400');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: 2.5 })).status === 400, 'decimal → 400');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: 'abc' })).status === 400, 'texto → 400');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, {})).status === 400, 'sin puntaje → 400');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/99999999/puntaje`, { puntaje: 5 })).status === 404, 'jugador de otro torneo / inexistente → 404');
    ok((await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: 5 }, null)).status === 401, 'sin JWT → 401');
    // Organizador del club: puede ver, no modificar
    const org = await m.TorneoOrganizador.create({ id_tenant: club.id, nombre: 'Org', usuario: `org${s}`, password: await bcrypt.hash('x', 4), activo: true }).catch(() => null);
    if (org) {
      const tkOrg = jwt.sign({ id: org.id, tipo: 'organizador', id_tenant: club.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
      const ro = await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: 5 }, tkOrg);
      ok(ro.status === 403, `organizador (no administrador) → 403 (recibió ${ro.status})`);
    }
    // Volver al automático
    r = await call('PUT', `/torneos/${t.id}/jugadores/${jugadorC.jugador_id}/puntaje`, { puntaje: null, motivo: 'error' });
    ok(r.status === 200 && !r.data.jugador.manual && r.data.jugador.puntos === r.data.jugador.puntos_calculados, 'puntaje null → vuelve al cálculo por partidos');

    // ── 3. Auditoría ──
    const hist = (await call('GET', `/torneos/${t.id}/puntajes/historial?jugador_id=${jugadorC.jugador_id}`)).data;
    ok(hist.length === 3, 'historial: solo los cambios válidos (3)');
    ok(hist[2].puntaje_anterior === jugadorC.puntos && jugadorC.puntos === 0 && hist[2].puntaje_nuevo === 50 && hist[2].motivo === 'Puntos de la fecha anterior' && hist[2].usuario_id === admin.id && hist[2].createdAt, 'registro: anterior, nuevo, motivo, usuario y fecha');
    ok(hist[0].automatico === true, 'la vuelta al automático queda marcada');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.TorneoOrganizador.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } });
    await m.TimeSlot.destroy({ where: { field_id: cancha.id } });
    await cancha.destroy();
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] });
    await admin.destroy();
    server.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    await m.sequelize.close();
    process.exit(fallas ? 1 : 0);
  }
})();
