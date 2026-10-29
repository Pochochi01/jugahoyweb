'use strict';
/**
 * Migration 051 — WhatsApp en modo manual + filtros de cuotas
 *
 *  entity_phone_mensajes (historial de mensajes de torneos/escuelas/profesores):
 *    - entity_phone_id y desde_numero pasan a NULL: en modo manual no hay teléfono vinculado.
 *    - destino NULL: un mensaje de difusión no tiene un destinatario único.
 *    - estado agrega 'generado' (texto preparado para compartir desde el dispositivo).
 *
 *  escuela_alumnos: turno, nivel y curso (opcionales) para filtrar la generación de cuotas.
 *  escuelas.plantillas_mensajes: plantillas configurables (difusión de actividades, cuotas).
 *
 * Compatible con los datos existentes (solo amplía columnas). Idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const m = await queryInterface.describeTable('entity_phone_mensajes');
    await queryInterface.changeColumn('entity_phone_mensajes', 'entity_phone_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.changeColumn('entity_phone_mensajes', 'desde_numero', { type: Sequelize.STRING(20), allowNull: true });
    await queryInterface.changeColumn('entity_phone_mensajes', 'destino', { type: Sequelize.STRING(20), allowNull: true });
    if (!/generado/.test(m.estado.type)) {
      await queryInterface.changeColumn('entity_phone_mensajes', 'estado', { type: Sequelize.ENUM('pendiente', 'enviado', 'error', 'generado'), defaultValue: 'pendiente' });
    }

    const a = await queryInterface.describeTable('escuela_alumnos');
    if (!a.turno) await queryInterface.addColumn('escuela_alumnos', 'turno', { type: Sequelize.ENUM('manana', 'tarde', 'noche'), allowNull: true, defaultValue: null });
    if (!a.nivel) await queryInterface.addColumn('escuela_alumnos', 'nivel', { type: Sequelize.STRING(60), allowNull: true, defaultValue: null });
    if (!a.curso) await queryInterface.addColumn('escuela_alumnos', 'curso', { type: Sequelize.STRING(60), allowNull: true, defaultValue: null });

    // Plantillas de mensajes configurables por escuela ({ normal, suspension, ... }; null = las del sistema)
    const e = await queryInterface.describeTable('escuelas');
    if (!e.plantillas_mensajes) await queryInterface.addColumn('escuelas', 'plantillas_mensajes', { type: Sequelize.JSON, allowNull: true, defaultValue: null });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('escuelas', 'plantillas_mensajes').catch(() => {});
    for (const c of ['turno', 'nivel', 'curso']) await queryInterface.removeColumn('escuela_alumnos', c).catch(() => {});
    // Los mensajes 'generado' no tienen teléfono: se borran para poder volver a NOT NULL.
    await queryInterface.sequelize.query("DELETE FROM entity_phone_mensajes WHERE estado = 'generado' OR entity_phone_id IS NULL");
    await queryInterface.changeColumn('entity_phone_mensajes', 'estado', { type: Sequelize.ENUM('pendiente', 'enviado', 'error'), defaultValue: 'pendiente' });
    await queryInterface.changeColumn('entity_phone_mensajes', 'destino', { type: Sequelize.STRING(20), allowNull: false });
    await queryInterface.changeColumn('entity_phone_mensajes', 'desde_numero', { type: Sequelize.STRING(20), allowNull: false });
    await queryInterface.changeColumn('entity_phone_mensajes', 'entity_phone_id', { type: Sequelize.INTEGER, allowNull: false });
  },
};
