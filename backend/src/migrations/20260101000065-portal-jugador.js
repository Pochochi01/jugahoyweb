'use strict';
/**
 * Portal de Jugador (solo lectura). Tablas NUEVAS, no toca ninguna existente:
 *  - player_access: credencial por PERSONA (DNI). Clave inicial = DNI (hash), cambio obligatorio.
 *  - player_tournament_index: índice derivado DNI → torneo / liga / temporada (se reconstruye
 *    desde torneo_jugadores; nunca es fuente de verdad, se puede borrar y regenerar).
 *  - player_access_logs: auditoría de cada acceso.
 */
module.exports = {
  async up(qi, S) {
    const tablas = await qi.showAllTables();
    const ts = {
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
    };
    if (!tablas.includes('player_access')) {
      await qi.createTable('player_access', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        dni: { type: S.STRING(20), allowNull: false },
        password_hash: { type: S.STRING(100), allowNull: false },
        must_change_password: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        activo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        intentos_fallidos: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        bloqueado_hasta: { type: S.DATE, allowNull: true },
        reset_token_hash: { type: S.STRING(100), allowNull: true },
        reset_expira: { type: S.DATE, allowNull: true },
        ultimo_login: { type: S.DATE, allowNull: true },
        indice_actualizado: { type: S.DATE, allowNull: true },
        ...ts,
      });
      await qi.addIndex('player_access', ['dni'], { unique: true, name: 'uq_player_access_dni' });
    }
    if (!tablas.includes('player_tournament_index')) {
      await qi.createTable('player_tournament_index', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        player_id: { type: S.INTEGER, allowNull: true },          // padel_jugadores.id (si está vinculado)
        dni: { type: S.STRING(20), allowNull: false },
        tournament_id: { type: S.INTEGER, allowNull: false, references: { model: 'torneos', key: 'id' }, onDelete: 'CASCADE' },
        league_id: { type: S.INTEGER, allowNull: true },
        season_id: { type: S.INTEGER, allowNull: true },          // temporada (año de inicio)
        complex_id: { type: S.INTEGER, allowNull: false },
        categoria_id: { type: S.TINYINT, allowNull: true },
        pareja_id: { type: S.INTEGER, allowNull: true },
        ...ts,
      });
      await qi.addIndex('player_tournament_index', ['dni', 'tournament_id'], { unique: true, name: 'uq_pti_dni_torneo' });
      await qi.addIndex('player_tournament_index', ['dni'], { name: 'idx_pti_dni' });
      await qi.addIndex('player_tournament_index', ['tournament_id'], { name: 'idx_pti_torneo' });
      await qi.addIndex('player_tournament_index', ['league_id'], { name: 'idx_pti_liga' });
    }
    if (!tablas.includes('player_access_logs')) {
      await qi.createTable('player_access_logs', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        dni: { type: S.STRING(20), allowNull: true },
        accion: { type: S.STRING(40), allowNull: false },       // login_ok, login_fail, view, denied…
        recurso: { type: S.STRING(60), allowNull: true },
        recurso_id: { type: S.INTEGER, allowNull: true },
        status: { type: S.SMALLINT, allowNull: true },
        ip: { type: S.STRING(64), allowNull: true },
        user_agent: { type: S.STRING(255), allowNull: true },
        created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('player_access_logs', ['dni', 'created_at'], { name: 'idx_pal_dni_fecha' });
    }
  },
  async down(qi) {
    for (const t of ['player_access_logs', 'player_tournament_index', 'player_access']) await qi.dropTable(t).catch(() => {});
  },
};
