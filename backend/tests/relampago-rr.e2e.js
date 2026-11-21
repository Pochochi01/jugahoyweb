/**
 * tests/relampago-rr.e2e.js — Relámpago Todos contra Todos por Zonas por la API real (club TEMPORAL).
 *   npm run test:relampago:rr:e2e
 *
 * Para 4, 5, 8, 9, 12, 13, 17 y 21 parejas: zonas de 4/5, todos contra todos, sorteo auditado en cada
 * zona de 5, partido compensatorio marcado, 3 partidos puntuables por pareja. Con 13 parejas se juegan
 * todas las zonas: tabla (la sorteada no suma el compensatorio, el rival sí) y paso a la llave.
 * Además: "Relámpago con Zonas y Llaves APA" (código 'relampago') sigue armando zonas de 4 con cruces APA.
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
  const admin = await m.User.create({ nombre: 'Rocío', apellido: 'Rueda', email: `rr-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `RR TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const canchas = [];
  for (let i = 1; i <= 4; i++) canchas.push(await m.Field.create({ complex_id: club.id, nombre: `Pádel ${i}`, deporte: 'padel', activa: true }));
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '20m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const ids = [];
  let n = 0;
  const jug = () => { n++; return { nombre: `Jugador${n} Rueda`, dni: String(52000000 + (s % 1000) * 1000 + n), whatsapp: `549381${sfx}${String(n).padStart(3, '0')}`.slice(0, 15), email: `rr${n}-${s}@test.local`, categoria: 5, genero: 'masculino' }; };
  const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
  const formato = { zonas: { tipo: 'un_set', games: 4, tiebreak: 7 }, cuartos: { tipo: 'un_set', games: 6, tiebreak: 7 }, semifinal: { tipo: 'un_set', games: 6, tiebreak: 7 }, final: { tipo: 'un_set', games: 6, tiebreak: 7 } };
  let liga;
  const crear = async (cant, modalidad = 'relampago_rr') => {
    const t = (await call('POST', '/torneos', { nombre: `RR ${cant}`, liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', formato: modalidad, formato_partidos: formato, fecha_inicio: '2026-12-10', fecha_fin: '2026-12-12', cupo_parejas: 32, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 30, descanso_minimo: 0 })).data;
    ids.push(t.id);
    await call('PUT', `/torneos/${t.id}/canchas`, { canchas: canchas.map(c => ({ field_id: c.id, disponibilidad_horaria: franja })) });
    for (let i = 0; i < cant; i++) {
      const r = await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(), jug()], horarios_preferidos: franja, pagado: true });
      if (r.status !== 201) throw new Error(`alta pareja: ${r.status} ${r.data?.message}`);
    }
    return t;
  };
  try {
    liga = (await call('POST', '/ligas', { nombre: 'Liga RR' })).data;
    const ESPERADO = { 4: '4', 5: '5', 8: '4+4', 9: '5+4', 12: '4+4+4', 13: '5+4+4', 17: '5+4+4+4', 21: '5+4+4+4+4' };
    let t13;
    for (const [cant, tam] of Object.entries(ESPERADO)) {
      const t = await crear(Number(cant));
      ok(t.formato === 'relampago_rr' && t.parejas_por_zona === 4, `${cant}: torneo creado con la modalidad nueva (zonas de 4)`);
      const prev = (await call('POST', `/torneos/${t.id}/zonas/preview`, {})).data;
      ok(prev.modalidad === 'Relámpago Todos contra Todos por Zonas' && prev.todos_contra_todos.zonas_de_5 === (tam.match(/5/g) || []).length, `${cant}: vista previa con ${prev.todos_contra_todos?.zonas_de_5} zona(s) de 5`);
      const gz = await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
      if (gz.status !== 200) { ok(false, `${cant}: generar zonas (${gz.status} ${gz.data?.message})`); continue; }
      const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
      const tamanios = fx.zonas.map(z => z.tabla.length).sort((a, b) => b - a).join('+');
      ok(tamanios === tam, `${cant} parejas → zonas ${tamanios}`);
      let equilibrio = true, sorteosOk = true;
      for (const z of fx.zonas) {
        const k = z.tabla.length;
        const comp = z.partidos.filter(p => p.compensatorio);
        const esperados = k === 5 ? 8 : (k * (k - 1)) / 2;
        if (z.partidos.length !== esperados || comp.length !== (k === 5 ? 1 : 0)) equilibrio = false;
        const puntuables = new Map();
        for (const p of z.partidos) {
          if (p.puntua_pareja1) puntuables.set(p.pareja1.id, (puntuables.get(p.pareja1.id) || 0) + 1);
          if (p.puntua_pareja2) puntuables.set(p.pareja2.id, (puntuables.get(p.pareja2.id) || 0) + 1);
        }
        if (![...puntuables.values()].every(v => v === k - 1 - (k === 5 ? 1 : 0)) || puntuables.size !== k) equilibrio = false;
        if (k === 5) {
          const c = comp[0];
          if (!(z.pareja_sorteada_id && c.pareja2.id === z.pareja_sorteada_id && !c.puntua_pareja2 && c.puntua_pareja1 && c.pareja1.id === z.sorteo.rival_id
            && z.sorteo.semilla && z.sorteo.usuario === 'Rocío Rueda' && z.sorteo.fecha && z.tabla.find(r => r.pareja_id === z.pareja_sorteada_id)?.pareja_sorteada)) sorteosOk = false;
        } else if (z.pareja_sorteada_id) sorteosOk = false;
      }
      ok(equilibrio, `${cant}: todos contra todos, ${tam.includes('5') ? '8 partidos en la zona de 5 (1 compensatorio), ' : ''}cada pareja con ${3} partidos puntuables`);
      ok(sorteosOk, `${cant}: sorteo auditado (sorteada, rival, semilla, fecha, usuario) solo en zonas de 5`);
      if (cant === '13') t13 = t;
    }

    // ── Edición con el fixture armado (zonas sin resultados) ──
    const ed = async (body) => call('PUT', `/torneos/${t13.id}`, body);
    const e1 = await ed({ tipo: 'anual' });
    ok(e1.status === 200 && e1.data.tipo === 'anual' && e1.data.aviso, `zonas armadas: cambiar el tipo de torneo → 200 con aviso (${e1.status} ${e1.data?.message || ''})`);
    const e2 = await ed({ formato: 'relampago' });
    ok(e2.status === 200 && e2.data.formato === 'relampago' && /rearmalas/.test(e2.data.aviso || ''), 'zonas armadas sin resultados: cambiar la modalidad → 200 + "rearmá las zonas"');
    ok((await ed({ formato: 'relampago_rr', tipo: 'unico' })).status === 200, 'y volver a la modalidad todos contra todos');
    ok((await call('POST', `/torneos/${t13.id}/zonas/generar`, { notificar: false })).status === 200, 'rearmar zonas con la modalidad restaurada');
    ok((await ed({ genero: 'femenino' })).status === 409, 'el género sigue fijo con el fixture armado → 409');

    // ── 13 parejas: jugar las zonas y pasar a la llave ──
    const put = (p, body) => call('PUT', `/torneos/${t13.id}/partidos/${p.id}/resultado`, body);
    let fx = (await call('GET', `/torneos/${t13.id}/fixture`)).data;
    const z5 = fx.zonas.find(z => z.tabla.length === 5);
    const S = z5.pareja_sorteada_id;
    for (const z of fx.zonas) for (const p of z.partidos) {
      // La sorteada gana todos sus partidos (también el compensatorio); el resto gana la pareja 1
      const ganaDos = p.pareja2.id === S;
      const r = await put(p, { sets: [ganaDos ? [1, 4] : [4, 1]] });
      if (r.status !== 200) throw new Error(`resultado ${r.status} ${r.data?.message}`);
    }
    fx = (await call('GET', `/torneos/${t13.id}/fixture`)).data;
    const tabla5 = fx.zonas.find(z => z.zona_id === z5.zona_id).tabla;
    const filaS = tabla5.find(r => r.pareja_id === S);
    const comp = z5.partidos.find(p => p.compensatorio);
    const filaR = tabla5.find(r => r.pareja_id === comp.pareja1.id);
    ok(filaS.pj === 3 && filaS.puntos <= 6 && filaS.gf + filaS.gc === 15, `sorteada: el compensatorio no suma (PJ ${filaS.pj}, ${filaS.puntos} pts, games ${filaS.gf}-${filaS.gc})`);
    ok(filaR.pj === 3, `rival: el compensatorio sí cuenta (PJ ${filaR.pj}, ${filaR.puntos} pts)`);
    ok(fx.zonas.every(z => z.tabla.every(r => r.pj === 3)), 'todas las parejas con 3 partidos computados');
    ok(fx.llave?.length > 0 && fx.llave.flatMap(r => r.partidos).some(p => p.pareja1 || p.pareja2), `llave armada al terminar las zonas (${fx.llave.map(r => r.ronda).join(', ')})`);
    ok((await ed({ formato: 'relampago' })).status === 409, 'con resultados cargados la modalidad ya no se cambia → 409');
    ok((await ed({ clasifican_por_zona: 1 })).status === 409, 'con resultados cargados los clasificados ya no se cambian → 409');
    ok((await ed({ tipo: 'anual' })).status === 200, 'el tipo de torneo sí (todavía no hay puntos asignados)');
    const clasificados = new Set(fx.llave.flatMap(r => r.partidos).flatMap(p => [p.pareja1?.id, p.pareja2?.id]).filter(Boolean));
    const esperados = fx.zonas.flatMap(z => z.tabla.filter(r => r.posicion <= 2).map(r => r.pareja_id));
    ok(esperados.every(id => clasificados.has(id)), 'los 2 primeros de cada zona (de 4 y de 5) están en la llave');

    // ── Flujo reportado: torneo APA con zonas armadas → pasar a Todos contra Todos → "Ver nueva distribución" ──
    const tCambio = await crear(9, 'relampago');
    await call('POST', `/torneos/${tCambio.id}/zonas/generar`, { notificar: false });
    const antesCambio = (await call('GET', `/torneos/${tCambio.id}/fixture`)).data;
    const cambio = await call('PUT', `/torneos/${tCambio.id}`, { formato: 'relampago_rr' });
    ok(cambio.status === 200 && cambio.data.formato === 'relampago_rr' && cambio.data.parejas_por_zona === 4, `APA (${antesCambio.zonas.map(z => z.tabla.length).join('+')}) → modalidad todos contra todos guardada (${cambio.status} ${cambio.data?.message || ''})`);
    const prevCambio = (await call('POST', `/torneos/${tCambio.id}/zonas/preview`, {})).data;
    ok(prevCambio.modalidad === 'Relámpago Todos contra Todos por Zonas' && prevCambio.zonas.map(z => z.parejas.length).join('+') === '5+4' && prevCambio.todos_contra_todos?.zonas_de_5 === 1,
      `nueva distribución con la modalidad nueva: ${prevCambio.zonas.map(z => z.parejas.length).join('+')} (${prevCambio.modalidad})`);
    const rearmada = await call('POST', `/torneos/${tCambio.id}/zonas/generar`, { notificar: false, firma: prevCambio.firma });
    const fCambio = (await call('GET', `/torneos/${tCambio.id}/fixture`)).data;
    const z5c = fCambio.zonas.find(z => z.tabla.length === 5), z4c = fCambio.zonas.find(z => z.tabla.length === 4);
    ok(rearmada.status === 200 && z5c?.partidos.length === 8 && z5c.partidos.filter(p => p.compensatorio).length === 1 && z4c?.partidos.length === 6 && z4c.partidos.every(p => !p.perdedor_partido_id),
      'al rearmar: todos contra todos (zona de 4: 6 partidos; zona de 5: 8 con 1 compensatorio), sin cruces APA');

    // ── La modalidad APA sigue igual ──
    const tApa = await crear(8, 'relampago');
    await call('POST', `/torneos/${tApa.id}/zonas/generar`, { notificar: false });
    const fApa = (await call('GET', `/torneos/${tApa.id}/fixture`)).data;
    ok(tApa.formato === 'relampago' && fApa.zonas.length === 2 && fApa.zonas.every(z => z.partidos.length === 4 && !z.pareja_sorteada_id && !z.partidos.some(p => p.compensatorio)),
      `"Relámpago con Zonas y Llaves APA" (8 parejas → 2 zonas de 4 con cruces APA, 4 partidos): sin cambios (${fApa.zonas.map(z => z.partidos.length).join('/')} partidos)`);
    ok((await call('POST', '/torneos', { nombre: 'X', liga_id: liga.id, categorias: [5], genero: 'masculino', formato: 'rayo', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-10' })).status === 400, 'modalidad inexistente → 400');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of ids) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.TimeSlot.destroy({ where: { field_id: canchas.map(c => c.id) } });
    await m.Field.destroy({ where: { id: canchas.map(c => c.id) } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(() => {});
    await admin.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
