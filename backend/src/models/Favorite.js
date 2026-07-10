'use strict';
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

/**
 * Favorite — relación N:N entre un jugador (player) y los complejos que marcó
 * como favoritos, para acceso rápido desde la web.
 * Índice único (player_id, complex_id) → evita duplicados.
 */
const Favorite = sequelize.define('Favorite', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  player_id:  { type: DataTypes.INTEGER, allowNull: false },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
}, {
  tableName: 'favorites',
  timestamps: true,
  indexes: [
    { name: 'uq_favorites_player_complex', unique: true, fields: ['player_id', 'complex_id'] },
    { name: 'idx_favorites_player',         fields: ['player_id'] },
  ],
});

module.exports = Favorite;
