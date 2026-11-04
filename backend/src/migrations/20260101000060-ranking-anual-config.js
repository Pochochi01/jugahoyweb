'use strict';
/**
 * Ranking anual configurable.
 *
 *  - ranking_temporadas: temporadas del club (año). Ranking, configuración e historial independientes.
 *  - ranking_configuracion: puntos por instancia (zona … campeón) por temporada + categoría.
 *  - ranking_resultados: instancia alcanzada y puntos de CADA jugador en CADA torneo/categoría
 *    (único por torneo + categoría + jugador → un torneo nunca suma dos veces). Base de las
 *    estadísticas (torneos, títulos, finales, semifinales) y del recálculo.
 *  - ranking_puntos: puntos = max(0, puntos_torneos + ajuste_manual). El ajuste manual
 *    sobrevive a los recálculos.
 *  - ranking_ajustes (= historial de puntos): se agrega el tipo 'recalculo'.
 *
 * Backfill: temporadas y configuración por defecto (los valores fijos anteriores), resultados
 * desde los ajustes de tipo 'torneo' y ajuste_manual = puntos − puntos de torneos.
 */
const DEF = { puntos_zona: 10, puntos_16avos: 15, puntos_8vos: 25, puntos_4tos: 35, puntos_semifinal: 50, puntos_final: 70, puntos_campeon: 100 };
const INSTANCIAS = ['zona', '16avos', 'octavos', 'cuartos', 'semifinal', 'final', 'campeon'];
const TIPOS_AJUSTE = ['fijar', 'sumar', 'restar', 'torneo', 'migracion', 'baja'];

