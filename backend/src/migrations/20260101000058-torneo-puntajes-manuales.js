'use strict';
/**
 * Puntaje manual por jugador en las posiciones de un torneo + historial de cambios.
 *  - torneo_jugadores.puntos_manual: si no es NULL reemplaza al puntaje calculado por
 *    los partidos (NULL = automático). Los PJ/PG/PP y diferencias siguen siendo los reales.
 *  - torneo_puntajes_historial: auditoría de cada modificación (anterior → nuevo, usuario, motivo).
 */
module.exports = {
  async up(qi, S) {
    const cols = await qi.describeTable('torneo_jugadores');
    if (!cols.puntos_manual) await qi.addColumn('torneo_jugadores', 'puntos_manual', { type: S.INTEGER, allowNull: true, defaultValue: null });
    const tablas = await qi.showAllTables();
    if (!tablas.includes('torneo_puntajes_historial')) {
      await qi.createTable('torneo_puntajes_historial', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        jugador_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneo_jugadores', key: 'id' }, onDelete: 'CASCADE' },
        puntaje_anterior: { type: S.INTEGER, allowNull: false },
        puntaje_nuevo: { type: S.INTEGER, allowNull: false },
        automatico: { type: S.BOOLEAN, allowNull: false, defaultValue: false },   // true = se volvió al cálculo por partidos
        motivo: { type: S.STRING(255), allowNull: true },
        usuario_id: { type: S.INTEGER, allowNull: true },
        usuario: { type: S.STRING(150), allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('torneo_puntajes_historial', ['torneo_id', 'created_at'], { name: 'idx_puntajes_torneo' });
      await qi.addIndex('torneo_puntajes_historial', ['jugador_id'], { name: 'idx_puntajes_jugador' });
    }
  },
  async down(qi) {
    await qi.dropTable('torneo_puntajes_historial').catch(() => {});
    await qi.removeColumn('torneo_jugadores', 'puntos_manual').catch(() => {});
  },
};
