'use strict';
/**
 * Siembra por ranking (Snake Seeding) en el armado de zonas.
 *  - torneo_parejas.siembra: posición de la pareja en el ranking de la categoría al armar
 *    las zonas (1 = mejor). Las cabezas de serie son numero_zona = 1.
 *  - torneo_zonas_historial: auditoría de cada armado (usuario, fecha, zonas, parejas,
 *    método y el reparto completo).
 */
module.exports = {
  async up(qi, S) {
    const cols = await qi.describeTable('torneo_parejas');
    if (!cols.siembra) await qi.addColumn('torneo_parejas', 'siembra', { type: S.SMALLINT, allowNull: true, defaultValue: null });
    const tablas = await qi.showAllTables();
    if (!tablas.includes('torneo_zonas_historial')) {
      await qi.createTable('torneo_zonas_historial', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        categoria_id: { type: S.TINYINT, allowNull: true },
        metodo: { type: S.STRING(30), allowNull: false, defaultValue: 'snake_seeding' },
        zonas: { type: S.INTEGER, allowNull: false },
        parejas: { type: S.INTEGER, allowNull: false },
        reparto: { type: S.JSON, allowNull: true },
        usuario_id: { type: S.INTEGER, allowNull: true },
        usuario: { type: S.STRING(150), allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('torneo_zonas_historial', ['torneo_id', 'created_at'], { name: 'idx_zonas_historial_torneo' });
    }
  },
  async down(qi) {
    await qi.dropTable('torneo_zonas_historial').catch(() => {});
    await qi.removeColumn('torneo_parejas', 'siembra').catch(() => {});
  },
};
