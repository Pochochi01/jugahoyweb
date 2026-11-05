'use strict';
/**
 * Notificaciones push automáticas de torneos.
 *  - player_push_subscriptions (066) se amplía: proveedor (webpush | fcm), fcm_token,
 *    device_type, browser, installed (PWA instalada), last_active, activo.
 *  - notification_logs: historial + COLA persistente (estado pendiente → enviado/entregado/abierto/fallido/omitido).
 *    dedupe_key ÚNICA: el mismo evento nunca se encola dos veces para el mismo jugador.
 *  - notification_preferences: qué tipos acepta cada jugador (por DNI).
 * Jugadores = personas por DNI (no tienen fila en `users`): "usuario" = dni.
 */
module.exports = {
  async up(qi, S) {
    const tablas = await qi.showAllTables();
    const cols = await qi.describeTable('player_push_subscriptions');
    const add = async (c, def) => { if (!cols[c]) await qi.addColumn('player_push_subscriptions', c, def); };
    await add('proveedor', { type: S.ENUM('webpush', 'fcm'), allowNull: false, defaultValue: 'webpush' });
    await add('fcm_token', { type: S.STRING(512), allowNull: true });
    await add('device_type', { type: S.STRING(20), allowNull: true });   // mobile | tablet | desktop
    await add('browser', { type: S.STRING(30), allowNull: true });
    await add('installed', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
    await add('activo', { type: S.BOOLEAN, allowNull: false, defaultValue: true });
    await add('last_active', { type: S.DATE, allowNull: true });
    await qi.changeColumn('player_push_subscriptions', 'endpoint', { type: S.TEXT, allowNull: true });
    await qi.changeColumn('player_push_subscriptions', 'keys', { type: S.JSON, allowNull: true });
    if (!cols.fcm_token) await qi.sequelize.query('CREATE UNIQUE INDEX uq_player_push_fcm ON player_push_subscriptions (fcm_token(255))');

    if (!tablas.includes('notification_logs')) {
      await qi.createTable('notification_logs', {
        id: { type: S.BIGINT, primaryKey: true, autoIncrement: true },
        dni: { type: S.STRING(20), allowNull: false },                 // usuario_id
        nombre: { type: S.STRING(150), allowNull: true },
        id_tenant: { type: S.INTEGER, allowNull: true },
        titulo: { type: S.STRING(120), allowNull: false },
        mensaje: { type: S.TEXT, allowNull: false },
        tipo: { type: S.STRING(40), allowNull: false },
        estado: { type: S.ENUM('pendiente', 'procesando', 'enviado', 'entregado', 'abierto', 'fallido', 'omitido'), allowNull: false, defaultValue: 'pendiente' },
        motivo: { type: S.STRING(255), allowNull: true },             // omitido / fallido: por qué
        intentos: { type: S.TINYINT, allowNull: false, defaultValue: 0 },
        proximo_intento: { type: S.DATE, allowNull: true },
        lote: { type: S.STRING(36), allowNull: true },                // worker que tomó el registro (cola)
        fecha_envio: { type: S.DATE, allowNull: true },
        entregado_at: { type: S.DATE, allowNull: true },
        abierto_at: { type: S.DATE, allowNull: true },
        dispositivos: { type: S.SMALLINT, allowNull: false, defaultValue: 0 },
        torneo_id: { type: S.INTEGER, allowNull: true },
        partido_id: { type: S.INTEGER, allowNull: true },
        pareja_id: { type: S.INTEGER, allowNull: true },
        url: { type: S.STRING(255), allowNull: true },
        payload_json: { type: S.JSON, allowNull: true },
        dedupe_key: { type: S.STRING(150), allowNull: false },
        reenvio_de: { type: S.BIGINT, allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('notification_logs', ['dedupe_key'], { unique: true, name: 'uq_notif_dedupe' });
      await qi.addIndex('notification_logs', ['estado', 'proximo_intento'], { name: 'idx_notif_cola' });
      await qi.addIndex('notification_logs', ['id_tenant', 'torneo_id', 'created_at'], { name: 'idx_notif_torneo' });
      await qi.addIndex('notification_logs', ['dni', 'created_at'], { name: 'idx_notif_dni' });
    }
    if (!tablas.includes('notification_preferences')) {
      const si = { type: S.BOOLEAN, allowNull: false, defaultValue: true };
      await qi.createTable('notification_preferences', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        dni: { type: S.STRING(20), allowNull: false },                 // usuario_id
        recordatorio_partidos: si, recordatorio_pagos: si, resultado_partidos: si,
        clasificaciones: si, finales: si,
        promociones: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('notification_preferences', ['dni'], { unique: true, name: 'uq_notif_pref_dni' });
    }
    // Barridos de los jobs: partidos por estado/fecha y por actualización
    const ix = (await qi.showIndex('torneo_partidos')).map(i => i.name);
    if (!ix.includes('idx_partidos_estado_fecha')) await qi.addIndex('torneo_partidos', ['estado', 'fecha', 'hora'], { name: 'idx_partidos_estado_fecha' });
    if (!ix.includes('idx_partidos_updated')) await qi.addIndex('torneo_partidos', ['updated_at'], { name: 'idx_partidos_updated' });
  },
  async down(qi) {
    await qi.dropTable('notification_preferences').catch(() => {});
    await qi.dropTable('notification_logs').catch(() => {});
    for (const i of ['idx_partidos_estado_fecha', 'idx_partidos_updated']) await qi.removeIndex('torneo_partidos', i).catch(() => {});
    await qi.sequelize.query('DROP INDEX uq_player_push_fcm ON player_push_subscriptions').catch(() => {});
    for (const c of ['proveedor', 'fcm_token', 'device_type', 'browser', 'installed', 'activo', 'last_active']) await qi.removeColumn('player_push_subscriptions', c).catch(() => {});
  },
};
