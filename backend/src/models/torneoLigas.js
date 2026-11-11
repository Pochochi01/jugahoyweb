/**
 * models/torneoLigas.js — Ligas, categorías por torneo, jugadores y ranking por liga (migración 057).
 * Un archivo por agregado (como models/gym.js); models/index.js los exporta y llama a asociar().
 */
const { DataTypes: T } = require('sequelize');
const sequelize = require('../config/database');

const GENEROS = ['masculino', 'femenino', 'mixto'];

const TorneoLiga = sequelize.define('TorneoLiga', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false },
  nombre: { type: T.STRING(100), allowNull: false },
  estado: { type: T.ENUM('activa', 'inactiva'), defaultValue: 'activa' },
}, { tableName: 'torneo_ligas' });

const PadelCategoria = sequelize.define('PadelCategoria', {
  id: { type: T.TINYINT, primaryKey: true },          // = número de categoría (1 = 1ra … 8 = 8va)
  nombre: { type: T.STRING(20), allowNull: false },
  estado: { type: T.ENUM('activa', 'inactiva'), defaultValue: 'activa' },
}, { tableName: 'padel_categorias', timestamps: false });

// Categoría que juega un torneo: cada una arma su propio cuadro (zonas → llave)
const TorneoCategoria = sequelize.define('TorneoCategoria', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false },
  categoria_id: { type: T.TINYINT, allowNull: false },
  estado: { type: T.ENUM('pendiente', 'zonas', 'llaves', 'finalizado'), defaultValue: 'pendiente' },
  puntos_asignados: { type: T.BOOLEAN, defaultValue: false },
  // Se activa al armar zonas; solo admin general / del club / organizador reabren (auditado)
  inscripciones_cerradas: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
  // Inicio de la llave de esta categoría (null = después de la fase de zonas)
  llave_inicio_fecha: { type: T.DATEONLY, allowNull: true },
  llave_inicio_hora: { type: T.STRING(5), allowNull: true },
  // Semifinales y final (null = último día del torneo)
  semis_fecha: { type: T.DATEONLY, allowNull: true }, semis_hora: { type: T.STRING(5), allowNull: true },
  final_fecha: { type: T.DATEONLY, allowNull: true }, final_hora: { type: T.STRING(5), allowNull: true },
}, { tableName: 'torneo_categorias' });

// Registro único de jugadores del club (por DNI): base del ranking y de la inscripción
const PadelJugador = sequelize.define('PadelJugador', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false },
  dni: { type: T.STRING(15), allowNull: false },
  nombre: { type: T.STRING(150), allowNull: false },
  whatsapp: T.STRING(30), email: T.STRING(150),
  genero: T.ENUM('masculino', 'femenino'),
  categoria_actual: T.TINYINT,
}, { tableName: 'padel_jugadores' });

// Acumulador ÚNICO por jugador + liga + categoría + género + temporada (nunca se suman entre sí)
const RankingPunto = sequelize.define('RankingPunto', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false },
  jugador_id: { type: T.INTEGER, allowNull: false },
  liga_id: { type: T.INTEGER, allowNull: false },
  categoria_id: { type: T.TINYINT, allowNull: false },
  genero: { type: T.ENUM(...GENEROS), allowNull: false },
  temporada: { type: T.SMALLINT, allowNull: false },
  // puntos = max(0, puntos_torneos + ajuste_manual) — el ajuste manual sobrevive a los recálculos
  puntos: { type: T.INTEGER, defaultValue: 0 },
  puntos_torneos: { type: T.INTEGER, defaultValue: 0 },
  ajuste_manual: { type: T.INTEGER, defaultValue: 0 },
}, { tableName: 'ranking_puntos' });

// Auditoría: cada cambio de puntos (torneo, ajuste manual, migración)
const RankingAjuste = sequelize.define('RankingAjuste', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false },
  ranking_id: T.INTEGER,
  jugador_id: { type: T.INTEGER, allowNull: false }, liga_id: { type: T.INTEGER, allowNull: false },
  categoria_id: { type: T.TINYINT, allowNull: false }, genero: { type: T.STRING(10), allowNull: false }, temporada: { type: T.SMALLINT, allowNull: false },
  puntos_anterior: { type: T.INTEGER, allowNull: false }, puntos_nuevo: { type: T.INTEGER, allowNull: false },
  tipo: { type: T.ENUM('fijar', 'sumar', 'restar', 'torneo', 'migracion', 'baja', 'recalculo'), allowNull: false },
  motivo: T.STRING(255), torneo_id: T.INTEGER, usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'ranking_ajustes', updatedAt: false });

