/**
 * tests/inscripciones-inteligentes.e2e.js — Inscripciones inteligentes por la API real (club TEMPORAL).
 *
 *   npm run test:inscripciones
 *
 * Autocompletado (DNI / email / teléfono) · búsqueda de jugadores con ranking y categoría · duplicados
 * (DNI, email, teléfono con distinto formato, dentro de la pareja) · datos obligatorios (público vs panel) ·
 * controles antes de armar zonas · bloqueo automático · reapertura (solo admin, con motivo) · auditoría.
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
  const sfx = String(s % 100000).padStart(5, '0');
  const admin = await m.User.create({ nombre: 'Ana', apellido: 'Admin', email: `ii-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const colabU = await m.User.create({ nombre: 'Coco', apellido: 'Colab', email: `iic-${s}@test.local`, password: 'x', rol: 'collaborator', activo: true });
  const club = await m.Complex.create({ nombre: `II TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  await m.Collaborator.create({ complex_id: club.id, user_id: colabU.id, activo: true, permisos: { torneos: true } });
  const tk = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body, user = admin, publico = false) => {
    const url = publico ? `${base}${path}` : `${base}/club/${club.id}${path}`;
    const r = await fetch(url, { method, headers: { ...(user && { Authorization: `Bearer ${tk(user)}` }), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const dni = (n) => String(51000000 + (s % 10000) * 10 + n);
  const tel = (n) => `549381${sfx}${String(n).padStart(2, '0')}`;
  const jug = (n, extra = {}) => ({ nombre: `Jugador${n} Prueba`, dni: dni(n), whatsapp: tel(n), email: `j${n}-${s}@test.local`, categoria: 6, genero: 'masculino', ...extra });
  const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
  let torneoId;
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Inscripciones' })).data;
    const t = (await call('POST', '/torneos', { nombre: 'Copa Inscripciones', liga_id: liga.id, categorias: [6], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-15', fecha_fin: '2026-12-16', cupo_parejas: 12, parejas_por_zona: 3, duracion_partido: 60, descanso_minimo: 0 })).data;
    torneoId = t.id;
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }] });
    await call('PUT', `/torneos/${t.id}/estado`, { estado: 'inscripcion' });
    const alta = (a, b, extra = {}) => call('POST', `/torneos/${t.id}/parejas`, { jugadores: [a, b], horarios_preferidos: franja, pagado: true, ...extra });

    // ── Autocompletado y búsqueda ──
    await m.PadelJugador.create({ id_tenant: club.id, dni: dni(1), nombre: 'Juan Pérez', email: `juan-${s}@test.local`, whatsapp: tel(1), genero: 'masculino', categoria_actual: 6 });
    const sug = (await call('GET', `/torneos/${t.id}/jugadores/buscar?q=Juan Pér`)).data;
    const juan = sug.find(x => x.dni === dni(1));
    ok(juan && juan.email === `juan-${s}@test.local` && juan.whatsapp === tel(1) && juan.categoria === 6 && 'ranking' in juan, 'búsqueda por nombre: sugiere DNI, email, teléfono, categoría habitual y ranking');
    ok((await call('GET', `/torneos/${t.id}/jugadores/buscar?q=${dni(1).slice(0, 5)}`)).data.some(x => x.dni === dni(1)), 'búsqueda por DNI');
    ok((await call('GET', `/torneos/${t.id}/jugadores/buscar?q=${tel(1).slice(-6)}`)).data.some(x => x.dni === dni(1)), 'búsqueda por teléfono');
    const r1 = await alta({ nombre: 'Juan Pérez', dni: dni(1), categoria: 6, genero: 'masculino' }, jug(2));
    const j1 = r1.data?.jugadores?.find(j => j.dni === dni(1));
    ok(r1.status === 201 && j1?.email === `juan-${s}@test.local` && j1?.whatsapp === tel(1), `autocompletado por DNI: email y teléfono desde la base (${r1.status} ${r1.data?.message || ''})`);
    ok(r1.data?.autocompletados?.[0]?.campos?.includes('email'), 'la respuesta informa qué se autocompletó');
    const r1b = await alta({ nombre: 'Juan Pérez Sinregistro', email: `juan-${s}@test.local`, categoria: 6, genero: 'masculino' }, jug(3));
    ok(r1b.status === 409 && /DNI|email/.test(r1b.data?.message || ''), 'autocompleta el DNI por email → detecta que Juan ya está inscripto');

    // ── Duplicados ──
    const d1 = await alta(jug(4, { dni: dni(2) }), jug(5));
    ok(d1.status === 409 && d1.data.message.includes('El DNI') && d1.data.message.includes('ya pertenece a un participante de este torneo'), `DNI repetido → "${d1.data?.message}"`);
    const d2 = await alta(jug(4, { email: `j2-${s}@test.local` }), jug(5));
    ok(d2.status === 409 && /ya se encuentra registrado en una pareja inscripta/.test(d2.data.message), `email repetido → "${d2.data?.message}"`);
    const d3 = await alta(jug(4, { whatsapp: tel(2).slice(3) }), jug(5));
    ok(d3.status === 409 && /ya pertenece a otro jugador anotado/.test(d3.data.message), `teléfono repetido (sin 549) → "${d3.data?.message}"`);
    const d4 = await alta(jug(4), jug(5, { email: `j4-${s}@test.local` }));
    ok(d4.status === 409 && /mismo email/.test(d4.data.message), 'mismo email en los dos jugadores de la pareja → 409');
    ok(Array.isArray(d1.data.conflictos) && d1.data.conflictos.length >= 1, 'el error trae la lista de conflictos');

    // ── Datos obligatorios: público vs panel ──
    const pub = await call('POST', `/public/${t.id}/inscripciones`, { jugadores: [jug(6, { email: '' }), jug(7)], horarios_preferidos: franja }, null, true);
    ok(pub.status === 400 && pub.data.faltantes?.includes('email'), `público sin email → 400 (${pub.data?.message})`);
    const pub2 = await call('POST', `/public/${t.id}/inscripciones`, { jugadores: [jug(6), jug(7)], horarios_preferidos: franja }, null, true);
    ok(pub2.status === 201, 'público con datos completos → inscripto');
    const adm = await alta(jug(8, { email: '', whatsapp: '' }), jug(9));
    ok(adm.status === 201 && adm.data.jugadores.some(j => j.dni === dni(8) && !j.whatsapp && !j.email), 'panel (administrativo) puede inscribir sin email ni teléfono');
    await m.TorneoPareja.update({ estado_pago: 'pagado' }, { where: { torneo_id: t.id } });

    // ── Controles antes de armar zonas ──
    const otra = await m.TorneoJugador.findOne({ where: { dni: dni(9) } });
    await otra.update({ email: `j6-${s}@test.local` });   // inconsistencia "histórica" (cargada antes de las nuevas reglas)
    const gz = await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    ok(gz.status === 409 && gz.data.inconsistencias?.some(x => x.includes(`j6-${s}@test.local`)), `zonas con email repetido → 409 con detalle (${gz.data?.message?.slice(0, 80)}…)`);
    await otra.update({ email: null });
    const gz2 = await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
    ok(gz2.status === 200, `sin inconsistencias → zonas generadas (${gz2.status} ${gz2.data?.message || ''})`);

    // ── Bloqueo automático ──
    const est = (await call('GET', `/torneos/${t.id}/inscripciones/estado`)).data;
    ok(est.cerradas === true && est.puede_reabrir === true && est.categorias[0].inscripciones_cerradas, 'estado: INSCRIPCIONES CERRADAS (el admin puede reabrir)');
    const nueva = await alta(jug(20), jug(21));
    ok(nueva.status === 409 && nueva.data.message === 'Las zonas ya fueron generadas. Las inscripciones se encuentran cerradas.', 'nueva pareja tras armar zonas → 409 con el mensaje pedido');
    const parejas = (await call('GET', `/torneos/${t.id}/parejas`)).data.parejas;
    const p0 = parejas[0];
    ok((await call('PUT', `/torneos/${t.id}/parejas/${p0.id}`, { jugadores: [{ id: p0.jugadores[0].id, nombre: 'Otro Nombre' }] })).status === 409, 'cambiar un integrante (nombre) → 409');
    ok((await call('POST', `/torneos/${t.id}/parejas/${p0.id}/jugadores`, jug(22))).status === 409, 'plantel: agregar jugador → 409');
    ok((await call('DELETE', `/torneos/${t.id}/parejas/${p0.id}/jugadores/${p0.jugadores[0].id}`)).status === 409, 'plantel: eliminar jugador → 409');
    ok((await call('PUT', `/torneos/${t.id}/parejas/${p0.id}`, { jugadores: [{ id: p0.jugadores[0].id, email: `nuevo-${s}@test.local` }] })).status === 200, 'corregir el email (dato de contacto) sí se permite');

    // ── Reapertura ──
    est.colab = (await call('GET', `/torneos/${t.id}/inscripciones/estado`, null, colabU)).data;
    ok(est.colab.puede_reabrir === false, 'colaborador: no ve "Reabrir inscripciones"');
    ok((await call('POST', `/torneos/${t.id}/inscripciones/reabrir`, { motivo: 'Se agregó pareja faltante' }, colabU)).status === 403, 'colaborador no puede reabrir → 403');
    ok((await call('POST', `/torneos/${t.id}/inscripciones/reabrir`, { motivo: '' })).status === 400, 'reabrir sin motivo → 400');
    ok((await call('POST', `/torneos/${t.id}/inscripciones/reabrir`, { motivo: 'Se agregó pareja faltante por error administrativo.' })).status === 200, 'admin reabre con motivo');
    ok((await alta(jug(20), jug(21))).status === 201, 'con las inscripciones reabiertas el panel agrega la pareja faltante');
    const pubCerrado = await call('POST', `/public/${t.id}/inscripciones`, { jugadores: [jug(23), jug(24)], horarios_preferidos: franja }, null, true);
    ok(pubCerrado.status === 409, 'la web pública sigue cerrada (la categoría ya tiene fixture)');
    ok((await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false })).status === 200, 'rearmar zonas con la pareja nueva');
    ok((await call('GET', `/torneos/${t.id}/inscripciones/estado`)).data.cerradas === true, 'al rearmar, las inscripciones se vuelven a cerrar');

    // ── Auditoría ──
    const aud = (await call('GET', `/torneos/${t.id}/inscripciones/auditoria`)).data;
    const acciones = new Set(aud.map(a => a.accion));
    for (const a of ['inscripcion_creada', 'inscripcion_modificada', 'zonas_generadas', 'inscripciones_bloqueadas', 'inscripciones_reabiertas']) ok(acciones.has(a), `auditoría: ${a}`);
    const reab = aud.find(a => a.accion === 'inscripciones_reabiertas');
    ok(reab.usuario === 'Ana Admin' && reab.usuario_id === admin.id && reab.motivo.includes('error administrativo') && reab.createdAt, 'reapertura: usuario, fecha y motivo');
    // Baja de una inscripción (sin zona) → auditada
    const sinZona = await m.TorneoPareja.create({ torneo_id: t.id, categoria_id: 6, estado_pago: 'pendiente', horarios_preferidos: franja, monto: 0 });
    await call('PUT', `/torneos/${t.id}/parejas/${sinZona.id}/pago`, { estado_pago: 'cancelado' });
    ok((await call('GET', `/torneos/${t.id}/inscripciones/auditoria`)).data.some(a => a.accion === 'inscripcion_eliminada' && a.pareja_id === sinZona.id), 'auditoría: inscripcion_eliminada');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    if (torneoId) { const t = await m.Torneo.findByPk(torneoId); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.Collaborator.destroy({ where: { complex_id: club.id } }).catch(() => {});
    await m.TimeSlot.destroy({ where: { field_id: [c1.id] } });
    await m.Field.destroy({ where: { id: [c1.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(() => {});
    await admin.destroy().catch(() => {}); await colabU.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
