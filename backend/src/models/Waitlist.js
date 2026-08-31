const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Inscripción a lista de espera para un turno ocupado (por cancha/horario/deporte).
// Parte del módulo opcional "Lista de espera + Recordatorios".
const Waitlist = sequelize.define('Waitlist', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:    { type: DataTypes.INTEGER, allowNull: false },
  field_id:      { type: DataTypes.INTEGER, allowNull: true },   // cancha ocupada (null = cualquiera del deporte)
  deporte:       { type: DataTypes.STRING(50) },
  fecha:         { type: DataTypes.DATEONLY, allowNull: false },
  hora:          { type: DataTypes.STRING(5), allowNull: false },
  duracion:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
  nombre:        { type: DataTypes.STRING(150) },
  telefono:      { type: DataTypes.STRING(30), allowNull: false },
  email:         { type: DataTypes.STRING(150), allowNull: true },
  user_id:       { type: DataTypes.INTEGER, allowNull: true },     // jugador logueado (web)
  origen:        { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'chatbot' },  // chatbot | web
  estado:        { type: DataTypes.ENUM('activo', 'notificado', 'cancelado', 'convertido'), allowNull: false, defaultValue: 'activo' },
  notificado_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
}, { tableName: 'waitlists' });

module.exports = Waitlist;
