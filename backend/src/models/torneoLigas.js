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
  puntos: { type: T.INTEGER, defaultValue: 0 },
}, { tableName: 'ranking_puntos' });

// Auditoría: cada cambio de puntos (torneo, ajuste manual, migración)
const RankingAjuste = sequelize.define('RankingAjuste', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  id_tenant: { type: T.INTEGER, allowNull: false },
  ranking_id: T.INTEGER,
  jugador_id: { type: T.INTEGER, allowNull: false }, liga_id: { type: T.INTEGER, allowNull: false },
  categoria_id: { type: T.TINYINT, allowNull: false }, genero: { type: T.STRING(10), allowNull: false }, temporada: { type: T.SMALLINT, allowNull: false },
  puntos_anterior: { type: T.INTEGER, allowNull: false }, puntos_nuevo: { type: T.INTEGER, allowNull: false },
  tipo: { type: T.ENUM('fijar', 'sumar', 'restar', 'torneo', 'migracion', 'baja'), allowNull: false },
  motivo: T.STRING(255), torneo_id: T.INTEGER, usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'ranking_ajustes', updatedAt: false });

// Historial de modificaciones manuales del puntaje de un jugador en un torneo
const TorneoPuntajeHistorial = sequelize.define('TorneoPuntajeHistorial', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  torneo_id: { type: T.INTEGER, allowNull: false }, jugador_id: { type: T.INTEGER, allowNull: false },
  puntaje_anterior: { type: T.INTEGER, allowNull: false }, puntaje_nuevo: { type: T.INTEGER, allowNull: false },
  automatico: { type: T.BOOLEAN, defaultValue: false }, motivo: T.STRING(255), usuario_id: T.INTEGER, usuario: T.STRING(150),
}, { tableName: 'torneo_puntajes_historial', updatedAt: false });

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
}

module.exports = { modelos: { TorneoLiga, PadelCategoria, TorneoCategoria, PadelJugador, RankingPunto, RankingAjuste, TorneoPuntajeHistorial }, asociar, GENEROS };
