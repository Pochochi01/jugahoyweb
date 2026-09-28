'use strict';
/**
 * Migration 039 — Reglas avanzadas de torneos
 *
 *  torneos.tipo                 'unico' (zonas por sorteo) | 'anual' (zonas por ranking, suma puntos)
 *  torneos.tercer_set           'set' (set normal) | 'super_tiebreak' (a 10, dif. 2)
 *  torneos.puntos_asignados     evita sumar dos veces los puntos anuales al finalizar
 *  torneo_parejas.puntos_totales  suma de puntos de ranking de ambos jugadores (al armar zonas)
 *  torneo_parejas.numero_zona   número de la pareja dentro de su zona (1..n) → define los cruces
 *  torneo_partidos.perdedor_partido_id / perdedor_slot
 *                               zonas de 4: el PERDEDOR también avanza (P1/P2 → P3/P4)
 *  torneo_resultados.tie_breaks [[7,5] | null, ...] alineado con sets (solo sets 7-6)
 *  torneo_tabla_posiciones      tabla persistida por zona, se recalcula con cada resultado
 *  ranking_jugadores            ranking anual del club por categoría + género (clave: DNI)
 *
 * Segura / idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
    };
    const addCol = async (tabla, col, def) => {
      const d = await queryInterface.describeTable(tabla);
      if (!d[col]) await queryInterface.addColumn(tabla, col, def);
    };

    await addCol('torneos', 'tipo', { type: N.ENUM('unico', 'anual'), allowNull: false, defaultValue: 'unico' });
    await addCol('torneos', 'tercer_set', { type: N.ENUM('set', 'super_tiebreak'), allowNull: false, defaultValue: 'set' });
    await addCol('torneos', 'puntos_asignados', { type: N.BOOLEAN, allowNull: false, defaultValue: false });
    await addCol('torneo_parejas', 'puntos_totales', { type: N.INTEGER, allowNull: false, defaultValue: 0 });
    await addCol('torneo_parejas', 'numero_zona', { type: N.TINYINT, allowNull: true });
    await addCol('torneo_partidos', 'perdedor_partido_id', {
      type: N.INTEGER, allowNull: true, references: { model: 'torneo_partidos', key: 'id' }, onDelete: 'SET NULL',
    });
    await addCol('torneo_partidos', 'perdedor_slot', { type: N.TINYINT, allowNull: true });
    await addCol('torneo_resultados', 'tie_breaks', { type: N.JSON, allowNull: true });

    if (!tablas.includes('torneo_tabla_posiciones')) {
      await queryInterface.createTable('torneo_tabla_posiciones', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id:  { type: N.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        zona_id:    { type: N.INTEGER, allowNull: false, references: { model: 'torneo_zonas', key: 'id' }, onDelete: 'CASCADE' },
        pareja_id:  { type: N.INTEGER, allowNull: false, references: { model: 'torneo_parejas', key: 'id' }, onDelete: 'CASCADE' },
        posicion:   { type: N.TINYINT, allowNull: false },
        pj: { type: N.TINYINT, allowNull: false, defaultValue: 0 },
        pg: { type: N.TINYINT, allowNull: false, defaultValue: 0 },
        pp: { type: N.TINYINT, allowNull: false, defaultValue: 0 },
        puntos:           { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        sets_favor:       { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        sets_contra:      { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        games_favor:      { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        games_contra:     { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        diferencia_sets:  { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        diferencia_games: { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        ...ts,
      });
      await queryInterface.addIndex('torneo_tabla_posiciones', ['zona_id', 'pareja_id'], { unique: true, name: 'uq_tabla_zona_pareja' });
    }

    if (!tablas.includes('ranking_jugadores')) {
      await queryInterface.createTable('ranking_jugadores', {
        id:        { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        id_tenant: { type: N.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        dni:       { type: N.STRING(15), allowNull: false },
        nombre:    { type: N.STRING(150), allowNull: false },
        categoria: { type: N.TINYINT, allowNull: false },
        genero:    { type: N.ENUM('masculino', 'femenino', 'mixto'), allowNull: false },   // género del CIRCUITO
        temporada: { type: N.SMALLINT, allowNull: false },
        puntos:    { type: N.INTEGER, allowNull: false, defaultValue: 0 },
        ...ts,
      });
      await queryInterface.addIndex('ranking_jugadores', ['id_tenant', 'temporada', 'categoria', 'genero', 'dni'],
        { unique: true, name: 'uq_ranking_jugador' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ranking_jugadores').catch(() => {});
    await queryInterface.dropTable('torneo_tabla_posiciones').catch(() => {});
    for (const [t, c] of [['torneos', 'tipo'], ['torneos', 'tercer_set'], ['torneos', 'puntos_asignados'],
      ['torneo_parejas', 'puntos_totales'], ['torneo_parejas', 'numero_zona'],
      ['torneo_partidos', 'perdedor_partido_id'], ['torneo_partidos', 'perdedor_slot'], ['torneo_resultados', 'tie_breaks']]) {
      await queryInterface.removeColumn(t, c).catch(() => {});
    }
  },
};
