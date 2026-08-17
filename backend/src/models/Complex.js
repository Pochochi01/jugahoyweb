const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Complex = sequelize.define('Complex', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(150), allowNull: false },
  descripcion: { type: DataTypes.TEXT },
  direccion: { type: DataTypes.STRING(255), allowNull: false },
  ciudad: { type: DataTypes.STRING(100) },
  provincia: { type: DataTypes.STRING(100) },
  telefono: { type: DataTypes.STRING(20) },
  // Número de WhatsApp del botón "Comunicate con la cancha" del chatbot.
  // Formato: +549 + área (sin 0) + número (sin 15). NULL = sin botón.
  whatsapp_contacto: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
  // URL del botón "Ver la web" del chatbot. NULL = usar la home por defecto.
  link_invitacion: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
  // Máximo de turnos "no asistidos" por usuario en un mes antes de bloquear.
  max_inasistencias_mes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
  email: { type: DataTypes.STRING(150) },
  prestaciones: { type: DataTypes.JSON },
  logo_url: { type: DataTypes.STRING(255) },
  banner_url: { type: DataTypes.STRING(255) },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  mercadopago_token: { type: DataTypes.STRING(255) },
  cuentas_bancarias: { type: DataTypes.JSON },
}, { tableName: 'complexes' });

module.exports = Complex;
