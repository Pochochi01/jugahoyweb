/**
 * tests/torneos-plantel.e2e.js — Reprogramación auditada de partidos y edición del plantel.
 *
 *   npm run test:torneos:plantel
 *
 * Club TEMPORAL con 2 canchas de pádel, un torneo de 3 parejas y un colaborador con
 * permisos granulares recortados. Borra todo al final.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const m = require('../src/models');

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Plantel', email: `tp2-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const colabU = await m.User.create({ nombre: 'Colab', apellido: 'Torneos', email: `tp2c-${s}@test.local`, password: 'x', rol: 'collaborator', activo: true });
  const club = await m.Complex.create({ nombre: `TPL TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const c2 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 2', deporte: 'padel', activa: true });
  const colab = await m.Collaborator.create({ complex_id: club.id, user_id: colabU.id, activo: true, permisos: { torneos: true, 'tournament.match.change_court': false, 'tournament.team.remove_player': false } });
  const tk = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body, user = admin) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Plantel' })).data;
    const t = (await call('POST', '/torneos', { nombre: 'Copa Plantel', liga_id: liga.id, categorias: [6], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-15', fecha_fin: '2026-12-16', cupo_parejas: 8, parejas_por_zona: 3, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneoId = t.id;
    const franja = [{ fecha: null, desde: '09:00', hasta: '13:00' }];
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }, { field_id: c2.id, disponibilidad_horaria: franja }] });
    const jug = (n, extra = {}) => ({ nombre: `Jugador ${n}`, dni: String(35000000 + n), whatsapp: `5493814${String(n).padStart(6, '0')}`, categoria: 6, genero: 'masculino', ...extra });
    const hor = [{ fecha: null, desde: '09:00', hasta: '13:00' }];
    const parejas = [];
    for (const [a, b] of [[1, 2], [3, 4], [5, 6]]) parejas.push((await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(a), jug(b)], horarios_preferidos: hor, pagado: true })).data);
    await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    let fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const [p1, p2] = fx.zonas[0].partidos;
    const ruta = (p) => `/torneos/${t.id}/partidos/${p.id}/programacion`;

    // ── Reprogramación ──
    ok((await call('PUT', ruta(p1), { field_id: p1.field_id, fecha: p1.fecha, hora: p1.hora, motivo: 'x' })).status === 400, 'mismo día, hora y cancha → 400 (sin cambios)');
    ok((await call('PUT', ruta(p1), { field_id: c1.id, fecha: '2026-12-15', hora: '25:00' })).status === 400, 'horario inválido → 400');
    ok((await call('PUT', ruta(p1), { field_id: c1.id, fecha: '2026-12-20', hora: '10:00' })).status === 400, 'fecha fuera del torneo → 400');
    ok((await call('PUT', ruta(p1), { field_id: c1.id, fecha: '2026-12-15', hora: '18:00' })).status === 409, 'fuera de la franja de la cancha → 409');
    ok((await call('PUT', ruta(p1), { field_id: p2.field_id, fecha: p2.fecha, hora: p2.hora })).status === 409, 'superposición con otro partido en la misma cancha → 409');
    const libre = (p1.field_id === c1.id ? c2 : c1).id;
    const r1 = await call('PATCH', `/torneos/${t.id}/partidos/${p1.id}/reschedule`, { field_id: libre, fecha: '2026-12-16', hora: '12:00', motivo: 'Lluvia', notificar: false });
    ok(r1.status === 200 && r1.data.partido.fecha === '2026-12-16' && r1.data.partido.hora === '12:00' && r1.data.partido.field_id === libre, 'reprogramado: nuevo día, horario y cancha (PATCH /reschedule)');
    const hist = (await call('GET', `/torneos/${t.id}/partidos/${p1.id}/historial`)).data;
    ok(hist.length === 1 && hist[0].old_fecha === p1.fecha && hist[0].new_hora === '12:00' && hist[0].motivo === 'Lluvia' && hist[0].usuario === 'Admin Plantel' && hist[0].new_cancha, 'historial: datos anteriores, nuevos, motivo, usuario y cancha');
    fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
    const actualizado = fx.zonas[0].partidos.find(p => p.id === p1.id);
    ok(actualizado.ultima_modificacion?.usuario === 'Admin Plantel' && actualizado.ultima_modificacion?.fecha, 'fixture muestra "última modificación por X el día…"');
    const notifs = await m.TorneoNotificacion.findAll({ where: { partido_id: p1.id } });
    ok(notifs.length === 2 && notifs.every(n => n.estado === 'pendiente' && n.tipo === 'reprogramacion'), 'notificaciones preparadas (pendientes) para las 2 parejas');
    const slot = await m.TimeSlot.findOne({ where: { field_id: libre, fecha: '2026-12-16', hora: '12:00' } });
    ok(slot?.torneo_partido_id === p1.id, 'agenda general bloqueada en el nuevo horario');
    // Desprogramar
    const r2 = await call('PUT', ruta(p1), { estado: 'pendiente', motivo: 'Se define luego' });
    ok(r2.status === 200 && r2.data.partido.estado === 'pendiente' && !r2.data.partido.fecha, 'estado de programación: queda "sin programar"');
    ok(!(await m.TimeSlot.findOne({ where: { field_id: libre, fecha: '2026-12-16', hora: '12:00' } }))?.torneo_partido_id, 'al desprogramar se libera la agenda');
    await call('PUT', ruta(p1), { field_id: libre, fecha: '2026-12-16', hora: '11:00' });

    // Permisos granulares (colaborador sin change_court)
    ok((await call('PUT', ruta(p1), { field_id: libre, fecha: '2026-12-16', hora: '10:00' }, colabU)).status === 200, 'colaborador: puede cambiar el horario');
    const sinCancha = await call('PUT', ruta(p1), { field_id: libre === c1.id ? c2.id : c1.id, fecha: '2026-12-16', hora: '10:00' }, colabU);
    ok(sinCancha.status === 403 && /cancha/.test(sinCancha.data.message), 'colaborador sin "cambiar cancha" → 403');
    const perms = (await call('GET', '/torneos-permisos', null, colabU)).data;
    ok(perms.permisos['tournament.match.reschedule'] === true && perms.permisos['tournament.match.change_court'] === false, 'GET /torneos-permisos refleja los permisos granulares');

    // Partido jugado: no se reprograma
    await call('PUT', `/torneos/${t.id}/partidos/${p2.id}/resultado`, { sets: [[6, 2], [6, 2]] });
    ok((await call('PUT', ruta(p2), { field_id: c1.id, fecha: '2026-12-16', hora: '09:00' })).status === 409, 'partido finalizado → 409');

    // ── Plantel ──
    const pareja3 = parejas.find(p => ![p2.pareja1?.id, p2.pareja2?.id].includes(p.id)) || parejas[2];
    const pl = `/torneos/${t.id}/parejas/${pareja3.id}/jugadores`;
    let lista = (await call('GET', pl)).data;
    ok(lista.jugadores.length === 2 && lista.cupo === 2, 'plantel: 2 jugadores, cupo 2');
    const [ja, jb] = lista.jugadores;
    ok((await call('POST', pl, jug(90))).status === 409, 'cupo completo → no se agrega un tercero');
    const mod = await call('PUT', `${pl}/${ja.id}`, { posicion: 'drive', observaciones: 'Zurdo', fecha_nacimiento: '1990-05-10' });
    ok(mod.status === 200 && mod.data.jugadores.find(j => j.id === ja.id).posicion === 'drive', 'modificar jugador (posición, observaciones, nacimiento)');
    ok((await call('PUT', `${pl}/${jb.id}`, { posicion: 'drive' })).status === 409, 'posición repetida en la pareja → 409');
    ok((await call('PUT', `${pl}/${jb.id}`, { categoria: 3 })).status === 400, 'jugador de nivel más alto (3ª) no puede bajar a 6ª → 400');
    ok((await call('PUT', `${pl}/${jb.id}`, { categoria: 7 })).status === 200, 'jugador de 7ª puede jugar 6ª (sube de nivel)');
    ok((await call('PUT', `${pl}/${jb.id}`, { dni: '35000001' })).status === 409, 'DNI duplicado dentro del torneo → 409');
    ok((await call('DELETE', `${pl}/${jb.id}`, null, colabU)).status === 403, 'colaborador sin "eliminar jugadores" → 403');
    // La pareja 3 todavía no jugó: se puede reemplazar a un jugador
    const del = await call('DELETE', `${pl}/${jb.id}`);
    const jugoPareja3 = lista.participacion;
    ok(jugoPareja3 ? del.status === 409 : (del.status === 200 && del.data.jugadores.length === 1), 'eliminar jugador sin participación → queda 1 lugar libre');
    if (!jugoPareja3) {
      ok((await call('POST', pl, jug(91, { genero: 'femenino' }))).status === 400, 'género distinto al del torneo → 400');
      const alta = await call('POST', pl, jug(91, { posicion: 'reves' }));
      ok(alta.status === 201 && alta.data.jugadores.length === 2, 'agregar reemplazo → pareja completa');
      const nuevo = await m.TorneoJugador.findOne({ where: { pareja_id: pareja3.id, dni: '35000091' } });
      ok(nuevo?.jugador_id && await m.TorneoTicket.count({ where: { jugador_id: nuevo.id } }) === 1, 'reemplazo vinculado al registro del club y con su ticket');
    }
    // Pareja que ya jugó: no se elimina
    const jugo = p2.pareja1?.id || p2.pareja2?.id;
    const jj = (await call('GET', `/torneos/${t.id}/parejas/${jugo}/jugadores`)).data;
    const nodel = await call('DELETE', `/torneos/${t.id}/parejas/${jugo}/jugadores/${jj.jugadores[0].id}`);
    ok(nodel.status === 409 && nodel.data.message === 'El jugador posee participación registrada y no puede eliminarse.', 'jugador con participación → no se elimina (mensaje exacto)');
    const hp = (await call('GET', `${pl}/historial`)).data;
    ok(['CREATE', 'UPDATE', 'DELETE'].every(a => hp.some(h => h.accion === a)) && hp.every(h => h.usuario), 'historial del plantel: CREATE, UPDATE y DELETE con usuario');
    const upd = hp.find(h => h.accion === 'UPDATE' && h.datos_nuevos?.posicion === 'drive');
    ok(upd && upd.datos_anteriores.posicion === null && upd.datos_nuevos.posicion === 'drive' && upd.datos_nuevos.observaciones === 'Zurdo', 'historial guarda datos anteriores y nuevos');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.Collaborator.destroy({ where: { complex_id: club.id } });
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } });
    await m.TimeSlot.destroy({ where: { field_id: [c1.id, c2.id] } });
    await m.Field.destroy({ where: { id: [c1.id, c2.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] });
    await m.User.destroy({ where: { id: [admin.id, colabU.id] } });
    server.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    await m.sequelize.close();
    process.exit(fallas ? 1 : 0);
  }
})();
