'use strict';
/**
 * Migration 017 — Crear tabla club_integrations (multi-tenant)
 *
 * Credenciales de Meta/WhatsApp y MercadoPago POR CLUB, para dejar de depender
 * de un .env global compartido.
 *
 * Integridad:
 *   - FK club_id → complexes(id) ON DELETE CASCADE, único (1:1 con el club)
 *   - meta_phone_number_id único → enruta el webhook entrante al club correcto
 *
 * Además migra los tokens de MercadoPago ya cargados en complexes.mercadopago_token
 * para no perder la configuración existente.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.map(t => t.toLowerCase()).includes('club_integrations')) {
      await queryInterface.createTable('club_integrations', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        club_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'complexes', key: 'id' },
          onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        meta_phone_number_id:      { type: Sequelize.STRING(50),  allowNull: true, defaultValue: null },
        meta_access_token:         { type: Sequelize.TEXT,        allowNull: true, defaultValue: null },
        meta_webhook_verify_token: { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
        meta_app_secret:           { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
        mercadopago_access_token:  { type: Sequelize.TEXT,        allowNull: true, defaultValue: null },
        mercadopago_refresh_token: { type: Sequelize.TEXT,        allowNull: true, defaultValue: null },
        fecha_expiracion_token:    { type: Sequelize.DATE,        allowNull: true, defaultValue: null },
        activo:     { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });

      await queryInterface.addIndex('club_integrations', ['club_id'],
        { unique: true, name: 'uq_club_integrations_club' });
      await queryInterface.addIndex('club_integrations', ['meta_phone_number_id'],
        { unique: true, name: 'uq_club_integrations_phone' });
    }

    // ── Migrar tokens de MercadoPago ya cargados en complexes ──
    // (no pisa filas existentes; solo crea las que faltan)
    await queryInterface.sequelize.query(`
      INSERT INTO club_integrations (club_id, mercadopago_access_token, activo, created_at, updated_at)
      SELECT c.id, c.mercadopago_token, 1, NOW(), NOW()
        FROM complexes c
       WHERE c.mercadopago_token IS NOT NULL
         AND c.mercadopago_token <> ''
         AND NOT EXISTS (SELECT 1 FROM club_integrations ci WHERE ci.club_id = c.id)
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('club_integrations');
  },
};
