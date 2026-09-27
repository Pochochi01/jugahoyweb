const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ticket QR de un jugador. codigo_qr es un token aleatorio (lo que codifica el QR).
const TorneoTicket = sequelize.define('TorneoTicket', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  jugador_id:    { type: DataTypes.INTEGER, allowNull: false, unique: true },
  torneo_id:     { type: DataTypes.INTEGER, allowNull: false },
  codigo_qr:     { type: DataTypes.STRING(64), allowNull: false, unique: true },
  imagen_evento: { type: DataTypes.STRING(255) },
  usado_at:      { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'torneo_tickets' });

module.exports = TorneoTicket;
