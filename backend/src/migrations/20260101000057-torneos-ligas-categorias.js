'use strict';
/**
 * Torneos de pádel: ligas, multi-categoría y ranking independiente por liga.
 *
 *  - torneo_ligas: ligas del club. Cada torneo pertenece a UNA liga (torneos.liga_id NOT NULL).
 *  - padel_categorias: catálogo 1ª–8ª (id = número de categoría, compatible con el TINYINT histórico).
 *  - torneo_categorias: un torneo juega 1..N categorías; cada una arma su propio cuadro
 *    (estado y puntos_asignados por categoría). parejas / zonas / partidos llevan categoria_id.
 *  - padel_jugadores: registro único de jugadores por club (DNI). torneo_jugadores.jugador_id.
 *  - ranking_puntos: acumulador único por jugador + liga + categoría + género + temporada.
 *  - ranking_ajustes: auditoría de TODO cambio de puntos (torneo o ajuste manual).
 *
 * Backfill: una "Liga general" por club con torneos/ranking; torneos → su liga; categoría
 * histórica → torneo_categorias; jugadores desde inscripciones y ranking; ranking_jugadores →
 * ranking_puntos (con un ajuste "migracion" en la auditoría).
 * ranking_jugadores NO se borra (rollback / consulta histórica).
 */
const NOMBRES = { 1: '1ra', 2: '2da', 3: '3ra', 4: '4ta', 5: '5ta', 6: '6ta', 7: '7ma', 8: '8va' };
const ts = (S) => ({
  created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
});

