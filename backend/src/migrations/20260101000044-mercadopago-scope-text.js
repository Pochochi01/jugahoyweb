'use strict';
/**
 * Migration 044 — Columnas de mercadopago_tokens con espacio suficiente
 *
 * MercadoPago devuelve en el OAuth un `scope` (lista de permisos) que puede
 * superar los 255 caracteres → "Data too long for column 'scope'" y la conexión
 * del complejo falla. Se pasa a TEXT.
 * De paso se amplían otros datos que vienen de MercadoPago:
 *   public_key        VARCHAR(100) → VARCHAR(255)
 *   correo_vinculado  VARCHAR(150) → VARCHAR(255)  (máximo de un email)
 *
 * Solo ensancha columnas: no se pierde ningún dato. Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('mercadopago_tokens');
    if (cols.scope) await queryInterface.changeColumn('mercadopago_tokens', 'scope', { type: Sequelize.TEXT, allowNull: true });
    if (cols.public_key) await queryInterface.changeColumn('mercadopago_tokens', 'public_key', { type: Sequelize.STRING(255), allowNull: true });
    if (cols.correo_vinculado) await queryInterface.changeColumn('mercadopago_tokens', 'correo_vinculado', { type: Sequelize.STRING(255), allowNull: true });
  },

  async down(queryInterface, Sequelize) {
    // Volver al tamaño anterior podría truncar datos: se recorta explícitamente antes
    await queryInterface.sequelize.query('UPDATE mercadopago_tokens SET scope = LEFT(scope, 255), public_key = LEFT(public_key, 100), correo_vinculado = LEFT(correo_vinculado, 150)');
    await queryInterface.changeColumn('mercadopago_tokens', 'scope', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.changeColumn('mercadopago_tokens', 'public_key', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.changeColumn('mercadopago_tokens', 'correo_vinculado', { type: Sequelize.STRING(150), allowNull: true });
  },
};
