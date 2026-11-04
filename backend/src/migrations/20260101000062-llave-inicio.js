'use strict';
/**
 * Inicio configurable de la llave por categoría del torneo (cada categoría tiene su cuadro):
 * torneo_categorias.llave_inicio_fecha / llave_inicio_hora. NULL = la llave arranca después
 * del último partido de zona (comportamiento anterior).
 */
module.exports = {
  async up(qi, S) {
    const c = await qi.describeTable('torneo_categorias');
    if (!c.llave_inicio_fecha) await qi.addColumn('torneo_categorias', 'llave_inicio_fecha', { type: S.DATEONLY, allowNull: true });
    if (!c.llave_inicio_hora) await qi.addColumn('torneo_categorias', 'llave_inicio_hora', { type: S.STRING(5), allowNull: true });
  },
  async down(qi) {
    await qi.removeColumn('torneo_categorias', 'llave_inicio_hora').catch(() => {});
    await qi.removeColumn('torneo_categorias', 'llave_inicio_fecha').catch(() => {});
  },
};
