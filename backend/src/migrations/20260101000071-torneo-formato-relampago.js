'use strict';
/**
 * Torneo Relámpago: formato de partido configurable por fase.
 *  - torneos.formato           'tradicional' (default: todos los torneos existentes) | 'relampago'
 *  - torneos.formato_partidos  JSON { zonas, cuartos, semifinal, final } con la regla de cada fase
 *                              (ver services/torneos/formatoPartido.js). NULL en los tradicionales.
 * Los torneos existentes quedan 'tradicional' → mismas reglas que antes (6 games, TB a 7, tercer_set).
 * Rollback: down() quita ambas columnas (antes, pasar o cerrar los torneos relámpago).
 */
module.exports = {
  async up(qi, S) {
    const cols = await qi.describeTable('torneos');
    if (!cols.formato) await qi.addColumn('torneos', 'formato', { type: S.ENUM('tradicional', 'relampago'), allowNull: false, defaultValue: 'tradicional' });
    if (!cols.formato_partidos) await qi.addColumn('torneos', 'formato_partidos', { type: S.JSON, allowNull: true });
  },
  async down(qi) {
    for (const c of ['formato_partidos', 'formato']) await qi.removeColumn('torneos', c).catch(() => {});
  },
};
