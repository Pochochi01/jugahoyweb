'use strict';
/**
 * Inscripciones inteligentes.
 *  - torneo_categorias.inscripciones_cerradas: se activa al armar zonas (backfill: categorías que ya
 *    armaron zonas quedan cerradas; las pendientes, abiertas). Reapertura auditada.
 *  - torneo_jugadores.whatsapp pasa a admitir NULL (altas administrativas sin teléfono).
 *  - torneo_inscripcion_eventos: auditoría de inscripciones, zonas, bloqueo y reapertura.
 * Las inscripciones existentes no se modifican.
 * Rollback: down() quita la tabla y la columna; whatsapp vuelve a NOT NULL (los NULL pasan a '').
 */
module.exports = {
  async up(qi, S) {
    const cats = await qi.describeTable('torneo_categorias');
    if (!cats.inscripciones_cerradas) {
      await qi.addColumn('torneo_categorias', 'inscripciones_cerradas', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
      await qi.sequelize.query("UPDATE torneo_categorias SET inscripciones_cerradas = 1 WHERE estado <> 'pendiente'");
    }
    await qi.changeColumn('torneo_jugadores', 'whatsapp', { type: S.STRING(30), allowNull: true });
    const tablas = await qi.showAllTables();
    if (!tablas.includes('torneo_inscripcion_eventos')) {
      await qi.createTable('torneo_inscripcion_eventos', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        categoria_id: { type: S.TINYINT, allowNull: true },
        pareja_id: { type: S.INTEGER, allowNull: true },
        accion: { type: S.ENUM('inscripcion_creada', 'inscripcion_modificada', 'inscripcion_eliminada', 'zonas_generadas', 'inscripciones_bloqueadas', 'inscripciones_reabiertas'), allowNull: false },
        detalle: { type: S.JSON, allowNull: true },
        motivo: { type: S.STRING(500), allowNull: true },
        usuario_id: { type: S.INTEGER, allowNull: true },
        usuario: { type: S.STRING(150), allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('torneo_inscripcion_eventos', ['torneo_id', 'id']);
    }
  },
  async down(qi, S) {
    await qi.dropTable('torneo_inscripcion_eventos').catch(() => {});
    await qi.removeColumn('torneo_categorias', 'inscripciones_cerradas').catch(() => {});
    await qi.sequelize.query("UPDATE torneo_jugadores SET whatsapp = '' WHERE whatsapp IS NULL");
    await qi.changeColumn('torneo_jugadores', 'whatsapp', { type: S.STRING(30), allowNull: false });
  },
};
