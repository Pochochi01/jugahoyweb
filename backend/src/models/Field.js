const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Field = sequelize.define('Field', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  complex_id:  { type: DataTypes.INTEGER, allowNull: false },
  nombre:      { type: DataTypes.STRING(100), allowNull: false },
  deporte: {
    type: DataTypes.ENUM('futbol', 'padel', 'tenis', 'basquet', 'voley', 'squash', 'otro'),
    allowNull: false,
  },
  // Superficie según el deporte (NULL para basket/squash). Ver utils/canchas.js.
  superficie:  { type: DataTypes.STRING(30), allowNull: true, defaultValue: null },
  // Identificador incremental por complejo: "C1", "C2"... Se asigna al crear.
  identificador: { type: DataTypes.STRING(10), allowNull: true, defaultValue: null },
  // WhatsApp de contacto propio de la cancha (fallback: el del complejo).
  // Formato: +549 + área (sin 0) + número (sin 15). NULL = usar el del complejo.
  whatsapp_contacto: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
  piso:        { type: DataTypes.ENUM('cesped_sintetico', 'cemento', 'parquet', 'tierra', 'otro') },
  dimensiones: { type: DataTypes.STRING(50) },
  duracion_turno: { type: DataTypes.INTEGER, defaultValue: 60 },
  duraciones_permitidas: { type: DataTypes.JSON, defaultValue: [60] },
  precios_por_duracion:  { type: DataTypes.JSON, defaultValue: {} },
  techada:     { type: DataTypes.BOOLEAN, defaultValue: false },
  precio_base: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  // Monto fijo de la seña para pagar online (lo define el admin por cancha).
  // 0 / null → no se ofrece la opción "pagar seña" en esta cancha.
  sena_monto:  { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: null },
  activa:      { type: DataTypes.BOOLEAN, defaultValue: true },
  hora_apertura: { type: DataTypes.STRING(5), defaultValue: '08:00' },
  hora_cierre:   { type: DataTypes.STRING(5), defaultValue: '02:00' },
  imagen_url:  { type: DataTypes.STRING(255) },
}, { tableName: 'fields' });

module.exports = Field;
