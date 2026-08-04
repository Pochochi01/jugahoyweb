'use strict';
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

/**
 * ClubIntegration — credenciales de integraciones externas POR CLUB (multi-tenant).
 *
 * En este proyecto un "club" es un registro de `complexes`, por eso `club_id`
 * apunta a complexes.id (relación 1:1).
 *
 * Reemplaza el uso de credenciales globales del .env:
 *   - Meta / WhatsApp Cloud API → meta_phone_number_id + meta_access_token
 *   - MercadoPago               → mercadopago_access_token
 *
 * `meta_phone_number_id` es único: es la clave con la que se enruta el webhook
 * ENTRANTE de WhatsApp al club correcto.
 */
const ClubIntegration = sequelize.define('ClubIntegration', {
  id:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  club_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },

  // ── Meta / WhatsApp Cloud API ──
  meta_phone_number_id: { type: DataTypes.STRING(50),  allowNull: true, defaultValue: null },
  meta_access_token:    { type: DataTypes.TEXT,        allowNull: true, defaultValue: null },
  // Secreto propio del club para verificar el alta del webhook en Meta
  meta_webhook_verify_token: { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
  // App Secret (para validar la firma X-Hub-Signature-256 si el club usa su propia app)
  meta_app_secret:      { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },

  // ── MercadoPago ──
  mercadopago_access_token: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  // Solo si el club se onboardeó por OAuth (permite refresco real)
  mercadopago_refresh_token: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },

  // Vencimiento del token de acceso (para avisos y refresco)
  fecha_expiracion_token: { type: DataTypes.DATE, allowNull: true, defaultValue: null },

  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'club_integrations',
  indexes: [
    { name: 'uq_club_integrations_club',  unique: true, fields: ['club_id'] },
    { name: 'uq_club_integrations_phone', unique: true, fields: ['meta_phone_number_id'] },
  ],
});

module.exports = ClubIntegration;
