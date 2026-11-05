/**
 * tests/llaves-oficiales.e2e.js — Llaves oficiales de punta a punta (club TEMPORAL, API real).
 *
 *   npm run test:llaves:e2e
 *
 * Para 6, 7, 8 … 17 parejas: inscripción → zonas → resultados de zona → la llave se genera sola
 * al terminar las zonas → los cruces de la llave real coinciden con el reglamento usando las
 * posiciones REALES de cada zona ("1° Zona A" = quien terminó 1° en la zona A) → se juega
 * toda la llave → hay campeón y el torneo queda finalizado. Imprime cada llave generada.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
process.env.TORNEO_PUSH_JOBS = '0';

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

// Primera ronda real (sin BYE) del reglamento, por cantidad de zonas
const PRIMERA = {
  2: ['1° Zona A vs 2° Zona B', '1° Zona B vs 2° Zona A'],
  3: ['2° Zona B vs 2° Zona C', '1° Zona C vs 2° Zona A'],
  4: ['1° Zona A vs 2° Zona C', '2° Zona B vs 1° Zona D', '1° Zona C vs 2° Zona A', '2° Zona D vs 1° Zona B'],
  5: ['2° Zona B vs 2° Zona C', '2° Zona A vs 2° Zona D'],
};
// Lugares que pasan directo (BYE) y contra quién juegan en la ronda siguiente
const SEGUNDA = {
  3: ['1° Zona A vs Ganador', 'Ganador vs 1° Zona B'],
  5: ['1° Zona A vs Ganador', '1° Zona D vs 1° Zona E', '1° Zona B vs Ganador', '1° Zona C vs 2° Zona E'],
};

(async () => {
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/torneos`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Llaves', email: `lo-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `LLO TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const canchas = [];
  for (let i = 1; i <= 4; i++) canchas.push(await m.Field.create({ complex_id: club.id, nombre: `Pádel ${i}`, deporte: 'padel', activa: true }));
  const tk = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const call = async (method, path, body) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const torneos = [];
  try {
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Llaves' })).data;
    const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
    let dniN = 0;
    for (let n = 6; n <= 17; n++) {
      const t = (await call('POST', '/torneos', { nombre: `Copa ${n} parejas`, liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-13', cupo_parejas: 32, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
      torneos.push(t.id);
      await call('PUT', `/torneos/${t.id}/canchas`, { canchas: canchas.map(c => ({ field_id: c.id, disponibilidad_horaria: franja })) });
      const jug = () => { dniN++; return { nombre: `Jugador${dniN} Prueba`, dni: String(43000000 + (s % 10000) * 100 + dniN), whatsapp: `54938190${String(dniN).padStart(5, '0')}`, categoria: 5, genero: 'masculino' }; };
      for (let i = 0; i < n; i++) { const ri = await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(), jug()], horarios_preferidos: franja, pagado: true }); if (ri.status >= 300) throw new Error(JSON.stringify(ri)); }
      const gz = await call('POST', `/torneos/${t.id}/zonas/generar`, { notificar: false });
      if (gz.status >= 300) throw new Error(`zonas ${n}: ${JSON.stringify(gz)}`);

      // Zonas: resultados variados (gana la pareja de id menor o mayor según el partido)
      for (let v = 0; v < 8; v++) {
        const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
        const pend = fx.zonas.flatMap(z => z.partidos).filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id);
        if (!pend.length) break;
        for (const p of pend) await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: (p.id % 3) ? [[6, 3], [6, 4]] : [[3, 6], [4, 6]] });
      }
      const fx = (await call('GET', `/torneos/${t.id}/fixture`)).data;
      const nz = fx.zonas.length;
      ok(nz === { 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 4, 13: 4, 14: 4, 15: 5, 16: 5, 17: 5 }[n], `${n} parejas → ${nz} zonas (${fx.zonas.map(z => z.tabla.length).join('-')})`);
      ok(fx.llave.length > 0, `${n} parejas: la llave se generó al terminar las zonas`);

      // Cruces con las posiciones reales de cada zona
      const txt = (p) => `${p.pareja1?.referencia || (p.pareja1 ? '?' : 'BYE')} vs ${p.pareja2?.referencia || (p.pareja2 ? '?' : (p.es_bye ? 'BYE' : 'Ganador'))}`;
      const primera = fx.llave[0].partidos.filter(p => !p.es_bye).map(txt);
      ok(JSON.stringify(primera) === JSON.stringify(PRIMERA[nz]), `${n} parejas · ${fx.llave[0].nombre}: ${primera.join(' | ')}`);
      // La referencia corresponde a la posición real en la tabla
      const posReal = new Map(fx.zonas.flatMap(z => z.tabla.map(r => [r.pareja_id, `${r.posicion}° ${z.nombre}`])));
      const todos = fx.llave[0].partidos.flatMap(p => [p.pareja1, p.pareja2]).filter(Boolean);
      ok(todos.length === nz * 2 && todos.every(x => posReal.get(x.id) === x.referencia) && new Set(todos.map(x => x.id)).size === todos.length, `${n} parejas: los ${nz * 2} clasificados, una sola vez, con su posición real`);
      if (SEGUNDA[nz]) {
        const seg = fx.llave[1].partidos.map(p => `${p.pareja1?.referencia || 'Ganador'} vs ${p.pareja2?.referencia || 'Ganador'}`);
        ok(JSON.stringify(seg) === JSON.stringify(SEGUNDA[nz]), `${n} parejas · ${fx.llave[1].nombre}: ${seg.join(' | ')} (BYE → pasa directo)`);
      }
      if (nz === 5) ok(fx.llave[0].nombre === 'Repechaje', '5 zonas: la primera ronda se muestra como "Repechaje"');

      // Jugar toda la llave
      for (let v = 0; v < 8; v++) {
        const f = (await call('GET', `/torneos/${t.id}/fixture`)).data;
        const pend = f.llave.flatMap(r => r.partidos).filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id);
        if (!pend.length) break;
        for (const p of pend) await call('PUT', `/torneos/${t.id}/partidos/${p.id}/resultado`, { sets: [[6, 2], [6, 2]] });
      }
      const fin = (await call('GET', `/torneos/${t.id}/fixture`)).data;
      const final = fin.llave.at(-1).partidos[0];
      const sinJugar = fin.llave.flatMap(r => r.partidos).filter(p => !p.es_bye && !p.resultado);
      ok(fin.campeon && final.resultado?.ganador_id === fin.campeon && !sinJugar.length, `${n} parejas: se jugaron ${fin.llave.flatMap(r => r.partidos).filter(p => !p.es_bye).length} partidos de llave → campeón ${final.pareja1.nombre} (${final.pareja1.referencia})`);
      const estado = (await call('GET', `/torneos/${t.id}`)).data.estado;
      ok(estado === 'finalizado', `${n} parejas: torneo finalizado`);
    }
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of torneos) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.RankingPunto.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.RankingAjuste.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(e => console.error('limpieza liga', e.message));
    await m.TimeSlot.destroy({ where: { field_id: canchas.map(c => c.id) } });
    await m.Field.destroy({ where: { id: canchas.map(c => c.id) } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(e => console.error('limpieza club', e.message));
    await admin.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
