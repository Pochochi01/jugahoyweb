const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Booking = sequelize.define('Booking', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  field_id:         { type: DataTypes.INTEGER, allowNull: false },
  fecha:            { type: DataTypes.DATEONLY, allowNull: false },
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false },
  hora_fin:         { type: DataTypes.STRING(5), allowNull: false },
  duracion:         { type: DataTypes.INTEGER, allowNull: false },
  nombre_cliente:   { type: DataTypes.STRING(150), allowNull: false },
  telefono_cliente: { type: DataTypes.STRING(30) },
  email_cliente:    { type: DataTypes.STRING(150) },
  metodo_pago: {
    type: DataTypes.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'),
    defaultValue: 'efectivo',
  },
  monto:      { type: DataTypes.DECIMAL(10, 2) },
  // user_id: ID del player que hizo la reserva online (null si la creó el admin)
  user_id:    { type: DataTypes.INTEGER },
  estado:     { type: DataTypes.ENUM('pendiente', 'confirmado', 'cancelado', 'rechazado'), defaultValue: 'confirmado' },
  notas:      { type: DataTypes.TEXT },
  created_by: { type: DataTypes.INTEGER },
}, { tableName: 'bookings' });

module.exports = Booking;
