'use strict';
/**
 * Migration 011 — Agregar users.default_complex_id
 *
 * Vincula explícitamente a un jugador (rol `player`) con el complejo al que fue
 * invitado. Al consumir un link de invitación, se guarda acá el complex_id del
 * invite; en el login el jugador entra directo a ese complejo sin selección manual.
 *
 * Integridad referencial:
 *   - FK a complexes(id)
 *   - ON DELETE SET NULL  → si se elimina el complejo, el jugador queda sin complejo
 *                            por defecto (no rompe la fila del usuario).
 *   - ON UPDATE CASCADE
 *
 * Segura / idempotente: verifica columna, FK e índice antes de crearlos.
 */

const FK_NAME  = 'fk_users_default_complex';
const IDX_NAME = 'idx_users_default_complex';

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('users');

    if (!cols.default_complex_id) {
      await queryInterface.addColumn('users', 'default_complex_id', {
        type        : Sequelize.INTEGER,
        allowNull   : true,
        defaultValue: null,
        after       : 'rol',
      });
    }

    // Índice para acelerar búsquedas por complejo del jugador
    try {
      await queryInterface.addIndex('users', ['default_complex_id'], { name: IDX_NAME });
    } catch (err) {
      if (!/exists|duplicate/i.test(err.message)) throw err;
    }

    // Foreign key con borrado seguro (SET NULL)
    try {
      await queryInterface.addConstraint('users', {
        fields    : ['default_complex_id'],
        type      : 'foreign key',
        name      : FK_NAME,
        references: { table: 'complexes', field: 'id' },
        onDelete  : 'SET NULL',
        onUpdate  : 'CASCADE',
      });
    } catch (err) {
      // Si la FK ya existe, ignorar (idempotencia entre entornos)
      if (!/exists|duplicate/i.test(err.message)) throw err;
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeConstraint('users', FK_NAME); } catch { /* noop */ }
    try { await queryInterface.removeIndex('users', IDX_NAME); }     catch { /* noop */ }
    const cols = await queryInterface.describeTable('users');
    if (cols.default_complex_id) {
      await queryInterface.removeColumn('users', 'default_complex_id');
    }
  },
};
