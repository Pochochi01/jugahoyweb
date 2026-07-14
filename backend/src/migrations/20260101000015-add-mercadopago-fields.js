'use strict';
/**
 * Migration 015 — Campos para MercadoPago Checkout Pro
 *
 * bookings:
 *   - tipo_pago     ENUM('seña','total','complejo') NULL
 *   - mp_payment_id VARCHAR(50) NULL UNIQUE   (idempotencia webhook/sync)
 *   - monto_pagado  DECIMAL(10,2) NULL
 *   - estado        + valor 'pendiente_pago'  (retiene el slot mientras paga)
 *
 * fields:
 *   - sena_monto    DECIMAL(10,2) NULL        (monto fijo de seña por cancha)
 *
 * Segura / idempotente: verifica columnas antes de crear.
 */

const UQ_MP = 'uq_bookings_mp_payment_id';

module.exports = {
  async up(queryInterface, Sequelize) {
    const bookings = await queryInterface.describeTable('bookings');

    if (!bookings.tipo_pago) {
      await queryInterface.addColumn('bookings', 'tipo_pago', {
        type: Sequelize.ENUM('seña', 'total', 'complejo'),
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!bookings.mp_payment_id) {
      await queryInterface.addColumn('bookings', 'mp_payment_id', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: null,
      });
      // Índice UNIQUE (permite múltiples NULL en MySQL; bloquea payment_id duplicado)
      try {
        await queryInterface.addIndex('bookings', ['mp_payment_id'], { unique: true, name: UQ_MP });
      } catch (err) {
        if (!/exists|duplicate/i.test(err.message)) throw err;
      }
    }

    if (!bookings.monto_pagado) {
      await queryInterface.addColumn('bookings', 'monto_pagado', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
      });
    }

    // Agregar 'pendiente_pago' al enum de estado
    await queryInterface.changeColumn('bookings', 'estado', {
      type: Sequelize.ENUM('pendiente_pago', 'pendiente', 'confirmado', 'cancelado', 'rechazado'),
      defaultValue: 'confirmado',
    });

    const fields = await queryInterface.describeTable('fields');
    if (!fields.sena_monto) {
      await queryInterface.addColumn('fields', 'sena_monto', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const fields = await queryInterface.describeTable('fields');
    if (fields.sena_monto) await queryInterface.removeColumn('fields', 'sena_monto');

    const bookings = await queryInterface.describeTable('bookings');
    try { await queryInterface.removeIndex('bookings', UQ_MP); } catch { /* noop */ }
    if (bookings.mp_payment_id) await queryInterface.removeColumn('bookings', 'mp_payment_id');
    if (bookings.tipo_pago)     await queryInterface.removeColumn('bookings', 'tipo_pago');
    if (bookings.monto_pagado)  await queryInterface.removeColumn('bookings', 'monto_pagado');

    // Revertir enum de estado (cuidado: filas 'pendiente_pago' quedarían inválidas)
    await queryInterface.sequelize.query(
      "UPDATE `bookings` SET `estado`='pendiente' WHERE `estado`='pendiente_pago'"
    );
    await queryInterface.changeColumn('bookings', 'estado', {
      type: Sequelize.ENUM('pendiente', 'confirmado', 'cancelado', 'rechazado'),
      defaultValue: 'confirmado',
    });
  },
};
