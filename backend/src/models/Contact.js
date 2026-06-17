/**
 * models/Contact.js
 * Mensajes de contacto recibidos desde el formulario público.
 */
const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

const Contact = sequelize.define('Contact', {
  id:        { type: DataTypes.INTEGER,      primaryKey: true, autoIncrement: true },
  nombre:    { type: DataTypes.STRING(100),  allowNull: false },
  email:     { type: DataTypes.STRING(150),  allowNull: false },
  telefono:  { type: DataTypes.STRING(25),   allowNull: true  },
  asunto:    { type: DataTypes.STRING(200),  allowNull: true  },
  mensaje:   { type: DataTypes.TEXT,         allowNull: false },
  ip_origen: { type: DataTypes.STRING(45),   allowNull: true  },
  leido:     { type: DataTypes.BOOLEAN,      defaultValue: false },
}, { tableName: 'contacts' });

module.exports = Contact;
