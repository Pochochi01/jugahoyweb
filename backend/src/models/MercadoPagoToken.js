const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Conexión OAuth de un complejo (tenant) con su cuenta de MercadoPago.
 * access_token y refresh_token se guardan CIFRADOS (utils/cifrado.js): nunca
 * leerlos directo, usar services/mercadopagoOAuth.service.js → accessTokenValido().
 */
const MercadoPagoToken = sequelize.define('MercadoPagoToken', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:       { type: DataTypes.INTEGER, allowNull: false, unique: true },
  access_token:     { type: DataTypes.TEXT, allowNull: false },   // cifrado
  refresh_token:    { type: DataTypes.TEXT, allowNull: false },   // cifrado
  expires_in:       { type: DataTypes.INTEGER, allowNull: false },   // segundos (respuesta de MP)
  expires_at:       { type: DataTypes.DATE, allowNull: false },
  correo_vinculado: { type: DataTypes.STRING(255) },
  mp_user_id:       { type: DataTypes.STRING(30) },
  public_key:       { type: DataTypes.STRING(255) },
  live_mode:        { type: DataTypes.BOOLEAN, defaultValue: true },
  scope:            { type: DataTypes.TEXT },          // permisos que devuelve MP: pueden superar 255 caracteres
  // 'revocado': la renovación falló (el usuario quitó el permiso en MP) → hay que reconectar
  estado:           { type: DataTypes.ENUM('conectado', 'revocado'), defaultValue: 'conectado' },
  ultimo_error:     { type: DataTypes.STRING(255) },
  conectado_por:    { type: DataTypes.INTEGER },
  renovado_at:      { type: DataTypes.DATE },
}, {
  tableName: 'mercadopago_tokens',
  // Los tokens no salen en serializaciones por accidente
  defaultScope: { attributes: { exclude: ['access_token', 'refresh_token'] } },
  scopes: { conTokens: { attributes: { include: ['access_token', 'refresh_token'] } } },
});

module.exports = MercadoPagoToken;
