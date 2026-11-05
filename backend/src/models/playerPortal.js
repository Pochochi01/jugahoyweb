/**
 * models/playerPortal.js — Portal de Jugador (migración 065). Tablas propias del portal;
 * los datos de torneos se LEEN de los modelos existentes, nunca se escriben desde aquí.
 */
const { DataTypes: T } = require('sequelize');
const sequelize = require('../config/database');

const PlayerAccess = sequelize.define('PlayerAccess', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  dni: { type: T.STRING(20), allowNull: false, unique: true },
  password_hash: { type: T.STRING(100), allowNull: false },
  must_change_password: { type: T.BOOLEAN, defaultValue: true },
  activo: { type: T.BOOLEAN, defaultValue: true },
  intentos_fallidos: { type: T.INTEGER, defaultValue: 0 },
  bloqueado_hasta: T.DATE,
  reset_token_hash: T.STRING(100),
  reset_expira: T.DATE,
  ultimo_login: T.DATE,
  indice_actualizado: T.DATE,
}, { tableName: 'player_access', underscored: true });

const PlayerTournamentIndex = sequelize.define('PlayerTournamentIndex', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  player_id: T.INTEGER,
  dni: { type: T.STRING(20), allowNull: false },
  tournament_id: { type: T.INTEGER, allowNull: false },
  league_id: T.INTEGER,
  season_id: T.INTEGER,
  complex_id: { type: T.INTEGER, allowNull: false },
  categoria_id: T.TINYINT,
  pareja_id: T.INTEGER,
}, { tableName: 'player_tournament_index', underscored: true });

const PlayerAccessLog = sequelize.define('PlayerAccessLog', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  dni: T.STRING(20),
  accion: { type: T.STRING(40), allowNull: false },
  recurso: T.STRING(60),
  recurso_id: T.INTEGER,
  status: T.SMALLINT,
  ip: T.STRING(64),
  user_agent: T.STRING(255),
}, { tableName: 'player_access_logs', underscored: true, updatedAt: false });

const PlayerPushSubscription = sequelize.define('PlayerPushSubscription', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  dni: { type: T.STRING(20), allowNull: false },
  proveedor: { type: T.ENUM('webpush', 'fcm'), defaultValue: 'webpush' },
  endpoint: T.TEXT,                            // Web Push
  keys: T.JSON,                                // { p256dh, auth }
  fcm_token: T.STRING(512),                    // Firebase Cloud Messaging
  device_type: T.STRING(20),
  browser: T.STRING(30),
  installed: { type: T.BOOLEAN, defaultValue: false },   // abierto como PWA instalada
  activo: { type: T.BOOLEAN, defaultValue: true },
  last_active: T.DATE,
  user_agent: T.STRING(255),
}, { tableName: 'player_push_subscriptions', underscored: true });

// Historial y cola persistente de notificaciones (migración 067)
const NotificationLog = sequelize.define('NotificationLog', {
  id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
  dni: { type: T.STRING(20), allowNull: false },
  nombre: T.STRING(150),
  id_tenant: T.INTEGER,
  titulo: { type: T.STRING(120), allowNull: false },
  mensaje: { type: T.TEXT, allowNull: false },
  tipo: { type: T.STRING(40), allowNull: false },
  estado: { type: T.ENUM('pendiente', 'procesando', 'enviado', 'entregado', 'abierto', 'fallido', 'omitido'), defaultValue: 'pendiente' },
  motivo: T.STRING(255),
  intentos: { type: T.TINYINT, defaultValue: 0 },
  proximo_intento: T.DATE,
  lote: T.STRING(36),
  fecha_envio: T.DATE,
  entregado_at: T.DATE,
  abierto_at: T.DATE,
  dispositivos: { type: T.SMALLINT, defaultValue: 0 },
  torneo_id: T.INTEGER,
  partido_id: T.INTEGER,
  pareja_id: T.INTEGER,
  url: T.STRING(255),
  payload_json: T.JSON,
  dedupe_key: { type: T.STRING(150), allowNull: false, unique: true },
  reenvio_de: T.BIGINT,
}, { tableName: 'notification_logs', underscored: true });

const NotificationPreference = sequelize.define('NotificationPreference', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  dni: { type: T.STRING(20), allowNull: false, unique: true },
  recordatorio_partidos: { type: T.BOOLEAN, defaultValue: true },
  recordatorio_pagos: { type: T.BOOLEAN, defaultValue: true },
  resultado_partidos: { type: T.BOOLEAN, defaultValue: true },
  clasificaciones: { type: T.BOOLEAN, defaultValue: true },
  finales: { type: T.BOOLEAN, defaultValue: true },
  promociones: { type: T.BOOLEAN, defaultValue: false },
}, { tableName: 'notification_preferences', underscored: true });

module.exports = { modelos: { PlayerAccess, PlayerTournamentIndex, PlayerAccessLog, PlayerPushSubscription, NotificationLog, NotificationPreference } };
