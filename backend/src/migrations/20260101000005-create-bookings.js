'use strict';
/**
 * Migration 005 — Crear tabla bookings
 * Sistema de reservas nuevo (reemplaza agenda para nuevas funcionalidades).
 * Segura: verifica si la tabla ya existe antes de crearla.
 *
 * Relaciones (a nivel ORM, no FK física):
 *   bookings.field_id   → fields.id
 *   bookings.user_id    → users.id   (null = reserva creada por admin)
 *   bookings.created_by → users.id   (null = creada por el sistema/chatbot)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('bookings')) return;

    await queryInterface.createTable('bookings', {
      id       : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      field_id : { type: Sequelize.INTEGER, allowNull: false },
      fecha    : { type: Sequelize.DATEONLY, allowNull: false },
      hora_inicio : { type: Sequelize.STRING(5), allowNull: false },
      hora_fin    : { type: Sequelize.STRING(5), allowNull: false },
      duracion    : { type: Sequelize.INTEGER,   allowNull: false },

      nombre_cliente   : { type: Sequelize.STRING(150), allowNull: false },
      telefono_cliente : { type: Sequelize.STRING(30) },
      email_cliente    : { type: Sequelize.STRING(150) },

      metodo_pago: {
        type: Sequelize.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'),
        defaultValue: 'efectivo',
      },
      monto : { type: Sequelize.DECIMAL(10, 2) },

      user_id    : { type: Sequelize.INTEGER },
      estado: {
        type: Sequelize.ENUM('pendiente', 'confirmado', 'cancelado', 'rechazado'),
        defaultValue: 'confirmado',
      },
      notas      : { type: Sequelize.TEXT },
      created_by : { type: Sequelize.INTEGER },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('bookings', ['field_id', 'fecha'], { name: 'idx_bookings_field_fecha' });
    await queryInterface.addIndex('bookings', ['estado'],            { name: 'idx_bookings_estado' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bookings');
  },
};
