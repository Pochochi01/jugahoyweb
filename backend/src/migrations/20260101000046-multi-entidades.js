'use strict';
/**
 * Migration 046 — Multi‑entidades por complejo (escuelas, profesores y torneos de cualquier deporte)
 *
 *  escuelas                       N escuelas por complejo (fútbol, tenis, pádel…).
 *      La escuela única anterior (escuela_config) se convierte en una fila de
 *      `escuelas` (deporte 'futbol') y sus categorías/avisos pasan a colgar de ella.
 *  escuela_categorias.escuela_id  categoría → escuela (alumnos, horarios y cuotas
 *      cuelgan de la categoría, así que quedan en la escuela correcta).
 *  escuela_avisos.escuela_id      aviso de una escuela (categoria_id null = toda la escuela).
 *  escuela_alumnos.estado         + 'pendiente' (pre‑inscripción desde la web, no ocupa cupo).
 *  escuela_profesores             profesor ↔ escuela (N:M, además de las categorías).
 *  profesores.deportes            JSON ['futbol','tenis'] — vacío/null = cualquier deporte.
 *  torneos.deporte                deporte del torneo (antes siempre pádel).
 *  torneo_profesores              profesor ↔ torneo (N:M), con rol (coordinador, árbitro…).
 *
 * escuela_config se conserva (solo lectura) por si hay que volver atrás. Idempotente.
 */
const DEPORTES = ['futbol', 'padel', 'tenis', 'basquet', 'voley', 'squash', 'otro'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };

    if (!tablas.includes('escuelas')) {
      await queryInterface.createTable('escuelas', {
        id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'complexes', key: 'id' }, onDelete: 'CASCADE' },
        nombre:           { type: Sequelize.STRING(150), allowNull: false },
        deporte:          { type: Sequelize.ENUM(...DEPORTES), allowNull: false, defaultValue: 'futbol' },
        descripcion:      { type: Sequelize.TEXT },
        estado:           { type: Sequelize.ENUM('activa', 'inactiva'), allowNull: false, defaultValue: 'activa' },
        whatsapp_oficial: { type: Sequelize.STRING(30) },
        dia_vencimiento:  { type: Sequelize.TINYINT, defaultValue: 10 },
        ...ts,
      });
      await queryInterface.addIndex('escuelas', ['complex_id']);
    }

    const cat = await queryInterface.describeTable('escuela_categorias');
    if (!cat.escuela_id) {
      await queryInterface.addColumn('escuela_categorias', 'escuela_id', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'escuelas', key: 'id' }, onDelete: 'CASCADE' });
    }
    const av = await queryInterface.describeTable('escuela_avisos');
    if (!av.escuela_id) {
      await queryInterface.addColumn('escuela_avisos', 'escuela_id', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'escuelas', key: 'id' }, onDelete: 'CASCADE' });
    }
    await queryInterface.changeColumn('escuela_alumnos', 'estado', { type: Sequelize.ENUM('activo', 'inactivo', 'pendiente'), allowNull: true, defaultValue: 'activo' });

    // Datos: una escuela por cada complejo que ya usaba la Escuela de fútbol
    const [complejos] = await queryInterface.sequelize.query(`
      SELECT c.id, cx.nombre AS club, cfg.nombre, cfg.whatsapp_oficial, cfg.dia_vencimiento
        FROM (SELECT complex_id AS id FROM escuela_config
              UNION SELECT complex_id FROM escuela_categorias
              UNION SELECT complex_id FROM escuela_avisos) c
        JOIN complexes cx ON cx.id = c.id
        LEFT JOIN escuela_config cfg ON cfg.complex_id = c.id`);
    for (const c of complejos) {
      const [[ya]] = await queryInterface.sequelize.query('SELECT id FROM escuelas WHERE complex_id = ? ORDER BY id LIMIT 1', { replacements: [c.id] });
      let escuelaId = ya?.id;
      if (!escuelaId) {
        await queryInterface.bulkInsert('escuelas', [{
          complex_id: c.id, nombre: c.nombre || 'Escuela de fútbol', deporte: 'futbol', estado: 'activa',
          whatsapp_oficial: c.whatsapp_oficial || null, dia_vencimiento: c.dia_vencimiento || 10,
          created_at: new Date(), updated_at: new Date(),
        }]);
        [[{ id: escuelaId }]] = await queryInterface.sequelize.query('SELECT MAX(id) AS id FROM escuelas WHERE complex_id = ?', { replacements: [c.id] });
      }
      await queryInterface.sequelize.query('UPDATE escuela_categorias SET escuela_id = ? WHERE complex_id = ? AND escuela_id IS NULL', { replacements: [escuelaId, c.id] });
      await queryInterface.sequelize.query('UPDATE escuela_avisos SET escuela_id = ? WHERE complex_id = ? AND escuela_id IS NULL', { replacements: [escuelaId, c.id] });
    }

    if (!tablas.includes('escuela_profesores')) {
      await queryInterface.createTable('escuela_profesores', {
        id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        escuela_id:  { type: Sequelize.INTEGER, allowNull: false, references: { model: 'escuelas', key: 'id' }, onDelete: 'CASCADE' },
        profesor_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'profesores', key: 'id' }, onDelete: 'CASCADE' },
        ...ts,
      });
      await queryInterface.addIndex('escuela_profesores', ['escuela_id', 'profesor_id'], { unique: true });
      // Los entrenadores que ya tenían categorías quedan asignados a su escuela
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO escuela_profesores (escuela_id, profesor_id, created_at, updated_at)
        SELECT DISTINCT c.escuela_id, epc.profesor_id, NOW(), NOW()
          FROM escuela_profesor_categoria epc JOIN escuela_categorias c ON c.id = epc.categoria_id
         WHERE c.escuela_id IS NOT NULL`);
    }

    const prof = await queryInterface.describeTable('profesores');
    if (!prof.deportes) await queryInterface.addColumn('profesores', 'deportes', { type: Sequelize.JSON, allowNull: true });

    const tor = await queryInterface.describeTable('torneos');
    if (!tor.deporte) await queryInterface.addColumn('torneos', 'deporte', { type: Sequelize.ENUM(...DEPORTES), allowNull: false, defaultValue: 'padel' });

    if (!tablas.includes('torneo_profesores')) {
      await queryInterface.createTable('torneo_profesores', {
        id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id:   { type: Sequelize.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        profesor_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'profesores', key: 'id' }, onDelete: 'CASCADE' },
        rol:         { type: Sequelize.STRING(40), allowNull: true },
        ...ts,
      });
      await queryInterface.addIndex('torneo_profesores', ['torneo_id', 'profesor_id'], { unique: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('torneo_profesores').catch(() => {});
    await queryInterface.removeColumn('torneos', 'deporte').catch(() => {});
    await queryInterface.removeColumn('profesores', 'deportes').catch(() => {});
    await queryInterface.dropTable('escuela_profesores').catch(() => {});
    await queryInterface.sequelize.query("UPDATE escuela_alumnos SET estado = 'inactivo' WHERE estado = 'pendiente'").catch(() => {});
    await queryInterface.changeColumn('escuela_alumnos', 'estado', { type: Sequelize.ENUM('activo', 'inactivo'), defaultValue: 'activo' }).catch(() => {});
    await queryInterface.removeColumn('escuela_avisos', 'escuela_id').catch(() => {});
    await queryInterface.removeColumn('escuela_categorias', 'escuela_id').catch(() => {});
    await queryInterface.dropTable('escuelas').catch(() => {});
  },
};
