const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Agenda = sequelize.define('Agenda', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  field_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora_inicio: { type: DataTypes.TIME, allowNull: false },
  hora_fin: { type: DataTypes.TIME, allowNull: false },
  estado: {
    type: DataTypes.ENUM('disponible', 'reservado', 'confirmado', 'cancelado', 'bloqueado'),
    defaultValue: 'disponible',
  },
  precio: { type: DataTypes.DECIMAL(10, 2) },
  metodo_pago: { type: DataTypes.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta') },
  notas: { type: DataTypes.TEXT },
  origen: { type: DataTypes.ENUM('web', 'manual', 'telefono'), defaultValue: 'web' },
}, { tableName: 'agenda' });

module.exports = Agenda;
