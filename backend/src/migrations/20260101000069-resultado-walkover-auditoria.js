'use strict';
/**
 * Resultados: marca de W.O. y auditoría de la carga.
 *  - is_walkover: el W.O. ahora se guarda como 6-0 6-0 (o 0-6 0-6) para el ganador; la marca
 *    distingue un W.O. de un 6-0 6-0 jugado (badge "W.O." y puntos de tabla: el perdedor por W.O. no suma).
 *  - cargado_por_id / cargado_por / cargado_at: quién y cuándo cargó (o corrigió) el resultado.
 * Backfill: los W.O. existentes (partido en estado 'walkover') quedan marcados; sus sets no se tocan.
 * Rollback: down() quita las columnas (los W.O. siguen identificándose por torneo_partidos.estado).
 */
module.exports = {
  async up(qi, S) {
    const cols = await qi.describeTable('torneo_resultados');
    if (!cols.is_walkover) await qi.addColumn('torneo_resultados', 'is_walkover', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
    if (!cols.cargado_por_id) await qi.addColumn('torneo_resultados', 'cargado_por_id', { type: S.INTEGER, allowNull: true });
    if (!cols.cargado_por) await qi.addColumn('torneo_resultados', 'cargado_por', { type: S.STRING(150), allowNull: true });
    if (!cols.cargado_at) await qi.addColumn('torneo_resultados', 'cargado_at', { type: S.DATE, allowNull: true });
    await qi.sequelize.query("UPDATE torneo_resultados r JOIN torneo_partidos p ON p.id = r.partido_id SET r.is_walkover = 1 WHERE p.estado = 'walkover'");
  },
  async down(qi) {
    for (const c of ['is_walkover', 'cargado_por_id', 'cargado_por', 'cargado_at']) await qi.removeColumn('torneo_resultados', c).catch(() => {});
  },
};
