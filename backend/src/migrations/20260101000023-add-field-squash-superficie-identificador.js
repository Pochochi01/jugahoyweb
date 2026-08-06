'use strict';
/**
 * Migration 023 — Deporte squash, superficie e identificador de cancha
 *
 * fields:
 *   - deporte ENUM       → agrega 'squash' (basquet ya existía)
 *   - superficie   VARCHAR(30) → superficie según deporte (NULL para basket/squash)
 *   - identificador VARCHAR(10) → "C1", "C2"... incremental por complejo
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) Ampliar el ENUM de deporte con 'squash'
    await queryInterface.changeColumn('fields', 'deporte', {
      type: Sequelize.ENUM('futbol', 'padel', 'tenis', 'basquet', 'voley', 'squash', 'otro'),
      allowNull: false,
    });

    // 2) Columnas nuevas
    const fields = await queryInterface.describeTable('fields');
    if (!fields.superficie) {
      await queryInterface.addColumn('fields', 'superficie', {
        type: Sequelize.STRING(30), allowNull: true, defaultValue: null, after: 'deporte',
      });
    }
    if (!fields.identificador) {
      await queryInterface.addColumn('fields', 'identificador', {
        type: Sequelize.STRING(10), allowNull: true, defaultValue: null, after: 'superficie',
      });
    }

    // 3) Backfill: asignar C1, C2... a las canchas ya existentes por complejo
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, complex_id FROM fields ORDER BY complex_id, id ASC'
    );
    const contador = {};
    for (const r of rows) {
      contador[r.complex_id] = (contador[r.complex_id] || 0) + 1;
      await queryInterface.sequelize.query(
        'UPDATE fields SET identificador = :ident WHERE id = :id AND (identificador IS NULL OR identificador = "")',
        { replacements: { ident: `C${contador[r.complex_id]}`, id: r.id } }
      );
    }
  },

  async down(queryInterface, Sequelize) {
    const fields = await queryInterface.describeTable('fields');
    if (fields.identificador) await queryInterface.removeColumn('fields', 'identificador');
    if (fields.superficie)    await queryInterface.removeColumn('fields', 'superficie');
    await queryInterface.changeColumn('fields', 'deporte', {
      type: Sequelize.ENUM('futbol', 'padel', 'tenis', 'basquet', 'voley', 'otro'),
      allowNull: false,
    });
  },
};
