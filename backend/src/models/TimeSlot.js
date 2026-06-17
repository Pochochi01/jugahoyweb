const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TimeSlot = sequelize.define('TimeSlot', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  field_id:   { type: DataTypes.INTEGER, allowNull: false },
  fecha:      { type: DataTypes.DATEONLY, allowNull: false },
  hora:       { type: DataTypes.STRING(5), allowNull: false },  // "14:00"
  estado:     { type: DataTypes.ENUM('libre', 'ocupado'), defaultValue: 'libre' },
  booking_id: { type: DataTypes.INTEGER, allowNull: true },     // FK a Booking
}, {
  tableName: 'time_slots',
  indexes: [{ unique: true, fields: ['field_id', 'fecha', 'hora'] }],
});

module.exports = TimeSlot;