// Historial de modificaciones manuales del puntaje de un jugador en un torneo
const TorneoPuntajeHistorial = sequelize.define('TorneoPuntajeHistorial', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, jugador_id: { type: T.INTEGER, allowNull: false },
  puntaje_anterior: { type: T.INTEGER, allowNull: false }, puntaje_nuevo: { type: T.INTEGER, allowNull: false },
  automatico: { type: T.BOOLEAN, defaultValue: false }, motivo: T.STRING(255), usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_puntajes_historial', updatedAt: false });

// Auditoría de cada armado de zonas (método, cantidades y reparto)
const TorneoZonaHistorial = sequelize.define('TorneoZonaHistorial', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, categoria_id: T.TINYINT,
  metodo: { type: T.STRING(30), defaultValue: 'snake_seeding' },
  zonas: { type: T.INTEGER, allowNull: false }, parejas: { type: T.INTEGER, allowNull: false },
  reparto: T.JSON, usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_zonas_historial', updatedAt: false });

// ── Ranking anual configurable (migración 060) ──
const INSTANCIAS = ['zona', '16avos', 'octavos', 'cuartos', 'semifinal', 'final', 'campeon'];
const CAMPOS_PUNTOS = { zona: 'puntos_zona', '16avos': 'puntos_16avos', octavos: 'puntos_8vos', cuartos: 'puntos_4tos', semifinal: 'puntos_semifinal', final: 'puntos_final', campeon: 'puntos_campeon' };

const RankingTemporada = sequelize.define('RankingTemporada', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false }, anio: { type: T.SMALLINT, allowNull: false },
  nombre: { type: T.STRING(60), allowNull: false }, estado: { type: T.ENUM('activa', 'cerrada'), defaultValue: 'activa' },
}, { tableName: 'ranking_temporadas' });

const RankingConfiguracion = sequelize.define('RankingConfiguracion', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  temporada_id: { type: T.INTEGER, allowNull: false }, categoria_id: { type: T.TINYINT, allowNull: false },
  ...Object.fromEntries(Object.values(CAMPOS_PUNTOS).map(c => [c, { type: T.INTEGER, allowNull: false, defaultValue: 0 }])),
  updated_by: T.STRING(150),
}, { tableName: 'ranking_configuracion' });

// Instancia y puntos de cada jugador en cada torneo/categoría (único: un torneo no suma dos veces)
const RankingResultado = sequelize.define('RankingResultado', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false }, torneo_id: { type: T.INTEGER, allowNull: false },
  categoria_id: { type: T.TINYINT, allowNull: false }, jugador_id: { type: T.INTEGER, allowNull: false },
  liga_id: { type: T.INTEGER, allowNull: false }, genero: { type: T.ENUM(...GENEROS), allowNull: false },
  temporada: { type: T.SMALLINT, allowNull: false }, instancia: { type: T.ENUM(...INSTANCIAS), allowNull: false },
  puntos: { type: T.INTEGER, defaultValue: 0 },
}, { tableName: 'ranking_resultados' });

// Reprogramaciones de partidos (match_reschedules) y cola de notificaciones preparada
const TorneoReprogramacion = sequelize.define('TorneoReprogramacion', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  partido_id: { type: T.INTEGER, allowNull: false }, torneo_id: { type: T.INTEGER, allowNull: false },
  old_fecha: T.DATEONLY, old_hora: T.STRING(5), old_field_id: T.INTEGER, old_estado: T.STRING(20),
  new_fecha: T.DATEONLY, new_hora: T.STRING(5), new_field_id: T.INTEGER, new_estado: T.STRING(20),
  motivo: T.STRING(255), usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_partido_reprogramaciones', updatedAt: false });

const TorneoNotificacion = sequelize.define('TorneoNotificacion', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, partido_id: T.INTEGER,
  tipo: { type: T.STRING(30), allowNull: false },
  destinatario_tipo: { type: T.ENUM('pareja', 'jugador', 'delegado', 'arbitro'), allowNull: false },
  destinatario_id: T.INTEGER, canal: { type: T.STRING(20), defaultValue: 'manual' },
  estado: { type: T.ENUM('pendiente', 'enviada', 'descartada'), defaultValue: 'pendiente' }, payload: T.JSON,
}, { tableName: 'torneo_notificaciones', updatedAt: false });

