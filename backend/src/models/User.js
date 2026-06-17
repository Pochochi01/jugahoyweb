const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  apellido: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
  // allowNull: true → usuarios registrados con Google no tienen contraseña local
  password:   { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
  telefono:   { type: DataTypes.STRING(20)  },
  google_id:  { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
  avatar_url: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
  rol: {
    type: DataTypes.ENUM('general_admin', 'complex_admin', 'collaborator', 'player'),
    defaultValue: 'player',
  },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'users' });

module.exports = User;
