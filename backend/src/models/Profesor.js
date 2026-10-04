const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Profesor de UN complejo (cualquier deporte). El mismo DNI puede existir en varios
// complejos (un registro por complejo); al loguearse elige en cuál operar.
// Acceso: usuario = DNI, password = DNI (se guarda hasheado).
const Profesor = sequelize.define('Profesor', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: DataTypes.INTEGER, allowNull: false },   // complexes.id
  nombre:    { type: DataTypes.STRING(100), allowNull: false },
  apellido:  { type: DataTypes.STRING(100), allowNull: false },
  dni:       { type: DataTypes.STRING(15), allowNull: false },
  password:  { type: DataTypes.STRING(255), allowNull: false },
  whatsapp:  { type: DataTypes.STRING(30) },
  // Deportes que enseña: ['futbol','tenis'] · null/[] = cualquiera
  deportes:  { type: DataTypes.JSON, allowNull: true },
  activo:    { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'profesores',
  defaultScope: { attributes: { exclude: ['password'] } },
  scopes: { withPassword: { attributes: { include: ['password'] } } },
});

module.exports = Profesor;