// Historial del plantel (team_player_changes)
const TorneoJugadorCambio = sequelize.define('TorneoJugadorCambio', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, pareja_id: { type: T.INTEGER, allowNull: false }, jugador_id: T.INTEGER,
  accion: { type: T.ENUM('CREATE', 'UPDATE', 'DELETE'), allowNull: false },
  datos_anteriores: T.JSON, datos_nuevos: T.JSON, usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_jugador_cambios', updatedAt: false });

// Auditoría de inscripciones: alta, modificación, baja, zonas generadas, bloqueo y reapertura
const TorneoInscripcionEvento = sequelize.define('TorneoInscripcionEvento', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, categoria_id: T.TINYINT, pareja_id: T.INTEGER,
  accion: { type: T.ENUM('inscripcion_creada', 'inscripcion_modificada', 'inscripcion_eliminada', 'zonas_generadas', 'inscripciones_bloqueadas', 'inscripciones_reabiertas'), allowNull: false },
  detalle: T.JSON, motivo: T.STRING(500), usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_inscripcion_eventos', updatedAt: false });

// Horarios fijados a mano en la llave de referencia (antes de generarla)
const TorneoLlaveProgramacion = sequelize.define('TorneoLlaveProgramacion', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, categoria_id: { type: T.TINYINT, allowNull: false },
  clave: { type: T.STRING(20), allowNull: false },                 // partido del cuadro fijo: "cuartos-1", "final-1"
  field_id: { type: T.INTEGER, allowNull: false }, fecha: { type: T.DATEONLY, allowNull: false }, hora: { type: T.STRING(5), allowNull: false },
  motivo: T.STRING(255), usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_llave_programacion' });

function asociar({ Complex, Torneo, TorneoPareja, TorneoZona, TorneoPartido, TorneoJugador }) {
  Complex.hasMany(TorneoLiga, { foreignKey: 'id_tenant', as: 'ligas' });
  TorneoLiga.hasMany(Torneo, { foreignKey: 'liga_id', as: 'torneos' });
  Torneo.belongsTo(TorneoLiga, { foreignKey: 'liga_id', as: 'liga' });
  Torneo.hasMany(TorneoCategoria, { foreignKey: 'torneo_id', as: 'categorias', onDelete: 'CASCADE' });
  TorneoCategoria.belongsTo(Torneo, { foreignKey: 'torneo_id', as: 'torneo' });
  TorneoCategoria.belongsTo(PadelCategoria, { foreignKey: 'categoria_id', as: 'categoria' });
  for (const M of [TorneoPareja, TorneoZona, TorneoPartido]) M.belongsTo(PadelCategoria, { foreignKey: 'categoria_id', as: 'categoriaDef' });
  TorneoJugador.belongsTo(PadelJugador, { foreignKey: 'jugador_id', as: 'registro' });
  TorneoPuntajeHistorial.belongsTo(TorneoJugador, { foreignKey: 'jugador_id', as: 'jugador' });
  PadelJugador.hasMany(RankingPunto, { foreignKey: 'jugador_id', as: 'puntos' });
  RankingPunto.belongsTo(PadelJugador, { foreignKey: 'jugador_id', as: 'jugador' });
  RankingPunto.belongsTo(TorneoLiga, { foreignKey: 'liga_id', as: 'liga' });
  RankingAjuste.belongsTo(PadelJugador, { foreignKey: 'jugador_id', as: 'jugador' });
  RankingAjuste.belongsTo(TorneoLiga, { foreignKey: 'liga_id', as: 'liga' });
  RankingTemporada.hasMany(RankingConfiguracion, { foreignKey: 'temporada_id', as: 'configuracion', onDelete: 'CASCADE' });
  RankingConfiguracion.belongsTo(RankingTemporada, { foreignKey: 'temporada_id', as: 'temporadaDef' });
  RankingResultado.belongsTo(Torneo, { foreignKey: 'torneo_id', as: 'torneo' });
}

module.exports = { modelos: { TorneoLiga, PadelCategoria, TorneoCategoria, PadelJugador, RankingPunto, RankingAjuste, TorneoPuntajeHistorial, TorneoZonaHistorial,
  RankingTemporada, RankingConfiguracion, RankingResultado, TorneoReprogramacion, TorneoNotificacion, TorneoJugadorCambio, TorneoInscripcionEvento, TorneoLlaveProgramacion }, asociar, GENEROS, INSTANCIAS, CAMPOS_PUNTOS };
