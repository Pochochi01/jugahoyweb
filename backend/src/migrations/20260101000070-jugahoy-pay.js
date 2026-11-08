'use strict';
/**
 * Jugahoy Pay — motor único de cobros (QR dinámico + link + Checkout Pro), multiclub.
 *
 *  pay_orders            orden de cobro (token público UUID v4 → /pay/:token). Módulo y referencia
 *                        genéricos: cualquier módulo cobra sin tablas propias.
 *  pay_payments          cada pago del proveedor (provider_payment_id ÚNICO → idempotencia / duplicados).
 *  pay_events            auditoría: todo cambio de estado, con origen y usuario.
 *  pay_webhook_logs      cada notificación recibida (firma válida, procesada, error) — dedupe por request_id.
 *  pay_account_movements cuenta corriente del cliente por club (cargos y pagos → saldo y deuda).
 *
 * Tablas nuevas: no modifica ninguna existente. Rollback: down() las elimina.
 */
module.exports = {
  async up(qi, S) {
    const tablas = await qi.showAllTables();
    const ts = {
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
    };
    const ESTADOS = ['pendiente', 'procesando', 'parcial', 'aprobado', 'rechazado', 'vencido', 'cancelado', 'reembolsado'];

    if (!tablas.includes('pay_orders')) {
      await qi.createTable('pay_orders', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        token: { type: S.CHAR(36), allowNull: false },                       // UUID v4 público
        complex_id: { type: S.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        modulo: { type: S.STRING(30), allowNull: false },                    // reserva, cantina, escuela, torneo, gym, porteria, cuenta, otro…
        referencia_tipo: { type: S.STRING(40), allowNull: true },            // booking, escuela_pago, …
        referencia_id: { type: S.INTEGER, allowNull: true },
        grupo: { type: S.CHAR(36), allowNull: true },                        // liquidación (varias órdenes de un mismo turno)
        cliente_key: { type: S.STRING(80), allowNull: true },                // dni:… / tel:… / user:… (cuenta corriente)
        cliente_nombre: { type: S.STRING(150), allowNull: true },
        cliente_dni: { type: S.STRING(20), allowNull: true },
        cliente_email: { type: S.STRING(150), allowNull: true },
        cliente_telefono: { type: S.STRING(30), allowNull: true },
        concepto: { type: S.STRING(200), allowNull: false },
        detalle: { type: S.JSON, allowNull: true },                          // [{ concepto, importe, tipo }]
        moneda: { type: S.STRING(3), allowNull: false, defaultValue: 'ARS' },
        importe: { type: S.DECIMAL(12, 2), allowNull: false },
        importe_pagado: { type: S.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        permite_parcial: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        estado: { type: S.ENUM(...ESTADOS), allowNull: false, defaultValue: 'pendiente' },
        vence_at: { type: S.DATE, allowNull: true },
        pagado_at: { type: S.DATE, allowNull: true },
        metodo: { type: S.STRING(30), allowNull: true },                     // mercadopago, efectivo, transferencia…
        provider: { type: S.STRING(20), allowNull: false, defaultValue: 'mercadopago' },
        provider_checkout_id: { type: S.STRING(80), allowNull: true },       // preference id
        provider_checkout_url: { type: S.STRING(500), allowNull: true },
        creado_por_id: { type: S.INTEGER, allowNull: true },
        creado_por: { type: S.STRING(150), allowNull: true },
        metadata: { type: S.JSON, allowNull: true },
        ...ts,
      });
      await qi.addIndex('pay_orders', ['token'], { unique: true, name: 'uq_pay_orders_token' });
      await qi.addIndex('pay_orders', ['complex_id', 'estado', 'created_at'], { name: 'idx_pay_orders_club' });
      await qi.addIndex('pay_orders', ['complex_id', 'modulo', 'referencia_tipo', 'referencia_id'], { name: 'idx_pay_orders_ref' });
      await qi.addIndex('pay_orders', ['grupo'], { name: 'idx_pay_orders_grupo' });
      await qi.addIndex('pay_orders', ['complex_id', 'cliente_key'], { name: 'idx_pay_orders_cliente' });
      await qi.addIndex('pay_orders', ['estado', 'vence_at'], { name: 'idx_pay_orders_vence' });
    }
    if (!tablas.includes('pay_payments')) {
      await qi.createTable('pay_payments', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        order_id: { type: S.INTEGER, allowNull: false, references: { model: 'pay_orders', key: 'id' }, onDelete: 'CASCADE' },
        provider: { type: S.STRING(20), allowNull: false },
        provider_payment_id: { type: S.STRING(80), allowNull: false },
        estado: { type: S.STRING(20), allowNull: false },                    // approved, pending, rejected, cancelled, refunded, manual
        monto: { type: S.DECIMAL(12, 2), allowNull: false },
        metodo: { type: S.STRING(40), allowNull: true },                     // account_money, credit_card, efectivo…
        cuotas: { type: S.TINYINT, allowNull: true },
        aprobado_at: { type: S.DATE, allowNull: true },
        raw: { type: S.JSON, allowNull: true },
        ...ts,
      });
      await qi.addIndex('pay_payments', ['provider', 'provider_payment_id'], { unique: true, name: 'uq_pay_payments_provider' });
      await qi.addIndex('pay_payments', ['order_id'], { name: 'idx_pay_payments_order' });
    }
    if (!tablas.includes('pay_events')) {
      await qi.createTable('pay_events', {
        id: { type: S.BIGINT, primaryKey: true, autoIncrement: true },
        order_id: { type: S.INTEGER, allowNull: false, references: { model: 'pay_orders', key: 'id' }, onDelete: 'CASCADE' },
        tipo: { type: S.STRING(40), allowNull: false },
        estado_anterior: { type: S.STRING(20), allowNull: true },
        estado_nuevo: { type: S.STRING(20), allowNull: true },
        origen: { type: S.STRING(20), allowNull: true },                     // api, webhook, sync, admin, job, publico
        usuario: { type: S.STRING(150), allowNull: true },
        datos: { type: S.JSON, allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('pay_events', ['order_id', 'id'], { name: 'idx_pay_events_order' });
    }
    if (!tablas.includes('pay_webhook_logs')) {
      await qi.createTable('pay_webhook_logs', {
        id: { type: S.BIGINT, primaryKey: true, autoIncrement: true },
        provider: { type: S.STRING(20), allowNull: false },
        request_id: { type: S.STRING(120), allowNull: true },
        tipo: { type: S.STRING(40), allowNull: true },
        recurso_id: { type: S.STRING(80), allowNull: true },
        complex_id: { type: S.INTEGER, allowNull: true },
        firma_valida: { type: S.BOOLEAN, allowNull: true },
        procesado: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        resultado: { type: S.STRING(255), allowNull: true },
        ip: { type: S.STRING(64), allowNull: true },
        payload: { type: S.JSON, allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('pay_webhook_logs', ['provider', 'request_id'], { unique: true, name: 'uq_pay_webhook_request' });
      await qi.addIndex('pay_webhook_logs', ['recurso_id'], { name: 'idx_pay_webhook_recurso' });
    }
    if (!tablas.includes('pay_account_movements')) {
      await qi.createTable('pay_account_movements', {
        id: { type: S.BIGINT, primaryKey: true, autoIncrement: true },
        complex_id: { type: S.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        cliente_key: { type: S.STRING(80), allowNull: false },
        cliente_nombre: { type: S.STRING(150), allowNull: true },
        tipo: { type: S.ENUM('cargo', 'pago', 'ajuste', 'anulacion'), allowNull: false },
        importe: { type: S.DECIMAL(12, 2), allowNull: false },              // cargo +, pago −  (saldo deudor = SUM)
        concepto: { type: S.STRING(200), allowNull: false },
        modulo: { type: S.STRING(30), allowNull: true },
        order_id: { type: S.INTEGER, allowNull: true },
        usuario: { type: S.STRING(150), allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('pay_account_movements', ['complex_id', 'cliente_key', 'id'], { name: 'idx_pay_mov_cliente' });
      await qi.addIndex('pay_account_movements', ['order_id'], { name: 'idx_pay_mov_order' });
    }
  },
  async down(qi) {
    for (const t of ['pay_account_movements', 'pay_webhook_logs', 'pay_events', 'pay_payments', 'pay_orders']) await qi.dropTable(t).catch(() => {});
  },
};
