const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Inscripción de una pareja. horarios_preferidos: mismo formato que TorneoCancha
// ([{ fecha: 'YYYY-MM-DD' | null, desde, hasta }]).
const TorneoPareja = sequelize.define('TorneoPareja', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id:   { type: DataTypes.INTEGER, allowNull: false },
  zona_id:     { type: DataTypes.INTEGER, allowNull: true },
  horarios_preferidos: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  estado_pago: { type: DataTypes.ENUM('pendiente', 'pagado', 'cancelado', 'reembolsado'), defaultValue: 'pendiente' },
  metodo_pago: { type: DataTypes.STRING(20) },
  monto:       { type: DataTypes.DECIMAL(10, 2) },
  mp_payment_id: { type: DataTypes.STRING(50), unique: true },
  user_id:     { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'torneo_parejas' });

module.exports = TorneoPareja;
