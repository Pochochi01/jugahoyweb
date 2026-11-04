'use strict';
/**
 * Torneos: reprogramación auditada de partidos y edición del plantel (pareja).
 *
 *  - torneo_partido_reprogramaciones (= match_reschedules): cada cambio de día / hora / cancha /
 *    estado de programación de un partido, con motivo y usuario.
 *  - torneo_notificaciones: cola PREPARADA para avisos futuros (parejas, jugadores, delegados,
 *    árbitros). Se registran en estado 'pendiente'; hoy no se envían (Torneos es canal manual).
 *  - torneo_jugadores: fecha_nacimiento, posicion (drive / revés) y observaciones.
 *  - torneo_jugador_cambios (= team_player_changes): alta / modificación / baja de jugadores
 *    de una pareja con los datos anteriores y nuevos.
 *  - torneo_organizadores.permisos: permisos granulares del organizador (NULL = todos).
 *
 * Canchas: se reutiliza el catálogo existente (fields + torneo_canchas con sus franjas).
 */
module.exports = {
  async up(qi, S) {
    const tablas = await qi.showAllTables();
    const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true };
    const creado = { created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') } };

    if (!tablas.includes('torneo_partido_reprogramaciones')) {
      await qi.createTable('torneo_partido_reprogramaciones', {
        id,
        partido_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneo_partidos', key: 'id' }, onDelete: 'CASCADE' },
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        old_fecha: S.DATEONLY, old_hora: S.STRING(5), old_field_id: S.INTEGER, old_estado: S.STRING(20),
        new_fecha: S.DATEONLY, new_hora: S.STRING(5), new_field_id: S.INTEGER, new_estado: S.STRING(20),
        motivo: { type: S.STRING(255), allowNull: true },
        usuario_id: S.INTEGER, usuario: S.STRING(150),
        ...creado,
      });
      await qi.addIndex('torneo_partido_reprogramaciones', ['partido_id', 'created_at'], { name: 'idx_reprog_partido' });
      await qi.addIndex('torneo_partido_reprogramaciones', ['torneo_id'], { name: 'idx_reprog_torneo' });
    }
    if (!tablas.includes('torneo_notificaciones')) {
      await qi.createTable('torneo_notificaciones', {
        id,
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        partido_id: { type: S.INTEGER, allowNull: true, references: { model: 'torneo_partidos', key: 'id' }, onDelete: 'CASCADE' },
        tipo: { type: S.STRING(30), allowNull: false },                                         // 'reprogramacion', …
        destinatario_tipo: { type: S.ENUM('pareja', 'jugador', 'delegado', 'arbitro'), allowNull: false },
        destinatario_id: { type: S.INTEGER, allowNull: true },
        canal: { type: S.STRING(20), allowNull: false, defaultValue: 'manual' },
        estado: { type: S.ENUM('pendiente', 'enviada', 'descartada'), allowNull: false, defaultValue: 'pendiente' },
        payload: { type: S.JSON, allowNull: true },
        ...creado,
      });
      await qi.addIndex('torneo_notificaciones', ['torneo_id', 'estado'], { name: 'idx_notif_torneo_estado' });
    }
    const tj = await qi.describeTable('torneo_jugadores');
    if (!tj.fecha_nacimiento) await qi.addColumn('torneo_jugadores', 'fecha_nacimiento', { type: S.DATEONLY, allowNull: true });
    if (!tj.posicion) await qi.addColumn('torneo_jugadores', 'posicion', { type: S.ENUM('drive', 'reves'), allowNull: true });
    if (!tj.observaciones) await qi.addColumn('torneo_jugadores', 'observaciones', { type: S.STRING(255), allowNull: true });
    if (!tablas.includes('torneo_jugador_cambios')) {
      await qi.createTable('torneo_jugador_cambios', {
        id,
        torneo_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        pareja_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneo_parejas', key: 'id' }, onDelete: 'CASCADE' },
        jugador_id: { type: S.INTEGER, allowNull: true },   // sin FK: el jugador puede haberse borrado (DELETE)
        accion: { type: S.ENUM('CREATE', 'UPDATE', 'DELETE'), allowNull: false },
        datos_anteriores: S.JSON, datos_nuevos: S.JSON,
        usuario_id: S.INTEGER, usuario: S.STRING(150),
        ...creado,
      });
      await qi.addIndex('torneo_jugador_cambios', ['pareja_id', 'created_at'], { name: 'idx_jug_cambios_pareja' });
    }
    const org = await qi.describeTable('torneo_organizadores');
    if (!org.permisos) await qi.addColumn('torneo_organizadores', 'permisos', { type: S.JSON, allowNull: true });
  },

  async down(qi) {
    await qi.removeColumn('torneo_organizadores', 'permisos').catch(() => {});
    await qi.dropTable('torneo_jugador_cambios').catch(() => {});
    for (const c of ['observaciones', 'posicion', 'fecha_nacimiento']) await qi.removeColumn('torneo_jugadores', c).catch(() => {});
    await qi.dropTable('torneo_notificaciones').catch(() => {});
    await qi.dropTable('torneo_partido_reprogramaciones').catch(() => {});
  },
};
