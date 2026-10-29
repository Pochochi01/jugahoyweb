'use strict';
/**
 * Asignación de WhatsApp por módulo.
 *
 *  - whatsapp_modulos: catálogo configurable de módulos (clave, nombre, estado por
 *    defecto). Agregar un módulo futuro = insertar una fila, sin tocar código de permisos.
 *  - club_whatsapp_modulos: permisos de CADA número del club (club_integrations = el
 *    "club_whatsapp"; hoy 1 por club, mañana N) sobre cada módulo.
 *
 * Datos existentes: a cada integración actual se le cargan los permisos por defecto
 * (agenda, reservas y recordatorios ON; el resto OFF). Nunca se asume acceso a
 * torneos, escuelas o profesores.
 */
const CATALOGO = [
  ['agenda',         'Agenda de turnos', 'Avisos de turnos: cancelaciones y reprogramaciones desde el panel.', true,  1],
  ['reservas',       'Reservas',         'Chatbot de reservas, confirmaciones, lista de espera y verificación del teléfono.', true, 2],
  ['recordatorios',  'Recordatorios',    'Recordatorios automáticos y confirmación de asistencia.', true, 3],
  ['torneos',        'Torneos',          'Fixtures, resultados y avisos de partidos.', false, 4],
  ['escuelas',       'Escuelas',         'Consultas y mensajes de escuelas deportivas.', false, 5],
  ['profesores',     'Profesores',       'Clases y notificaciones de profesores.', false, 6],
  ['comunicaciones', 'Comunicaciones',   'Comunicaciones masivas.', false, 7],
  ['marketing',      'Marketing',        'Promociones y campañas.', false, 8],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const tablas = await queryInterface.showAllTables();
    if (!tablas.includes('whatsapp_modulos')) {
      await queryInterface.createTable('whatsapp_modulos', {
        clave:                 { type: Sequelize.STRING(30), primaryKey: true },
        nombre:                { type: Sequelize.STRING(60), allowNull: false },
        descripcion:           { type: Sequelize.STRING(255), allowNull: true },
        habilitado_por_defecto:{ type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        orden:                 { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        activo:                { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at:            { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:            { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.bulkInsert('whatsapp_modulos', CATALOGO.map(([clave, nombre, descripcion, def, orden]) =>
        ({ clave, nombre, descripcion, habilitado_por_defecto: def, orden, activo: true, created_at: new Date(), updated_at: new Date() })));
    }
    if (!tablas.includes('club_whatsapp_modulos')) {
      await queryInterface.createTable('club_whatsapp_modulos', {
        id:                  { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        club_integration_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'club_integrations', key: 'id' }, onDelete: 'CASCADE' },
        modulo:              { type: Sequelize.STRING(30), allowNull: false, references: { model: 'whatsapp_modulos', key: 'clave' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        habilitado:          { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        updated_by:          { type: Sequelize.INTEGER, allowNull: true },
        created_at:          { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at:          { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('club_whatsapp_modulos', ['club_integration_id', 'modulo'], { unique: true, name: 'uq_club_wa_modulo' });
      // Permisos por defecto para las integraciones existentes
      const [integs] = await queryInterface.sequelize.query('SELECT id FROM club_integrations');
      const filas = integs.flatMap(i => CATALOGO.map(([clave, , , def]) =>
        ({ club_integration_id: i.id, modulo: clave, habilitado: def, created_at: new Date(), updated_at: new Date() })));
      if (filas.length) await queryInterface.bulkInsert('club_whatsapp_modulos', filas);
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('club_whatsapp_modulos');
    await queryInterface.dropTable('whatsapp_modulos');
  },
};
