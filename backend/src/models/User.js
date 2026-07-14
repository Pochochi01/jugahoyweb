const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  apellido: { type: DataTypes.STRING(100), allowNull: false },
  // La unicidad la garantiza el índice `email` de la BD (definido en la migración
  // inicial). NO usar `unique: true` acá: con sync() Sequelize agrega un índice
  // UNIQUE nuevo en cada arranque y satura la tabla (ER_TOO_MANY_KEYS, máx 64).
  email: { type: DataTypes.STRING(150), allowNull: false },
  // allowNull: true → usuarios registrados con Google no tienen contraseña local
  password:   { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
  telefono:   { type: DataTypes.STRING(20)  },
  google_id:  { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
  avatar_url: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
  rol: {
    type: DataTypes.ENUM('general_admin', 'complex_admin', 'collaborator', 'player'),
    defaultValue: 'player',
  },
  // Complejo asociado al jugador vía link de invitación.
  // Se rellena al consumir un invite; permite que el player entre directo a su
  // complejo al loguearse, sin selección manual. FK → complexes (SET NULL al borrar).
  default_complex_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'users' });

module.exports = User;
