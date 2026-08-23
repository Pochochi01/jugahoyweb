const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Plantilla de turno fijo (recurrente semanal).
const RecurringBooking = sequelize.define('RecurringBooking', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:       { type: DataTypes.INTEGER, allowNull: false },
  field_id:         { type: DataTypes.INTEGER, allowNull: false },
  dia_semana:       { type: DataTypes.INTEGER, allowNull: false },   // 0=Dom .. 6=Sáb
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false },
  hora_fin:         { type: DataTypes.STRING(5), allowNull: false },
  duracion:         { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
  nombre_cliente:   { type: DataTypes.STRING(150), allowNull: false },
  telefono_cliente: { type: DataTypes.STRING(30) },
  monto:            { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  metodo_pago:      { type: DataTypes.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'), defaultValue: 'efectivo' },
  desde_fecha:      { type: DataTypes.DATEONLY, allowNull: false },
  activo:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_by:       { type: DataTypes.INTEGER },
}, { tableName: 'recurring_bookings' });

module.exports = RecurringBooking;