module.exports = {
  async up(qi, S) {
    const q = (sql, r) => qi.sequelize.query(sql, { replacements: r });
    const tablas = await qi.showAllTables();
    const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true };
    const fk = (model, extra = {}) => ({ type: S.INTEGER, allowNull: false, references: { model, key: 'id' }, onUpdate: 'CASCADE', ...extra });
    const addCol = async (tabla, col, def) => { const c = await qi.describeTable(tabla); if (!c[col]) await qi.addColumn(tabla, col, def); };

    // ── Catálogos ──
    if (!tablas.includes('torneo_ligas')) {
      await qi.createTable('torneo_ligas', {
        id, id_tenant: fk('complexes', { onDelete: 'CASCADE' }),
        nombre: { type: S.STRING(100), allowNull: false },
        estado: { type: S.ENUM('activa', 'inactiva'), allowNull: false, defaultValue: 'activa' },
        ...ts(S),
      });
      await qi.addIndex('torneo_ligas', ['id_tenant', 'nombre'], { unique: true, name: 'uq_liga_nombre' });
    }
    if (!tablas.includes('padel_categorias')) {
      await qi.createTable('padel_categorias', {
        id: { type: S.TINYINT, primaryKey: true },
        nombre: { type: S.STRING(20), allowNull: false },
        estado: { type: S.ENUM('activa', 'inactiva'), allowNull: false, defaultValue: 'activa' },
      });
      await qi.bulkInsert('padel_categorias', Object.entries(NOMBRES).map(([n, nombre]) => ({ id: Number(n), nombre, estado: 'activa' })));
    }

    // ── Torneo → liga + categorías ──
    await addCol('torneos', 'liga_id', { type: S.INTEGER, allowNull: true, references: { model: 'torneo_ligas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' });
    if (!tablas.includes('torneo_categorias')) {
      await qi.createTable('torneo_categorias', {
        id, torneo_id: fk('torneos', { onDelete: 'CASCADE' }),
        categoria_id: { type: S.TINYINT, allowNull: false, references: { model: 'padel_categorias', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        estado: { type: S.ENUM('pendiente', 'zonas', 'llaves', 'finalizado'), allowNull: false, defaultValue: 'pendiente' },
        puntos_asignados: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        ...ts(S),
      });
      await qi.addIndex('torneo_categorias', ['torneo_id', 'categoria_id'], { unique: true, name: 'uq_torneo_categoria' });
    }
    // Cuadro por categoría
    for (const t of ['torneo_parejas', 'torneo_zonas', 'torneo_partidos']) {
      await addCol(t, 'categoria_id', { type: S.TINYINT, allowNull: true, references: { model: 'padel_categorias', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' });
    }

    // ── Jugadores ──
    if (!tablas.includes('padel_jugadores')) {
      await qi.createTable('padel_jugadores', {
        id, id_tenant: fk('complexes', { onDelete: 'CASCADE' }),
        dni: { type: S.STRING(15), allowNull: false }, nombre: { type: S.STRING(150), allowNull: false },
        whatsapp: S.STRING(30), email: S.STRING(150),
        genero: { type: S.ENUM('masculino', 'femenino'), allowNull: true },
        categoria_actual: { type: S.TINYINT, allowNull: true },
        ...ts(S),
      });
      await qi.addIndex('padel_jugadores', ['id_tenant', 'dni'], { unique: true, name: 'uq_padel_jugador_dni' });
      await qi.addIndex('padel_jugadores', ['id_tenant', 'nombre'], { name: 'idx_padel_jugador_nombre' });
    }
    await addCol('torneo_jugadores', 'jugador_id', { type: S.INTEGER, allowNull: true, references: { model: 'padel_jugadores', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' });

    // ── Ranking ──
    if (!tablas.includes('ranking_puntos')) {
      await qi.createTable('ranking_puntos', {
        id, id_tenant: fk('complexes', { onDelete: 'CASCADE' }),
        jugador_id: fk('padel_jugadores', { onDelete: 'CASCADE' }),
        liga_id: fk('torneo_ligas', { onDelete: 'RESTRICT' }),
        categoria_id: { type: S.TINYINT, allowNull: false, references: { model: 'padel_categorias', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        genero: { type: S.ENUM('masculino', 'femenino', 'mixto'), allowNull: false },
        temporada: { type: S.SMALLINT, allowNull: false },
        puntos: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        ...ts(S),
      });
      await qi.addIndex('ranking_puntos', ['jugador_id', 'liga_id', 'categoria_id', 'genero', 'temporada'], { unique: true, name: 'uq_ranking_combinacion' });
      await qi.addIndex('ranking_puntos', ['liga_id', 'categoria_id', 'temporada', 'genero', 'puntos'], { name: 'idx_ranking_liga_categoria' });
    }
    if (!tablas.includes('ranking_ajustes')) {
      await qi.createTable('ranking_ajustes', {
        id, id_tenant: fk('complexes', { onDelete: 'CASCADE' }),
        ranking_id: { type: S.INTEGER, allowNull: true, references: { model: 'ranking_puntos', key: 'id' }, onDelete: 'SET NULL' },
        jugador_id: { type: S.INTEGER, allowNull: false }, liga_id: { type: S.INTEGER, allowNull: false },
        categoria_id: { type: S.TINYINT, allowNull: false }, genero: { type: S.STRING(10), allowNull: false }, temporada: { type: S.SMALLINT, allowNull: false },
        puntos_anterior: { type: S.INTEGER, allowNull: false }, puntos_nuevo: { type: S.INTEGER, allowNull: false },
        tipo: { type: S.ENUM('fijar', 'sumar', 'restar', 'torneo', 'migracion', 'baja'), allowNull: false },
        motivo: { type: S.STRING(255), allowNull: true },
        torneo_id: { type: S.INTEGER, allowNull: true },
        usuario_id: S.INTEGER, usuario: S.STRING(150),
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('ranking_ajustes', ['id_tenant', 'created_at'], { name: 'idx_ajustes_tenant' });
      await qi.addIndex('ranking_ajustes', ['jugador_id', 'liga_id', 'categoria_id'], { name: 'idx_ajustes_combinacion' });
    }

    // ── Backfill ──
    // Liga general para cada club con torneos o ranking
    await q(`INSERT IGNORE INTO torneo_ligas (id_tenant, nombre, estado, created_at, updated_at)
      SELECT DISTINCT id_tenant, 'Liga general', 'activa', NOW(), NOW() FROM
        (SELECT id_tenant FROM torneos UNION SELECT id_tenant FROM ranking_jugadores) x`);
    await q(`UPDATE torneos t JOIN torneo_ligas l ON l.id_tenant = t.id_tenant AND l.nombre = 'Liga general'
      SET t.liga_id = l.id WHERE t.liga_id IS NULL`);
    await q(`INSERT IGNORE INTO torneo_categorias (torneo_id, categoria_id, estado, puntos_asignados, created_at, updated_at)
      SELECT id, categoria,
        CASE estado WHEN 'zonas' THEN 'zonas' WHEN 'llaves' THEN 'llaves' WHEN 'finalizado' THEN 'finalizado' ELSE 'pendiente' END,
        puntos_asignados, NOW(), NOW() FROM torneos`);
    await q('UPDATE torneo_parejas p JOIN torneos t ON t.id = p.torneo_id SET p.categoria_id = t.categoria WHERE p.categoria_id IS NULL');
    await q('UPDATE torneo_zonas z JOIN torneos t ON t.id = z.torneo_id SET z.categoria_id = t.categoria WHERE z.categoria_id IS NULL');
    await q('UPDATE torneo_partidos m JOIN torneos t ON t.id = m.torneo_id SET m.categoria_id = t.categoria WHERE m.categoria_id IS NULL');

    // Jugadores (el dato más reciente gana) desde inscripciones y ranking
    await q(`INSERT INTO padel_jugadores (id_tenant, dni, nombre, whatsapp, email, genero, categoria_actual, created_at, updated_at)
      SELECT t.id_tenant, j.dni, j.nombre, j.whatsapp, j.email, j.genero, j.categoria, NOW(), NOW()
      FROM torneo_jugadores j JOIN torneo_parejas p ON p.id = j.pareja_id JOIN torneos t ON t.id = p.torneo_id
      ORDER BY j.id
      ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), whatsapp = VALUES(whatsapp), email = COALESCE(VALUES(email), padel_jugadores.email),
        genero = VALUES(genero), categoria_actual = VALUES(categoria_actual)`);
    await q(`INSERT IGNORE INTO padel_jugadores (id_tenant, dni, nombre, categoria_actual, created_at, updated_at)
      SELECT id_tenant, dni, nombre, categoria, NOW(), NOW() FROM ranking_jugadores`);
    await q(`UPDATE torneo_jugadores j JOIN torneo_parejas p ON p.id = j.pareja_id JOIN torneos t ON t.id = p.torneo_id
      JOIN padel_jugadores pj ON pj.id_tenant = t.id_tenant AND pj.dni = j.dni SET j.jugador_id = pj.id WHERE j.jugador_id IS NULL`);

    // Ranking histórico → Liga general
    await q(`INSERT IGNORE INTO ranking_puntos (id_tenant, jugador_id, liga_id, categoria_id, genero, temporada, puntos, created_at, updated_at)
      SELECT r.id_tenant, pj.id, l.id, r.categoria, r.genero, r.temporada, r.puntos, NOW(), NOW()
      FROM ranking_jugadores r
      JOIN padel_jugadores pj ON pj.id_tenant = r.id_tenant AND pj.dni = r.dni
      JOIN torneo_ligas l ON l.id_tenant = r.id_tenant AND l.nombre = 'Liga general'`);
    await q(`INSERT INTO ranking_ajustes (id_tenant, ranking_id, jugador_id, liga_id, categoria_id, genero, temporada, puntos_anterior, puntos_nuevo, tipo, motivo, usuario, created_at)
      SELECT id_tenant, id, jugador_id, liga_id, categoria_id, genero, temporada, 0, puntos, 'migracion', 'Migrado desde ranking_jugadores', 'sistema', NOW()
      FROM ranking_puntos WHERE id NOT IN (SELECT ranking_id FROM (SELECT ranking_id FROM ranking_ajustes WHERE tipo = 'migracion' AND ranking_id IS NOT NULL) y)`);

    // Liga obligatoria
    await qi.changeColumn('torneos', 'liga_id', { type: S.INTEGER, allowNull: false, references: { model: 'torneo_ligas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' });
    const idx = await qi.showIndex('torneos');
    if (!idx.some(i => i.name === 'idx_torneos_liga')) await qi.addIndex('torneos', ['liga_id'], { name: 'idx_torneos_liga' });
  },

  async down(qi, S) {
    // Los datos nuevos se pierden; ranking_jugadores y torneos.categoria siguen intactos (fuente previa).
    for (const t of ['ranking_ajustes', 'ranking_puntos']) await qi.dropTable(t).catch(() => {});
    await qi.removeColumn('torneo_jugadores', 'jugador_id').catch(() => {});
    for (const t of ['torneo_partidos', 'torneo_zonas', 'torneo_parejas']) await qi.removeColumn(t, 'categoria_id').catch(() => {});
    await qi.dropTable('torneo_categorias').catch(() => {});
    await qi.removeColumn('torneos', 'liga_id').catch(() => {});
    await qi.dropTable('padel_jugadores').catch(() => {});
    await qi.dropTable('padel_categorias').catch(() => {});
    await qi.dropTable('torneo_ligas').catch(() => {});
  },
};
