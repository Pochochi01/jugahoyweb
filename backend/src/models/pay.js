/**
 * models/pay.js — Jugahoy Pay (migración 070).
 */
const { DataTypes: T } = require('sequelize');
const sequelize = require('../config/database');

const ESTADOS_ORDEN = ['pendiente', 'procesando', 'parcial', 'aprobado', 'rechazado', 'vencido', 'cancelado', 'reembolsado'];

const PayOrder = sequelize.define('PayOrder', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  token: { type: T.CHAR(36), allowNull: false, unique: true },
  complex_id: { type: T.INTEGER, allowNull: false },
  modulo: { type: T.STRING(30), allowNull: false },
  referencia_tipo: T.STRING(40),
  referencia_id: T.INTEGER,
  grupo: T.CHAR(36),
  cliente_key: T.STRING(80),
  cliente_nombre: T.STRING(150),
  cliente_dni: T.STRING(20),
  cliente_email: T.STRING(150),
  cliente_telefono: T.STRING(30),
  concepto: { type: T.STRING(200), allowNull: false },
  detalle: T.JSON,
  moneda: { type: T.STRING(3), defaultValue: 'ARS' },
  importe: { type: T.DECIMAL(12, 2), allowNull: false },
  importe_pagado: { type: T.DECIMAL(12, 2), defaultValue: 0 },
  permite_parcial: { type: T.BOOLEAN, defaultValue: false },
  estado: { type: T.ENUM(...ESTADOS_ORDEN), defaultValue: 'pendiente' },
  vence_at: T.DATE,
  pagado_at: T.DATE,
  metodo: T.STRING(30),
  provider: { type: T.STRING(20), defaultValue: 'mercadopago' },
  provider_checkout_id: T.STRING(80),
  provider_checkout_url: T.STRING(500),
  creado_por_id: T.INTEGER,
  creado_por: T.STRING(150),
  metadata: T.JSON,
}, { tableName: 'pay_orders', underscored: true });

const PayPayment = sequelize.define('PayPayment', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  order_id: { type: T.INTEGER, allowNull: false },
  provider: { type: T.STRING(20), allowNull: false },
  provider_payment_id: { type: T.STRING(80), allowNull: false },
  estado: { type: T.STRING(20), allowNull: false },
  monto: { type: T.DECIMAL(12, 2), allowNull: false },
  metodo: T.STRING(40),
  cuotas: T.TINYINT,
  aprobado_at: T.DATE,
  raw: T.JSON,
}, { tableName: 'pay_payments', underscored: true });

const PayEvent = sequelize.define('PayEvent', {
  id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
  order_id: { type: T.INTEGER, allowNull: false },
  tipo: { type: T.STRING(40), allowNull: false },
  estado_anterior: T.STRING(20),
  estado_nuevo: T.STRING(20),
  origen: T.STRING(20),
  usuario: T.STRING(150),
  datos: T.JSON,
}, { tableName: 'pay_events', underscored: true, updatedAt: false });

const PayWebhookLog = sequelize.define('PayWebhookLog', {
  id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
  provider: { type: T.STRING(20), allowNull: false },
  request_id: T.STRING(120),
  tipo: T.STRING(40),
  recurso_id: T.STRING(80),
  complex_id: T.INTEGER,
  firma_valida: T.BOOLEAN,
  procesado: { type: T.BOOLEAN, defaultValue: false },
  resultado: T.STRING(255),
  ip: T.STRING(64),
  payload: T.JSON,
}, { tableName: 'pay_webhook_logs', underscored: true, updatedAt: false });

const PayAccountMovement = sequelize.define('PayAccountMovement', {
  id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
  complex_id: { type: T.INTEGER, allowNull: false },
  cliente_key: { type: T.STRING(80), allowNull: false },
  cliente_nombre: T.STRING(150),
  tipo: { type: T.ENUM('cargo', 'pago', 'ajuste', 'anulacion'), allowNull: false },
  importe: { type: T.DECIMAL(12, 2), allowNull: false },
  concepto: { type: T.STRING(200), allowNull: false },
  modulo: T.STRING(30),
  order_id: T.INTEGER,
  usuario: T.STRING(150),
}, { tableName: 'pay_account_movements', underscored: true, updatedAt: false });

PayOrder.hasMany(PayPayment, { foreignKey: 'order_id', as: 'pagos' });
PayPayment.belongsTo(PayOrder, { foreignKey: 'order_id', as: 'orden' });
PayOrder.hasMany(PayEvent, { foreignKey: 'order_id', as: 'eventos' });

module.exports = { modelos: { PayOrder, PayPayment, PayEvent, PayWebhookLog, PayAccountMovement }, ESTADOS_ORDEN };
