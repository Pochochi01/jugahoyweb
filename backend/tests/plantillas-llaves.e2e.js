/**
 * tests/plantillas-llaves.e2e.js — Plantillas de llaves desde administración (club TEMPORAL).
 *
 *   npm run test:llaves:plantillas
 *
 * Solo el Administrador General gestiona plantillas; una plantilla inválida no se guarda;
 * una plantilla del club tiene prioridad sobre la oficial y cambia la llave generada;
 * desactivarla vuelve al formato oficial; fuera de su rango de parejas no se aplica.
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
  const admin = await m.User.create({ nombre: 'Admin', apellido: 'Club', email: `pl-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const general = await m.User.create({ nombre: 'Admin', apellido: 'General', email: `pg-${s}@test.local`, password: 'x', rol: 'general_admin', activo: true });
  const club = await m.Complex.create({ nombre: `PL TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const c1 = await m.Field.create({ complex_id: club.id, nombre: 'Pádel 1', deporte: 'padel', activa: true });
  const tok = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const call = async (method, path, body, u = general) => {
    const r = await fetch(`${base}/club/${club.id}${path}`, { method, headers: { Authorization: `Bearer ${tok(u)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const plantillaIds = [];
  const torneos = [];
  try {
    // Plantilla del club para 2 zonas: semifinales 1°A vs 2°A… inválida (misma zona) → luego una válida invertida
    const invalida = { name: 'Inválida', alcance: 'club', zones: 2, clasifican: 2, template_json: { rondas: {
      semifinal: [{ key: 'semifinal-1', local: '1A', visitante: '2A', siguiente: { key: 'final-1', slot: 1 } }, { key: 'semifinal-2', local: '1B', visitante: '2B', siguiente: { key: 'final-1', slot: 2 } }],
      final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }] } } };
    const valida = { name: `Club ${s} · 2 zonas cruzadas`, alcance: 'club', zones: 2, clasifican: 2, min_pairs: 6, max_pairs: 7, template_json: { rondas: {
      semifinal: [{ key: 'semifinal-1', local: '2B', visitante: '1A', siguiente: { key: 'final-1', slot: 1 } }, { key: 'semifinal-2', local: '2A', visitante: '1B', siguiente: { key: 'final-1', slot: 2 } }],
      final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }] } } };

    ok((await call('GET', '/bracket-templates', null, admin)).status === 403, 'administrador del club → 403');
    const cat = await call('GET', '/bracket-templates');
    ok(cat.status === 200 && cat.data.internas.length === 9 && cat.data.internas[0].rondas[0].partidos[0].cruce === '1° Zona A vs 2° Zona B', 'catálogo: 9 formatos oficiales con sus cruces');
    const pr = await call('POST', '/bracket-templates/probar', invalida);
    ok(pr.status === 200 && !pr.data.valida && pr.data.errores.some(e => /misma zona/.test(e)), 'probar: detecta cruce de la misma zona');
    const mal = await call('POST', '/bracket-templates', invalida);
    ok(mal.status === 400 && mal.data.errores?.length, 'guardar una plantilla inválida → 400 con errores');
    const pv = await call('POST', '/bracket-templates/probar', valida);
    ok(pv.data.valida && pv.data.partidos_a_jugar === 3, 'probar: plantilla válida (3 partidos)');
    const cr = await call('POST', '/bracket-templates', valida);
    plantillaIds.push(cr.data?.id);
    ok(cr.status === 201 && cr.data.id_tenant === club.id, 'plantilla del club guardada');

    // Torneo de 6 parejas: usa la plantilla del club
    const liga = (await call('POST', '/ligas', { nombre: 'Liga Plantillas' })).data;
    const franja = [{ fecha: null, desde: '08:00', hasta: '23:59' }];
    let n = 0;
    const jug = () => { n++; return { nombre: `Jugador${n} Plantilla`, dni: String(45000000 + (s % 10000) * 100 + n), whatsapp: `54938170${String(n).padStart(5, '0')}`, categoria: 5, genero: 'masculino' }; };
    const crear = async (parejas) => {
      const t = (await call('POST', '/torneos', { nombre: `Copa ${parejas}`, liga_id: liga.id, categorias: [5], genero: 'masculino', tipo: 'unico', fecha_inicio: '2026-12-10', fecha_fin: '2026-12-12', cupo_parejas: 16, parejas_por_zona: 3, clasifican_por_zona: 2, duracion_partido: 60, descanso_minimo: 0 })).data;
      torneos.push(t.id);
      await call('PUT', `/torneos/${t.id}/canchas`, { canchas: [{ field_id: c1.id, disponibilidad_horaria: franja }] });
      for (let i = 0; i < parejas; i++) await call('POST', `/torneos/${t.id}/parejas`, { jugadores: [jug(), jug()], horarios_preferidos: franja, pagado: true });
      return t;
    };
    const semis = (fx) => fx.llave_prevista.rondas[0].partidos.map(p => `${p.pareja1.nombre} vs ${p.pareja2.nombre}`).join(' | ');
    const t6 = await crear(6);
    let fx = (await call('GET', `/torneos/${t6.id}/fixture`)).data;
    ok(semis(fx) === '2° Zona B vs 1° Zona A | 2° Zona A vs 1° Zona B', `6 parejas → plantilla del club: ${semis(fx)}`);
    const t8 = await crear(8);
    fx = (await call('GET', `/torneos/${t8.id}/fixture`)).data;
    ok(semis(fx) === '1° Zona A vs 2° Zona B | 1° Zona B vs 2° Zona A', `8 parejas (fuera del rango 6–7) → formato oficial: ${semis(fx)}`);

    // La llave real respeta la plantilla
    await call('POST', `/torneos/${t6.id}/zonas/generar`, { notificar: false });
    for (let v = 0; v < 4; v++) {
      const f = (await call('GET', `/torneos/${t6.id}/fixture`)).data;
      const pend = f.zonas.flatMap(z => z.partidos).filter(p => !p.es_bye && !p.resultado && p.pareja1?.id && p.pareja2?.id);
      if (!pend.length) break;
      for (const p of pend) await call('PUT', `/torneos/${t6.id}/partidos/${p.id}/resultado`, { sets: [[6, 3], [6, 4]] });
    }
    fx = (await call('GET', `/torneos/${t6.id}/fixture`)).data;
    const real = fx.llave[0].partidos.map(p => `${p.pareja1.referencia} vs ${p.pareja2.referencia}`).join(' | ');
    ok(real === '2° Zona B vs 1° Zona A | 2° Zona A vs 1° Zona B', `llave real con la plantilla del club: ${real}`);

    // Desactivar → vuelve el formato oficial
    const off = await call('PUT', `/bracket-templates/${cr.data.id}/activa`, { active: false });
    ok(off.status === 200 && off.data.active === false, 'plantilla desactivada');
    const t6b = await crear(6);
    fx = (await call('GET', `/torneos/${t6b.id}/fixture`)).data;
    ok(semis(fx) === '1° Zona A vs 2° Zona B | 1° Zona B vs 2° Zona A', 'desactivada → formato oficial');
    const ed = await call('PUT', `/bracket-templates/${cr.data.id}`, { ...valida, name: 'Renombrada', active: true });
    ok(ed.status === 200 && ed.data.name === 'Renombrada' && ed.data.active, 'editar plantilla');
    ok((await call('PUT', '/bracket-templates/999999', valida)).status === 404, 'editar inexistente → 404');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const svc = require('../src/services/torneos/torneoService');
    for (const id of torneos) { const t = await m.Torneo.findByPk(id); if (t) await svc.eliminarTorneo(t).catch(e => console.error('limpieza', e.message)); }
    await m.TournamentBracketTemplate.destroy({ where: { id_tenant: club.id } });
    await require('../src/services/brackets/bracketService').cargarPlantillas();
    await m.PadelJugador.destroy({ where: { id_tenant: club.id } });
    await m.TorneoLiga.destroy({ where: { id_tenant: club.id } }).catch(() => {});
    await m.TimeSlot.destroy({ where: { field_id: [c1.id] } });
    await m.Field.destroy({ where: { id: [c1.id] } });
    await m.sequelize.query('DELETE FROM complexes WHERE id = ?', { replacements: [club.id] }).catch(e => console.error('limpieza club', e.message));
    await admin.destroy().catch(() => {});
    await general.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
