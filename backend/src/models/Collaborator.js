const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Collaborator = sequelize.define('Collaborator', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(100) },
  apellido: { type: DataTypes.STRING(100) },
  permisos: {
    type: DataTypes.JSON,
    defaultValue: {
      agenda: false,
      caja: false,
      operaciones: false,
      configuracion: false,
      colaboradores: false,
      estadisticas: false,
    },
  },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'collaborators' });

module.exports = Collaborator;
