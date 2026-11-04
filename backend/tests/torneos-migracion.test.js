/**
 * tests/torneos-migracion.test.js — Backfill de la migración 057 (ligas / multi-categoría).
 *
 *   npm run test:torneos:migracion
 *
 * Revierte la 057, carga datos con el formato ANTERIOR (torneo de una categoría,
 * pareja, jugadores y ranking_jugadores), vuelve a migrar y verifica el backfill.
 * Borra los datos de prueba al final. Usar solo en una base de desarrollo.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
const { execSync } = require('child_process');
const { sequelize } = require('../src/models');

const q = (sql, r) => sequelize.query(sql, { replacements: r, type: sequelize.QueryTypes.SELECT });
const run = (sql, r) => sequelize.query(sql, { replacements: r });
let fallas = 0, total = 0;
const ok = (c, m) => { total++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fallas++; };
const cli = (cmd) => execSync(`npx sequelize-cli ${cmd}`, { stdio: 'pipe' }).toString();

(async () => {
  const s = Date.now();
  let club, owner;
  try {
    const ultima = (await q('SELECT name FROM SequelizeMeta ORDER BY name DESC LIMIT 1'))[0].name;
    if (!ultima.startsWith('20260101000057')) throw new Error(`La última migración aplicada es ${ultima}: este test solo corre con la 057 como última.`);
    cli('db:migrate:undo');
    ok(!(await q("SHOW TABLES LIKE 'torneo_ligas'")).length, 'rollback: tablas nuevas eliminadas');
    ok(!(await q("SHOW COLUMNS FROM torneos LIKE 'liga_id'")).length, 'rollback: torneos.liga_id eliminado (datos previos intactos)');

    // ── Datos con el formato anterior ──
    await run("INSERT INTO users (nombre, apellido, email, password, rol, activo, created_at, updated_at) VALUES ('Mig', 'Test', ?, 'x', 'complex_admin', 1, NOW(), NOW())", [`mig-${s}@test.local`]);
    owner = (await q('SELECT id FROM users WHERE email = ?', [`mig-${s}@test.local`]))[0].id;
    await run("INSERT INTO complexes (nombre, direccion, owner_id, activo, created_at, updated_at) VALUES (?, 'x', ?, 1, NOW(), NOW())", [`MIG ${s}`, owner]);
    club = (await q('SELECT id FROM complexes WHERE nombre = ?', [`MIG ${s}`]))[0].id;
    await run(`INSERT INTO torneos (id_tenant, nombre, deporte, categoria, genero, estado, fecha_inicio, fecha_fin, tipo, puntos_asignados, created_at, updated_at)
      VALUES (?, 'Legado', 'padel', 7, 'masculino', 'finalizado', '2025-05-01', '2025-05-02', 'anual', 1, NOW(), NOW())`, [club]);
    const torneo = (await q('SELECT id FROM torneos WHERE id_tenant = ?', [club]))[0].id;
    await run("INSERT INTO torneo_parejas (torneo_id, horarios_preferidos, estado_pago, created_at, updated_at) VALUES (?, '[]', 'pagado', NOW(), NOW())", [torneo]);
    const pareja = (await q('SELECT id FROM torneo_parejas WHERE torneo_id = ?', [torneo]))[0].id;
    await run(`INSERT INTO torneo_jugadores (pareja_id, nombre, dni, whatsapp, categoria, genero, created_at, updated_at) VALUES
      (?, 'Juan Legado', '31000001', '5493810000001', 7, 'masculino', NOW(), NOW()), (?, 'Pedro Legado', '31000002', '5493810000002', 7, 'masculino', NOW(), NOW())`, [pareja, pareja]);
    await run(`INSERT INTO ranking_jugadores (id_tenant, dni, nombre, categoria, genero, temporada, puntos, created_at, updated_at) VALUES
      (?, '31000001', 'Juan Legado', 7, 'masculino', 2025, 120, NOW(), NOW()), (?, '31000001', 'Juan Legado', 6, 'masculino', 2025, 80, NOW(), NOW()),
      (?, '31000009', 'Solo Ranking', 7, 'masculino', 2025, 40, NOW(), NOW())`, [club, club, club]);

    cli('db:migrate');

    // ── Verificación ──
    const ligas = await q('SELECT * FROM torneo_ligas WHERE id_tenant = ?', [club]);
    ok(ligas.length === 1 && ligas[0].nombre === 'Liga general', 'una "Liga general" por club');
    const t = (await q('SELECT liga_id, categoria FROM torneos WHERE id = ?', [torneo]))[0];
    ok(t.liga_id === ligas[0].id, 'torneo existente asignado a su liga (liga_id NOT NULL)');
    const tc = await q('SELECT * FROM torneo_categorias WHERE torneo_id = ?', [torneo]);
    ok(tc.length === 1 && tc[0].categoria_id === 7 && tc[0].estado === 'finalizado' && tc[0].puntos_asignados === 1, 'categoría histórica → torneo_categorias (estado y puntos)');
    ok((await q('SELECT categoria_id FROM torneo_parejas WHERE id = ?', [pareja]))[0].categoria_id === 7, 'pareja con su categoría');
    const jug = await q('SELECT dni, nombre FROM padel_jugadores WHERE id_tenant = ? ORDER BY dni', [club]);
    ok(jug.length === 3 && jug.some(j => j.dni === '31000009'), 'jugadores desde inscripciones y ranking (3 únicos por DNI)');
    ok(!(await q('SELECT 1 FROM torneo_jugadores WHERE pareja_id = ? AND jugador_id IS NULL', [pareja])).length, 'torneo_jugadores vinculados al registro único');
    const rp = await q('SELECT r.categoria_id, r.puntos, j.dni FROM ranking_puntos r JOIN padel_jugadores j ON j.id = r.jugador_id WHERE r.id_tenant = ? ORDER BY j.dni, r.categoria_id', [club]);
    ok(rp.length === 3, 'ranking_jugadores → ranking_puntos (3 acumuladores)');
    const juan = rp.filter(r => r.dni === '31000001');
    ok(juan.length === 2 && juan.find(r => r.categoria_id === 7).puntos === 120 && juan.find(r => r.categoria_id === 6).puntos === 80, 'Juan: 7ma = 120 y 6ta = 80, sin sumarse');
    ok((await q("SELECT COUNT(*) n FROM ranking_ajustes WHERE id_tenant = ? AND tipo = 'migracion'", [club]))[0].n === 3, 'migración auditada en ranking_ajustes');
    ok((await q('SELECT COUNT(*) n FROM ranking_jugadores WHERE id_tenant = ?', [club]))[0].n === 3, 'ranking_jugadores conservado (rollback)');
  } catch (err) {
    fallas++; console.error('✘ error:', err.message);
    try { cli('db:migrate'); } catch { /* ya migrada */ }
  } finally {
    if (club) {
      await run('DELETE FROM ranking_ajustes WHERE id_tenant = ?', [club]).catch(() => {});
      await run('DELETE FROM ranking_puntos WHERE id_tenant = ?', [club]).catch(() => {});
      await run('DELETE j FROM torneo_jugadores j JOIN torneo_parejas p ON p.id = j.pareja_id JOIN torneos t ON t.id = p.torneo_id WHERE t.id_tenant = ?', [club]);
      await run('DELETE p FROM torneo_parejas p JOIN torneos t ON t.id = p.torneo_id WHERE t.id_tenant = ?', [club]);
      await run('DELETE c FROM torneo_categorias c JOIN torneos t ON t.id = c.torneo_id WHERE t.id_tenant = ?', [club]).catch(() => {});
      await run('DELETE FROM torneos WHERE id_tenant = ?', [club]);
      await run('DELETE FROM padel_jugadores WHERE id_tenant = ?', [club]).catch(() => {});
      await run('DELETE FROM torneo_ligas WHERE id_tenant = ?', [club]).catch(() => {});
      await run('DELETE FROM ranking_jugadores WHERE id_tenant = ?', [club]);
      await run('DELETE FROM complexes WHERE id = ?', [club]);
    }
    if (owner) await run('DELETE FROM users WHERE id = ?', [owner]);
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    await sequelize.close();
    process.exit(fallas ? 1 : 0);
  }
})();
