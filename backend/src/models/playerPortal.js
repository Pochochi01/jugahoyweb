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
  endpoint: { type: T.TEXT, allowNull: false },
  keys: { type: T.JSON, allowNull: false },   // { p256dh, auth }
  user_agent: T.STRING(255),
}, { tableName: 'player_push_subscriptions', underscored: true });

module.exports = { modelos: { PlayerAccess, PlayerTournamentIndex, PlayerAccessLog, PlayerPushSubscription } };