module.exports = {
  async up(qi, S) {
    const q = (sql, r) => qi.sequelize.query(sql, { replacements: r });
    const tablas = await qi.showAllTables();
    const ts = { created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') }, updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') } };

    if (!tablas.includes('ranking_temporadas')) {
      await qi.createTable('ranking_temporadas', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        id_tenant: { type: S.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        anio: { type: S.SMALLINT, allowNull: false },
        nombre: { type: S.STRING(60), allowNull: false },
        estado: { type: S.ENUM('activa', 'cerrada'), allowNull: false, defaultValue: 'activa' },
        ...ts,
      });
      await qi.addIndex('ranking_temporadas', ['id_tenant', 'anio'], { unique: true, name: 'uq_temporada_anio' });
    }
    if (!tablas.includes('ranking_configuracion')) {
      await qi.createTable('ranking_configuracion', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        temporada_id: { type: S.INTEGER, allowNull: false, references: { model: 'ranking_temporadas', key: 'id' }, onDelete: 'CASCADE' },
        categoria_id: { type: S.TINYINT, allowNull: false, references: { model: 'padel_categorias', key: 'id' } },
        ...Object.fromEntries(Object.keys(DEF).map(k => [k, { type: S.INTEGER, allowNull: false, defaultValue: DEF[k] }])),
        updated_by: { type: S.STRING(150), allowNull: true },
        ...ts,
      });
      await qi.addIndex('ranking_configuracion', ['temporada_id', 'categoria_id'], { unique: true, name: 'uq_config_temporada_categoria' });
    }
    if (!tablas.includes('ranking_resultados')) {
      await qi.createTable('ranking_resultados', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        id_tenant: { type: S.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        categoria_id: { type: S.TINYINT, allowNull: false },
        jugador_id: { type: S.INTEGER, allowNull: false, references: { model: 'padel_jugadores', key: 'id' }, onDelete: 'CASCADE' },
        liga_id: { type: S.INTEGER, allowNull: false },
        genero: { type: S.ENUM('masculino', 'femenino', 'mixto'), allowNull: false },
        temporada: { type: S.SMALLINT, allowNull: false },
        instancia: { type: S.ENUM(...INSTANCIAS), allowNull: false },
        puntos: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        ...ts,
      });
      await qi.addIndex('ranking_resultados', ['torneo_id', 'categoria_id', 'jugador_id'], { unique: true, name: 'uq_resultado_torneo_jugador' });
      await qi.addIndex('ranking_resultados', ['liga_id', 'categoria_id', 'temporada', 'genero', 'jugador_id'], { name: 'idx_resultados_combinacion' });
    }
    const rp = await qi.describeTable('ranking_puntos');
    if (!rp.puntos_torneos) await qi.addColumn('ranking_puntos', 'puntos_torneos', { type: S.INTEGER, allowNull: false, defaultValue: 0 });
    if (!rp.ajuste_manual) await qi.addColumn('ranking_puntos', 'ajuste_manual', { type: S.INTEGER, allowNull: false, defaultValue: 0 });
    await qi.changeColumn('ranking_ajustes', 'tipo', { type: S.ENUM(...TIPOS_AJUSTE, 'recalculo'), allowNull: false });

    // ── Backfill ──
    await q(`INSERT IGNORE INTO ranking_temporadas (id_tenant, anio, nombre, estado, created_at, updated_at)
      SELECT id_tenant, anio, CONCAT('Temporada ', anio), 'activa', NOW(), NOW() FROM (
        SELECT DISTINCT id_tenant, temporada anio FROM ranking_puntos
        UNION SELECT DISTINCT id_tenant, YEAR(fecha_inicio) FROM torneos) x`);
    await q(`INSERT IGNORE INTO ranking_configuracion (temporada_id, categoria_id, ${Object.keys(DEF).join(', ')}, created_at, updated_at)
      SELECT t.id, c.id, ${Object.values(DEF).join(', ')}, NOW(), NOW() FROM ranking_temporadas t CROSS JOIN padel_categorias c`);
    // Resultados desde los ajustes de torneo (motivo "<torneo> (<cat>): <instancia>")
    await q(`INSERT IGNORE INTO ranking_resultados (id_tenant, torneo_id, categoria_id, jugador_id, liga_id, genero, temporada, instancia, puntos, created_at, updated_at)
      SELECT a.id_tenant, a.torneo_id, a.categoria_id, a.jugador_id, a.liga_id, a.genero, a.temporada,
        SUBSTRING_INDEX(a.motivo, ': ', -1), a.puntos_nuevo - a.puntos_anterior, a.created_at, a.created_at
      FROM ranking_ajustes a JOIN torneos t ON t.id = a.torneo_id
      WHERE a.tipo = 'torneo' AND SUBSTRING_INDEX(a.motivo, ': ', -1) IN (${INSTANCIAS.map(i => `'${i}'`).join(',')})`);
    await q(`UPDATE ranking_puntos r LEFT JOIN (
        SELECT jugador_id, liga_id, categoria_id, genero, temporada, SUM(puntos) s FROM ranking_resultados
        GROUP BY jugador_id, liga_id, categoria_id, genero, temporada) x
        ON x.jugador_id = r.jugador_id AND x.liga_id = r.liga_id AND x.categoria_id = r.categoria_id AND x.genero = r.genero AND x.temporada = r.temporada
      SET r.puntos_torneos = COALESCE(x.s, 0), r.ajuste_manual = r.puntos - COALESCE(x.s, 0)`);
  },

  async down(qi, S) {
    await qi.sequelize.query("UPDATE ranking_ajustes SET tipo = 'fijar' WHERE tipo = 'recalculo'");
    await qi.changeColumn('ranking_ajustes', 'tipo', { type: S.ENUM(...TIPOS_AJUSTE), allowNull: false });
    await qi.removeColumn('ranking_puntos', 'ajuste_manual').catch(() => {});
    await qi.removeColumn('ranking_puntos', 'puntos_torneos').catch(() => {});
    for (const t of ['ranking_resultados', 'ranking_configuracion', 'ranking_temporadas']) await qi.dropTable(t).catch(() => {});
  },
};
