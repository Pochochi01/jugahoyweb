'use strict';
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

const Invite = sequelize.define('Invite', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  // Token UUID de un solo uso (viaja en la URL)
  token: { type: DataTypes.STRING(36), allowNull: false, unique: true },

  complex_id:  { type: DataTypes.INTEGER, allowNull: false },
  // field_id ya no se usa (el invite es a nivel complejo). Se deja nullable por
  // compatibilidad con invitaciones antiguas.
  field_id:    { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },

  // Quién generó el link (complex_admin o collaborator)
  created_by:  { type: DataTypes.INTEGER, allowNull: false },

  // Quién usó el link (se rellena al reclamarlo por primera vez)
  player_id:   { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },

  // Sin vencimiento: el link no expira. Nullable por compatibilidad.
  expires_at:  { type: DataTypes.DATE,    allowNull: true, defaultValue: null },
  usado:       { type: DataTypes.BOOLEAN, defaultValue: false },

}, { tableName: 'invites' });

module.exports = Invite;
