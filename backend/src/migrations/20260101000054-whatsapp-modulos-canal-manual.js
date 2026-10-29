'use strict';
/**
 * Canal por módulo de WhatsApp:
 *  - automatico: puede usar el número del club (chatbot / Meta / Baileys) si está habilitado.
 *  - manual:     NUNCA usa el número del club ni el chatbot; solo se comunica con los
 *                clientes desde el WhatsApp del dispositivo en el que se usa el sistema
 *                (whatsapp://send, copiar, compartir).
 * Torneos, escuelas, profesores, comunicaciones y marketing pasan a "manual" y se
 * deshabilitan sus permisos automáticos existentes.
 */
const MANUALES = ['torneos', 'escuelas', 'profesores', 'comunicaciones', 'marketing'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('whatsapp_modulos');
    if (!cols.canal) {
      await queryInterface.addColumn('whatsapp_modulos', 'canal', {
        type: Sequelize.ENUM('automatico', 'manual'), allowNull: false, defaultValue: 'automatico',
      });
    }
    await queryInterface.bulkUpdate('whatsapp_modulos', { canal: 'manual', habilitado_por_defecto: false }, { clave: MANUALES });
    await queryInterface.bulkUpdate('club_whatsapp_modulos', { habilitado: false }, { modulo: MANUALES });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('whatsapp_modulos', 'canal');
  },
};
