'use strict';
/**
 * Migration 036 — Módulo "Torneos de pádel" (zonas + llaves)
 *
 * Tablas (todas multi-tenant vía id_tenant → complexes.id, directo o por torneo):
 *   torneos               → torneo por club (categoría 1ª–8ª, género, estado, config de zonas)
 *   torneo_organizadores  → usuarios propios del módulo (login independiente)
 *   torneo_canchas        → canchas (fields) que el club cede al torneo + horario disponible
 *   torneo_parejas        → inscripción (pareja) con horarios preferidos y estado de pago
 *   torneo_jugadores      → los 2 jugadores de cada pareja (datos personales)
 *   torneo_zonas          → zonas de grupos
 *   torneo_partidos       → partidos de zona y de llave (con cancha + horario asignado)
 *   torneo_resultados     → sets y ganador de cada partido
 *   torneo_tickets        → ticket QR por jugador
 *
 * Además: club_integrations.wa_provider ('meta' | 'baileys'), que solo edita el superadmin.
 *
 * Segura / idempotente.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const N = Sequelize;
    const tablas = (await queryInterface.showAllTables()).map(t => (typeof t === 'string' ? t : t.tableName));
    const ts = {
      created_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: N.DATE, allowNull: false, defaultValue: N.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model, onDelete = 'CASCADE', allowNull = false) =>
      ({ type: N.INTEGER, allowNull, references: { model, key: 'id' }, onDelete });

    if (!tablas.includes('torneos')) {
      await queryInterface.createTable('torneos', {
        id:                 { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        id_tenant:          fk('complexes'),
        nombre:             { type: N.STRING(150), allowNull: false },
        descripcion:        { type: N.TEXT },
        categoria:          { type: N.TINYINT, allowNull: false },               // 1..8
        genero:             { type: N.ENUM('masculino', 'femenino', 'mixto'), allowNull: false },
        estado:             { type: N.ENUM('borrador', 'inscripcion', 'zonas', 'llaves', 'finalizado', 'cancelado'), allowNull: false, defaultValue: 'borrador' },
        fecha_inicio:       { type: N.DATEONLY, allowNull: false },
        fecha_fin:          { type: N.DATEONLY, allowNull: false },
        cupo_parejas:       { type: N.INTEGER, allowNull: false, defaultValue: 16 },
        precio_inscripcion: { type: N.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        parejas_por_zona:   { type: N.TINYINT, allowNull: false, defaultValue: 3 },
        clasifican_por_zona:{ type: N.TINYINT, allowNull: false, defaultValue: 2 },
        duracion_partido:   { type: N.INTEGER, allowNull: false, defaultValue: 90 },  // minutos
        descanso_minimo:    { type: N.INTEGER, allowNull: false, defaultValue: 60 },  // minutos entre partidos de una pareja
        imagen_evento:      { type: N.STRING(255) },
        ...ts,
      });
      await queryInterface.addIndex('torneos', ['id_tenant', 'estado'], { name: 'ix_torneos_tenant_estado' });
    }

    if (!tablas.includes('torneo_organizadores')) {
      await queryInterface.createTable('torneo_organizadores', {
        id:        { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        id_tenant: fk('complexes'),
        nombre:    { type: N.STRING(150) },
        usuario:   { type: N.STRING(80), allowNull: false, unique: true },
        password:  { type: N.STRING(255), allowNull: false },   // bcrypt
        whatsapp:  { type: N.STRING(30) },
        activo:    { type: N.BOOLEAN, allowNull: false, defaultValue: true },
        ...ts,
      });
    }

    if (!tablas.includes('torneo_canchas')) {
      await queryInterface.createTable('torneo_canchas', {
        id:        { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id: fk('torneos'),
        field_id:  fk('fields'),
        // [{ fecha:'YYYY-MM-DD'|null, desde:'09:00', hasta:'22:00' }] — fecha null = todos los días del torneo
        disponibilidad_horaria: { type: N.JSON, allowNull: false },
        ...ts,
      });
      await queryInterface.addIndex('torneo_canchas', ['torneo_id', 'field_id'], { unique: true, name: 'uq_torneo_cancha' });
    }

    if (!tablas.includes('torneo_zonas')) {
      await queryInterface.createTable('torneo_zonas', {
        id:        { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id: fk('torneos'),
        nombre:    { type: N.STRING(30), allowNull: false },
        ...ts,
      });
    }

    if (!tablas.includes('torneo_parejas')) {
      await queryInterface.createTable('torneo_parejas', {
        id:          { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id:   fk('torneos'),
        zona_id:     fk('torneo_zonas', 'SET NULL', true),
        // [{ fecha:'YYYY-MM-DD'|null, desde:'18:00', hasta:'23:00' }]
        horarios_preferidos: { type: N.JSON, allowNull: false },
        estado_pago: { type: N.ENUM('pendiente', 'pagado', 'cancelado', 'reembolsado'), allowNull: false, defaultValue: 'pendiente' },
        metodo_pago: { type: N.STRING(20) },
        monto:       { type: N.DECIMAL(10, 2) },
        mp_payment_id: { type: N.STRING(50), unique: true },
        user_id:     fk('users', 'SET NULL', true),
        ...ts,
      });
    }

    if (!tablas.includes('torneo_jugadores')) {
      await queryInterface.createTable('torneo_jugadores', {
        id:        { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        pareja_id: fk('torneo_parejas'),
        nombre:    { type: N.STRING(150), allowNull: false },
        dni:       { type: N.STRING(15), allowNull: false },
        whatsapp:  { type: N.STRING(30), allowNull: false },
        email:     { type: N.STRING(150) },
        categoria: { type: N.TINYINT, allowNull: false },
        genero:    { type: N.ENUM('masculino', 'femenino'), allowNull: false },
        ...ts,
      });
      await queryInterface.addIndex('torneo_jugadores', ['dni'], { name: 'ix_torneo_jugadores_dni' });
    }

    if (!tablas.includes('torneo_partidos')) {
      await queryInterface.createTable('torneo_partidos', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        torneo_id:  fk('torneos'),
        zona_id:    fk('torneo_zonas', 'CASCADE', true),
        ronda:      { type: N.ENUM('zona', 'octavos', 'cuartos', 'semifinal', 'final'), allowNull: false },
        orden:      { type: N.INTEGER, allowNull: false, defaultValue: 0 },     // posición dentro de la ronda (llave)
        pareja1_id: fk('torneo_parejas', 'SET NULL', true),
        pareja2_id: fk('torneo_parejas', 'SET NULL', true),
        es_bye:     { type: N.BOOLEAN, allowNull: false, defaultValue: false },
        siguiente_partido_id: fk('torneo_partidos', 'SET NULL', true),
        siguiente_slot: { type: N.TINYINT },                                 // 1 | 2
        field_id:   fk('fields', 'SET NULL', true),
        fecha:      { type: N.DATEONLY },
        hora:       { type: N.STRING(5) },
        fuera_preferencia: { type: N.BOOLEAN, allowNull: false, defaultValue: false },
        estado:     { type: N.ENUM('pendiente', 'programado', 'jugado', 'walkover'), allowNull: false, defaultValue: 'pendiente' },
        ...ts,
      });
      await queryInterface.addIndex('torneo_partidos', ['torneo_id', 'ronda'], { name: 'ix_torneo_partidos_ronda' });
    }

    if (!tablas.includes('torneo_resultados')) {
      await queryInterface.createTable('torneo_resultados', {
        id:         { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        partido_id: { ...fk('torneo_partidos'), unique: true },
        sets:       { type: N.JSON, allowNull: false },                   // [[6,3],[4,6],[10,7]]
        ganador_id: fk('torneo_parejas', 'SET NULL', true),
        ...ts,
      });
    }

    if (!tablas.includes('torneo_tickets')) {
      await queryInterface.createTable('torneo_tickets', {
        id:            { type: N.INTEGER, primaryKey: true, autoIncrement: true },
        jugador_id:    { ...fk('torneo_jugadores'), unique: true },
        torneo_id:     fk('torneos'),
        codigo_qr:     { type: N.STRING(64), allowNull: false, unique: true },
        imagen_evento: { type: N.STRING(255) },
        usado_at:      { type: N.DATE },
        ...ts,
      });
    }

    // Plantilla de Meta para avisos de torneo fuera de la ventana de 24 h
    await queryInterface.changeColumn('wa_templates', 'tipo', {
      type: N.ENUM('recordatorio_turno', 'lista_espera', 'confirmacion', 'torneo'), allowNull: false,
    });

    const integ = await queryInterface.describeTable('club_integrations');
    if (!integ.wa_provider) {
      await queryInterface.addColumn('club_integrations', 'wa_provider', {
        type: N.ENUM('meta', 'baileys'), allowNull: false, defaultValue: 'meta',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('wa_templates', { tipo: 'torneo' }).catch(() => {});
    await queryInterface.changeColumn('wa_templates', 'tipo', {
      type: Sequelize.ENUM('recordatorio_turno', 'lista_espera', 'confirmacion'), allowNull: false,
    }).catch(() => {});
    for (const t of ['torneo_tickets', 'torneo_resultados', 'torneo_partidos', 'torneo_jugadores',
      'torneo_parejas', 'torneo_zonas', 'torneo_canchas', 'torneo_organizadores', 'torneos']) {
      await queryInterface.dropTable(t).catch(() => {});
    }
    await queryInterface.removeColumn('club_integrations', 'wa_provider').catch(() => {});
  },
};
