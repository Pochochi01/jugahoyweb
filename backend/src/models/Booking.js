const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Booking = sequelize.define('Booking', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  field_id:         { type: DataTypes.INTEGER, allowNull: false },
  fecha:            { type: DataTypes.DATEONLY, allowNull: false },
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false },
  hora_fin:         { type: DataTypes.STRING(5), allowNull: false },
  duracion:         { type: DataTypes.INTEGER, allowNull: false },
  nombre_cliente:   { type: DataTypes.STRING(150), allowNull: false },
  telefono_cliente: { type: DataTypes.STRING(30) },
  email_cliente:    { type: DataTypes.STRING(150) },
  metodo_pago: {
    type: DataTypes.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'),
    defaultValue: 'efectivo',
  },
  monto:      { type: DataTypes.DECIMAL(10, 2) },
  // user_id: ID del player que hizo la reserva online (null si la creó el admin)
  user_id:    { type: DataTypes.INTEGER },
  // estados de pago:
  //  - pendiente_pago : creada, reteniendo el slot, esperando que MP apruebe
  //  - pendiente      : creada, a pagar en el complejo (offline) o a confirmar por admin
  //  - confirmado     : pago aprobado / turno confirmado
  //  - cancelado / rechazado : liberó el slot
  //  - no_asistido    : el cliente no se presentó (solo si el turno ya expiró)
  estado:     { type: DataTypes.ENUM('pendiente_pago', 'pendiente', 'confirmado', 'cancelado', 'rechazado', 'no_asistido'), defaultValue: 'confirmado' },

  // ── MercadoPago ──────────────────────────────────────────────
  // Tipo de pago elegido por el jugador al reservar.
  tipo_pago: {
    type: DataTypes.ENUM('seña', 'total', 'complejo'),
    allowNull: true,
    defaultValue: null,
  },
  // ID del payment de MP. UNIQUE para idempotencia (evita procesar 2 veces
  // el mismo pago entre webhook y sync).
  // Unicidad garantizada por el índice `uq_bookings_mp_payment_id` (migración 015).
  // No usar `unique: true` inline (sync() acumularía índices duplicados).
  mp_payment_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
  // Monto efectivamente cobrado online (seña o total). El total del turno sigue en `monto`.
  monto_pagado:  { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: null },

  notas:      { type: DataTypes.TEXT },
  created_by: { type: DataTypes.INTEGER },
  // Vincula la ocurrencia con su plantilla de turno fijo (null = turno normal).
  recurring_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },

  // ── Cobro del turno ──────────────────────────────────────────
  // El costo de cancha + consumos suma a caja SOLO cuando el turno está cobrado.
  cobrado:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cobrado_at:    { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  // Detalle del cobro: { jugadores, por_jugador, total, cancha, consumos, pagos:[bool] }
  cobro_detalle: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
}, { tableName: 'bookings' });

module.exports = Booking;
