const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Permiso de UN número de WhatsApp del club (club_integrations) sobre UN módulo.
// Sin fila = se aplica el valor por defecto del catálogo (whatsapp_modulos).
const ClubWhatsappModulo = sequelize.define('ClubWhatsappModulo', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  club_integration_id: { type: DataTypes.INTEGER, allowNull: false },
  modulo:              { type: DataTypes.STRING(30), allowNull: false },
  habilitado:          { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  updated_by:          { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'club_whatsapp_modulos',
  indexes: [{ name: 'uq_club_wa_modulo', unique: true, fields: ['club_integration_id', 'modulo'] }],
});

module.exports = ClubWhatsappModulo;
