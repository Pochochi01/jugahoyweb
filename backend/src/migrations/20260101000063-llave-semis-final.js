'use strict';
/**
 * Día y hora de semifinales y final por categoría. NULL = por defecto el ÚLTIMO día del
 * torneo (el primer horario libre de ese día). Editables desde "Inicio de la llave".
 */
const COLS = [['semis_fecha', 'DATEONLY'], ['semis_hora', 'STRING'], ['final_fecha', 'DATEONLY'], ['final_hora', 'STRING']];
module.exports = {
  async up(qi, S) {
    const c = await qi.describeTable('torneo_categorias');
    for (const [col, tipo] of COLS) if (!c[col]) await qi.addColumn('torneo_categorias', col, { type: tipo === 'STRING' ? S.STRING(5) : S.DATEONLY, allowNull: true });
  },
  async down(qi) {
    for (const [col] of COLS) await qi.removeColumn('torneo_categorias', col).catch(() => {});
  },
};
