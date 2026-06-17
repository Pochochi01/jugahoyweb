const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Image = sequelize.define('Image', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  url: { type: DataTypes.STRING(255), allowNull: false },
  tipo: {
    type: DataTypes.ENUM('hero_slider', 'hero_banner', 'complejo', 'cancha', 'general'),
    defaultValue: 'general',
  },
  alt_text: { type: DataTypes.STRING(255) },
  orden: { type: DataTypes.INTEGER, defaultValue: 0 },
  activa: { type: DataTypes.BOOLEAN, defaultValue: true },
  editable_por_general_admin: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'images' });

module.exports = Image;
