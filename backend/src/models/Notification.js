const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  tipo: {
    type: DataTypes.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada'),
    allowNull: false,
  },
  titulo:     { type: DataTypes.STRING(200), allowNull: false },
  mensaje:    { type: DataTypes.TEXT },
  leida:      { type: DataTypes.BOOLEAN, defaultValue: false },
  booking_id: { type: DataTypes.INTEGER },
}, { tableName: 'notifications' });

module.exports = Notification;
