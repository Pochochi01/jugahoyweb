'use strict';
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

/**
 * PushSubscription — suscripción Web Push de un usuario (player o admin).
 *
 * Se usa `user_id` (tabla unificada `users`) en lugar de player_id/admin_id
 * separados: el rol distingue si es jugador o administrador.
 *
 * `endpoint` es único (identifica al navegador/dispositivo). `keys` guarda
 * { p256dh, auth } que web-push necesita para cifrar el mensaje.
 */
const PushSubscription = sequelize.define('PushSubscription', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:  { type: DataTypes.INTEGER, allowNull: false },
  endpoint: { type: DataTypes.TEXT, allowNull: false },
  // { p256dh, auth }
  keys:     { type: DataTypes.JSON, allowNull: false },
}, {
  tableName: 'push_subscriptions',
  indexes: [
    // endpoint único (VARCHAR con longitud acotada para índice en MySQL)
    { name: 'uq_push_endpoint', unique: true, fields: [{ name: 'endpoint', length: 255 }] },
    { name: 'idx_push_user', fields: ['user_id'] },
  ],
});

module.exports = PushSubscription;
