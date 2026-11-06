'use strict';
/**
 * Motor de plantillas de llaves:
 *  - tournament_bracket_templates: plantillas de cruces cargadas desde administración
 *    (globales: id_tenant NULL, o propias de un club). Tienen prioridad sobre las reglas internas.
 *  - torneo_partidos.ronda suma '16avos' (llaves de 32: formatos de 27 parejas en adelante).
 *    Es el mismo nombre de instancia que ya usa el ranking anual (puntos_16avos).
 */
module.exports = {
  async up(qi, S) {
    const tablas = await qi.showAllTables();
    if (!tablas.includes('tournament_bracket_templates')) {
      await qi.createTable('tournament_bracket_templates', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: S.STRING(120), allowNull: false },
        id_tenant: { type: S.INTEGER, allowNull: true, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },   // NULL = todos los clubes
        min_pairs: { type: S.SMALLINT, allowNull: true },
        max_pairs: { type: S.SMALLINT, allowNull: true },
        zones: { type: S.TINYINT, allowNull: false },
        clasifican: { type: S.TINYINT, allowNull: false, defaultValue: 2 },
        template_json: { type: S.JSON, allowNull: false },     // { rondas: { <ronda>: [{ key, local, visitante, siguiente }] }, etiquetas? }
        active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        usuario: { type: S.STRING(150), allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('tournament_bracket_templates', ['zones', 'clasifican', 'active'], { name: 'idx_bracket_tpl_zonas' });
      await qi.addIndex('tournament_bracket_templates', ['id_tenant'], { name: 'idx_bracket_tpl_club' });
    }
    await qi.sequelize.query("ALTER TABLE torneo_partidos MODIFY ronda ENUM('zona','16avos','octavos','cuartos','semifinal','final') NOT NULL");
  },
  async down(qi) {
    await qi.sequelize.query("DELETE FROM torneo_partidos WHERE ronda = '16avos'");
    await qi.sequelize.query("ALTER TABLE torneo_partidos MODIFY ronda ENUM('zona','octavos','cuartos','semifinal','final') NOT NULL");
    await qi.dropTable('tournament_bracket_templates').catch(() => {});
  },
};
