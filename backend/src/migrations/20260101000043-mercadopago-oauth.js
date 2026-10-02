'use strict';
/**
 * Migration 043 — MercadoPago vía OAuth (reemplaza los access tokens pegados a mano)
 *
 *  + mercadopago_tokens   una fila por complejo (tenant) vinculado por OAuth
 *      access_token / refresh_token   CIFRADOS (AES-256-GCM, ver utils/cifrado.js)
 *      expires_in / expires_at        vencimiento del access_token (se renueva solo)
 *      correo_vinculado               email de la cuenta de MercadoPago conectada
 *      mp_user_id, public_key, live_mode, scope
 *      estado                         'conectado' | 'revocado' (el refresh falló: hay que reconectar)
 *
 *  − complexes.mercadopago_token                    (token pegado en el panel)
 *  − club_integrations.mercadopago_access_token     (token pegado por el superadmin)
 *  − club_integrations.mercadopago_refresh_token
 *
 * ⚠️ Los tokens viejos NO se pueden convertir a OAuth: tras migrar, cada complejo
 *    debe tocar "Conectar con MercadoPago" para volver a cobrar online.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    if (!tablas.includes('mercadopago_tokens')) {
      await queryInterface.createTable('mercadopago_tokens', {
        id:               { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:       { type: N.INTEGER, allowNull: false, unique: true, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        access_token:     { type: N.TEXT, allowNull: false },
        refresh_token:    { type: N.TEXT, allowNull: false },
        expires_in:       { type: N.INTEGER, allowNull: false },
        expires_at:       { type: N.DATE, allowNull: false },
        correo_vinculado: { type: N.STRING(255) },
        mp_user_id:       { type: N.STRING(30) },
        public_key:       { type: N.STRING(255) },
        live_mode:        { type: N.BOOLEAN, allowNull: false, defaultValue: true },
        scope:            { type: N.TEXT },
        estado:           { type: N.ENUM('conectado', 'revocado'), allowNull: false, defaultValue: 'conectado' },
        ultimo_error:     { type: N.STRING(255) },
        conectado_por:    { type: N.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
        renovado_at:      { type: N.DATE },
        created_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('mercadopago_tokens', ['estado', 'expires_at'], { name: 'ix_mp_tokens_vencimiento' });
    }

    // Retiro de los tokens estáticos
    const cx = await queryInterface.describeTable('complexes');
    if (cx.mercadopago_token) await queryInterface.removeColumn('complexes', 'mercadopago_token');
    const ci = await queryInterface.describeTable('club_integrations');
    if (ci.mercadopago_access_token) await queryInterface.removeColumn('club_integrations', 'mercadopago_access_token');
    if (ci.mercadopago_refresh_token) await queryInterface.removeColumn('club_integrations', 'mercadopago_refresh_token');
  },

  async down(queryInterface, Sequelize) {
    // Se restauran las columnas (vacías: los tokens fijos no se recuperan)
    await queryInterface.addColumn('complexes', 'mercadopago_token', { type: Sequelize.STRING(255), allowNull: true }).catch(() => {});
    await queryInterface.addColumn('club_integrations', 'mercadopago_access_token', { type: Sequelize.TEXT, allowNull: true }).catch(() => {});
    await queryInterface.addColumn('club_integrations', 'mercadopago_refresh_token', { type: Sequelize.TEXT, allowNull: true }).catch(() => {});
    await queryInterface.dropTable('mercadopago_tokens').catch(() => {});
  },
};
