'use strict';
/**
 * Horarios fijados a mano para partidos de la llave ANTES de generarla (llave de referencia).
 * La clave identifica el partido en el cuadro fijo por zonas (ej. "cuartos-1", "final-1"):
 * se respetan al simular y al generar la llave real.
 */
module.exports = {
  async up(qi, S) {
    const tablas = await qi.showAllTables();
    if (tablas.includes('torneo_llave_programacion')) return;
    await qi.createTable('torneo_llave_programacion', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
      categoria_id: { type: S.TINYINT, allowNull: false },
      clave: { type: S.STRING(20), allowNull: false },
      field_id: { type: S.INTEGER, allowNull: false, references: { model: 'fields', key: 'id' }, onDelete: 'CASCADE' },
      fecha: { type: S.DATEONLY, allowNull: false },
      hora: { type: S.STRING(5), allowNull: false },
      motivo: { type: S.STRING(255), allowNull: true },
      usuario_id: S.INTEGER, usuario: S.STRING(150),
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('torneo_llave_programacion', ['torneo_id', 'categoria_id', 'clave'], { unique: true, name: 'uq_llave_prog_clave' });
  },
  async down(qi) { await qi.dropTable('torneo_llave_programacion').catch(() => {}); },
};
