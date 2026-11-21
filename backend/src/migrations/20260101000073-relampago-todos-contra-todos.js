'use strict';
/**
 * Relámpago Todos contra Todos por Zonas.
 *  - torneos.formato: se agrega 'relampago_rr'. 'relampago' se conserva (es la modalidad que ahora se
 *    llama "Relámpago con Zonas y Llaves APA": solo cambia el nombre que se muestra, no el código).
 *  - torneo_partidos.compensatorio / puntua_pareja1 / puntua_pareja2: partido compensatorio de las zonas
 *    de 5 (puntúa solo para el rival). Default: partido normal (true/true) → partidos existentes intactos.
 *  - torneo_zonas.pareja_sorteada_id + sorteo (JSON: semilla, candidatos, sorteada, rival, cruces
 *    excluidos, fecha, usuario): auditoría del sorteo.
 * Rollback: down() quita las columnas y vuelve el ENUM (antes, pasar los relampago_rr a 'relampago').
 */
module.exports = {
  async up(qi, S) {
    await qi.changeColumn('torneos', 'formato', { type: S.ENUM('tradicional', 'relampago', 'relampago_rr'), allowNull: false, defaultValue: 'tradicional' });
    const p = await qi.describeTable('torneo_partidos');
    if (!p.compensatorio) await qi.addColumn('torneo_partidos', 'compensatorio', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
    if (!p.puntua_pareja1) await qi.addColumn('torneo_partidos', 'puntua_pareja1', { type: S.BOOLEAN, allowNull: false, defaultValue: true });
    if (!p.puntua_pareja2) await qi.addColumn('torneo_partidos', 'puntua_pareja2', { type: S.BOOLEAN, allowNull: false, defaultValue: true });
    const z = await qi.describeTable('torneo_zonas');
    if (!z.pareja_sorteada_id) {
      await qi.addColumn('torneo_zonas', 'pareja_sorteada_id', { type: S.INTEGER, allowNull: true, references: { model: 'torneo_parejas', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    }
    if (!z.sorteo) await qi.addColumn('torneo_zonas', 'sorteo', { type: S.JSON, allowNull: true });
  },
  async down(qi, S) {
    await qi.removeColumn('torneo_zonas', 'sorteo').catch(() => {});
    await qi.removeColumn('torneo_zonas', 'pareja_sorteada_id').catch(() => {});
    for (const c of ['puntua_pareja2', 'puntua_pareja1', 'compensatorio']) await qi.removeColumn('torneo_partidos', c).catch(() => {});
    await qi.sequelize.query("UPDATE torneos SET formato = 'relampago' WHERE formato = 'relampago_rr'");
    await qi.changeColumn('torneos', 'formato', { type: S.ENUM('tradicional', 'relampago'), allowNull: false, defaultValue: 'tradicional' });
  },
};
