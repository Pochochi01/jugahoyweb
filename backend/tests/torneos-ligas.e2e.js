/**
 * tests/torneos-ligas.e2e.js — Ligas, multi-categoría y ranking independiente.
 *
 *   npm run test:torneos
 *
 * Unitarias: validaciones del rankingService (categorías, filtros, ajustes) sin HTTP.
 * Integración por HTTP: crea un club TEMPORAL con una cancha de pádel, dos ligas,
 * dos torneos anuales (liga A con 7ma + 6ta, liga B con 7ma), los juega hasta la final
 * y verifica que los puntos quedan en acumuladores separados por liga + categoría.
 * Al final borra todo lo creado. No envía mensajes (Torneos es canal manual).
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const m = require('../src/models');
const rk = require('../src/services/torneos/rankingService');

let fallas = 0, total = 0;
const ok = (cond, msg) => { total++; console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fallas++; };
const lanza = async (fn, status) => { try { await fn(); return false; } catch (e) { return e.status === status; } };

async function unitarias() {
  console.log('— Unitarias —');
  ok(rk.nombreCat(7) === '7ma' && rk.nombreCat(1) === '1ra' && rk.nombreCat(8) === '8va', 'nombreCat: 7ma, 1ra, 8va');
  ok(JSON.stringify(await rk.validarCategorias([5, 7, 8])) === '[8,7,5]', 'validarCategorias ordena 8va → 1ra');
  ok(await lanza(() => rk.validarCategorias([]), 400), 'validarCategorias: al menos una');
  ok(await lanza(() => rk.validarCategorias([7, 7]), 400), 'validarCategorias: sin duplicados');
  ok(await lanza(() => rk.validarCategorias([9]), 400), 'validarCategorias: fuera de rango');
  let e = null; try { rk.filtroRanking({ categoria_id: 7 }); } catch (x) { e = x; }
  ok(e?.status === 400 && /liga/i.test(e.message), 'filtroRanking: la liga es obligatoria (nunca ranking global)');
  ok((() => { try { rk.filtroRanking({ liga_id: 1 }); return false; } catch (x) { return x.status === 400; } })(), 'filtroRanking: la categoría es obligatoria');
  const f = rk.filtroRanking({ liga_id: '3', categoria_id: '7', anio: '2026' });
  ok(f.liga_id === 3 && f.categoria_id === 7 && f.temporada === 2026, 'filtroRanking: normaliza liga, categoría y año');
}

(async () => {
  await unitarias();
  console.log('— Integración —');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Test', apellido: 'Torneos', email: `tl-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `TL TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const cancha = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true, hora_apertura: '08:00', hora_cierre: '23:00' });
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const anio = 2026;
  const torneoIds = [];
  try {
    // ── Ligas ──
    const A = (await call('POST', '/ligas', { nombre: 'Liga Tucumán Norte' })).data;
    const B = (await call('POST', '/ligas', { nombre: 'Liga Tucumán Sur' })).data;
    ok(A.id && B.id, 'ligas creadas');
    ok((await call('POST', '/ligas', { nombre: 'Liga Tucumán Norte' })).status === 409, 'liga duplicada → 409');

    // ── Validaciones del torneo ──
    const base = { nombre: 'Anual 1', genero: 'masculino', tipo: 'anual', fecha_inicio: `${anio}-11-10`, fecha_fin: `${anio}-11-12`, cupo_parejas: 16, parejas_por_zona: 3, clasifican_por_zona: 2 };
    ok((await call('POST', '/torneos', { ...base, categorias: [7] })).status === 400, 'torneo sin liga → 400');
    ok((await call('POST', '/torneos', { ...base, liga_id: A.id, categorias: [] })).status === 400, 'torneo sin categorías → 400');
    ok((await call('POST', '/torneos', { ...base, liga_id: A.id, categorias: [7, 7] })).status === 400, 'categorías duplicadas → 400');
    const t1 = await call('POST', '/torneos', { ...base, liga_id: A.id, categorias: [7, 6] });
    ok(t1.status === 201 && t1.data.categorias.length === 2 && t1.data.liga.nombre === 'Liga Tucumán Norte', 'torneo liga A con 7ma + 6ta');
    const t2 = await call('POST', '/torneos', { ...base, nombre: 'Anual 2', fecha_inicio: `${anio}-11-20`, fecha_fin: `${anio}-11-21`, liga_id: B.id, categorias: [7] });
    ok(t2.status === 201, 'torneo liga B con 7ma');
    torneoIds.push(t1.data.id, t2.data.id);
    // Compatibilidad: cliente viejo con `categoria` suelta
    const t3 = await call('POST', '/torneos', { ...base, nombre: 'Compat', liga_id: A.id, categoria: 5 });
    ok(t3.status === 201 && t3.data.categorias[0].categoria_id === 5, 'compatibilidad: `categoria` numérica → torneo_categorias');
    torneoIds.push(t3.data.id);

    const franja = [{ fecha: null, desde: '08:00', hasta: '23:00' }];
    for (const id of [t1.data.id, t2.data.id]) await call('PUT', `/torneos/${id}/canchas`, { canchas: [{ field_id: cancha.id, disponibilidad_horaria: franja }] });

    const jug = (n, cat) => ({ nombre: `Jugador ${n}`, dni: String(30000000 + n), whatsapp: `54938100000${String(n).padStart(2, '0')}`, categoria: cat, genero: 'masculino' });
    const pareja = (a, b, cat, categoria_id) => ({ categoria_id, jugadores: [jug(a, cat), jug(b, cat)], horarios_preferidos: [{ fecha: null, desde: '08:00', hasta: '23:00' }], pagado: true, metodo_pago: 'efectivo' });
    // Juan = jugador 1 juega 7ma en liga A, 6ta en liga A y 7ma en liga B
    ok((await call('POST', `/torneos/${t1.data.id}/parejas`, pareja(1, 2, 7))).status === 400, 'inscripción sin categoría en torneo multi-categoría → 400');
    ok((await call('POST', `/torneos/${t1.data.id}/parejas`, pareja(1, 2, 7, 5))).status === 400, 'categoría que el torneo no juega → 400');
    for (const [a, b, c] of [[1, 2, 7], [3, 4, 7]]) await call('POST', `/torneos/${t1.data.id}/parejas`, pareja(a, b, 7, c));
    for (const [a, b] of [[5, 6], [7, 8]]) await call('POST', `/torneos/${t1.data.id}/parejas`, pareja(a, b, 6, 6));
    for (const [a, b] of [[1, 3], [2, 4]]) await call('POST', `/torneos/${t2.data.id}/parejas`, pareja(a, b, 7, 7));
    const ins = (await call('GET', `/torneos/${t1.data.id}/parejas`)).data;
    ok(ins.parejas.length === 4 && ins.parejas.filter(p => p.categoria_id === 7).length === 2, 'parejas inscriptas por categoría');
    ok(ins.parejas.every(p => p.jugadores.every(j => j.jugador_id)), 'cada jugador vinculado al registro único (padel_jugadores)');

    // ── Jugadores: todos visibles con 0 puntos ──
    const todos = (await call('GET', `/jugadores?liga_id=${A.id}&categoria_id=7&temporada=${anio}`)).data;
    ok(todos.length === 8 && todos.every(j => j.puntos === 0), 'selector de jugadores: todos los registrados, con 0 puntos');

    // ── Jugar cada cuadro hasta la final ──
    const jugarCuadro = async (torneoId, categoria_id) => {
      await call('POST', `/torneos/${torneoId}/zonas/generar`, { categoria_id, notificar: false });
      for (let vuelta = 0; vuelta < 6; vuelta++) {
        const fx = (await call('GET', `/torneos/${torneoId}/fixture?categoria_id=${categoria_id}`)).data;
        const pendientes = [...fx.zonas.flatMap(z => z.partidos), ...fx.llave.flatMap(r => r.partidos)]
          .filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id);
        if (!pendientes.length) return fx;
        for (const p of pendientes) await call('PUT', `/torneos/${torneoId}/partidos/${p.id}/resultado`, { sets: [[6, 3], [6, 4]] });
      }
      return (await call('GET', `/torneos/${torneoId}/fixture?categoria_id=${categoria_id}`)).data;
    };
    const fx7 = await jugarCuadro(t1.data.id, 7);
    ok(fx7.categoria_id === 7 && fx7.categorias.find(c => c.categoria_id === 7).estado === 'finalizado', 'liga A · 7ma: cuadro finalizado');
    let estadoT1 = (await call('GET', `/torneos/${t1.data.id}`)).data;
    ok(estadoT1.estado !== 'finalizado' && estadoT1.categorias.find(c => c.categoria_id === 6).estado === 'pendiente', 'el torneo sigue abierto mientras 6ta no terminó');
    const fx6 = await jugarCuadro(t1.data.id, 6);
    ok(fx6.zonas.length === 1 && fx6.zonas.every(z => z.categoria_id === 6), 'el fixture de 6ta solo muestra zonas de 6ta');
    estadoT1 = (await call('GET', `/torneos/${t1.data.id}`)).data;
    ok(estadoT1.estado === 'finalizado' && estadoT1.puntos_asignados, 'todas las categorías finalizadas → torneo finalizado');
    await jugarCuadro(t2.data.id, 7);

    // ── Puntos independientes ──
    const juan = await m.PadelJugador.findOne({ where: { id_tenant: club.id, dni: '30000001' } });
    const acum = await m.RankingPunto.findAll({ where: { jugador_id: juan.id }, raw: true });
    const de = (liga, cat) => acum.filter(a => a.liga_id === liga && a.categoria_id === cat);
    ok(acum.length === 2 && de(A.id, 7).length === 1 && de(B.id, 7).length === 1 && de(A.id, 6).length === 0, 'Juan: acumuladores separados (A·7ma y B·7ma), sin sumarlos');
    const rA7 = (await call('GET', `/ranking?liga_id=${A.id}&categoria_id=7&temporada=${anio}`)).data;
    const rB7 = (await call('GET', `/ranking?liga_id=${B.id}&categoria_id=7&temporada=${anio}`)).data;
    const rA6 = (await call('GET', `/ranking?liga_id=${A.id}&categoria_id=6&temporada=${anio}`)).data;
    ok(rA7.jugadores.length === 4 && rB7.jugadores.length === 4 && rA6.jugadores.length === 4, 'cada ranking solo trae los jugadores de su combinación');
    ok(rA7.jugadores[0].puntos === 100 && rA7.jugadores.at(-1).puntos === 70, 'liga A · 7ma: campeones 100, finalistas 70');
    ok(!rA6.jugadores.some(j => j.dni === '30000001'), 'Juan no aparece en liga A · 6ta (no la jugó)');
    ok((await call('GET', `/ranking?categoria_id=7&temporada=${anio}`)).status === 400, 'ranking sin liga → 400 (nunca global)');
    ok((await call('GET', `/ranking?liga_id=${A.id}&categoria_id=7&temporada=${anio - 1}`)).data.jugadores.length === 0, 'otro año → ranking vacío (no mezcla años)');
    const audTorneo = await m.RankingAjuste.count({ where: { id_tenant: club.id, tipo: 'torneo' } });
    ok(audTorneo === 12, 'cada punto de torneo quedó auditado (12 jugadores-cuadro)');
    ok((await call('PUT', `/torneos/${t1.data.id}/partidos/${fx7.llave.at(-1).partidos[0].id}/resultado`, { sets: [[6, 0], [6, 0]] })).status === 409, 'final con puntos ya asignados → no se puede re-cargar');

    // ── Ajuste manual con auditoría ──
    const antes = rA7.jugadores.find(j => j.dni === '30000001').puntos;
    const aj = await call('POST', '/ranking/ajustes', { jugador_id: juan.id, liga_id: A.id, categoria_id: 7, genero: 'masculino', temporada: anio, tipo: 'sumar', puntos: 15, motivo: 'Puntos históricos de liga en curso' });
    ok(aj.status === 201 && aj.data.anterior === antes && aj.data.nuevo === antes + 15, 'ajuste manual: sumar');
    ok((await call('POST', '/ranking/ajustes', { jugador_id: juan.id, liga_id: A.id, categoria_id: 7, genero: 'masculino', temporada: anio, tipo: 'restar', puntos: 9999, motivo: 'error de carga' })).status === 400, 'no se puede dejar puntaje negativo');
    ok((await call('POST', '/ranking/ajustes', { jugador_id: juan.id, liga_id: A.id, categoria_id: 7, genero: 'masculino', temporada: anio, tipo: 'fijar', puntos: 50, motivo: '' })).status === 400, 'el motivo es obligatorio');
    await call('POST', '/ranking/ajustes', { jugador_id: juan.id, liga_id: A.id, categoria_id: 7, genero: 'masculino', temporada: anio, tipo: 'fijar', puntos: 50, motivo: 'Corrección de planilla' });
    const nuevoJug = await call('POST', '/ranking/ajustes', { dni: '40111222', nombre: 'Histórico Pérez', liga_id: B.id, categoria_id: 7, genero: 'masculino', temporada: anio, tipo: 'fijar', puntos: 200, motivo: 'Alta con puntos de liga en curso' });
    ok(nuevoJug.status === 201 && nuevoJug.data.nuevo === 200, 'alta de jugador nuevo con puntos históricos');
    const hist = (await call('GET', `/ranking/ajustes?jugador_id=${juan.id}&liga_id=${A.id}&categoria_id=7`)).data;
    ok(hist.length === 3 && hist[0].tipo === 'fijar' && hist[0].puntos_anterior === antes + 15 && hist[0].puntos_nuevo === 50 && hist[0].usuario && hist[0].motivo, 'historial con usuario, anterior, nuevo y motivo');
    const juanB = (await m.RankingPunto.findOne({ where: { jugador_id: juan.id, liga_id: B.id, categoria_id: 7 } })).puntos;
    ok(juanB === de(B.id, 7)[0].puntos, 'el ajuste en liga A no tocó liga B');
    const unicos = await m.sequelize.query('SELECT jugador_id, liga_id, categoria_id, genero, temporada, COUNT(*) n FROM ranking_puntos WHERE id_tenant = ? GROUP BY 1,2,3,4,5 HAVING n > 1', { replacements: [club.id], type: m.sequelize.QueryTypes.SELECT });
    ok(unicos.length === 0, 'sin duplicados por combinación (índice único)');
    let dup = null; try { await m.RankingPunto.create({ id_tenant: club.id, jugador_id: juan.id, liga_id: A.id, categoria_id: 7, genero: 'masculino', temporada: anio, puntos: 1 }); } catch (x) { dup = x.name; }
    ok(dup === 'SequelizeUniqueConstraintError', 'la BD rechaza un acumulador duplicado');

    // ── Edición de categorías ──
    ok((await call('PUT', `/torneos/${t3.data.id}`, { categorias: [5, 4] })).data.categorias.length === 2, 'agregar categoría a un torneo sin fixture');
    await call('POST', `/torneos/${t3.data.id}/parejas`, pareja(11, 12, 4, 4));
    ok((await call('PUT', `/torneos/${t3.data.id}`, { categorias: [5] })).status === 409, 'no se quita una categoría con parejas');
    ok((await call('PUT', `/torneos/${t1.data.id}`, { liga_id: B.id })).status === 409, 'no se cambia la liga con puntos asignados');
  } catch (err) {
    fallas++; console.error('✘ error inesperado:', err);
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of torneoIds) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza torneo', e.message)); }
    await m.RankingAjuste.destroy({ where: { id_tenant: club.id } });
    await m.RankingPunto.destroy({ where: { id_tenant: club.id } });
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
