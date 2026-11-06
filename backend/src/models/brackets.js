/**
 * models/brackets.js — Plantillas de llaves configurables (migración 068).
 */
const { DataTypes: T } = require('sequelize');
const sequelize = require('../config/database');

const TournamentBracketTemplate = sequelize.define('TournamentBracketTemplate', {
  id: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: T.STRING(120), allowNull: false },
  id_tenant: T.INTEGER,                 // NULL = plantilla global
  min_pairs: T.SMALLINT,
  max_pairs: T.SMALLINT,
  zones: { type: T.TINYINT, allowNull: false },
  clasifican: { type: T.TINYINT, allowNull: false, defaultValue: 2 },
  template_json: { type: T.JSON, allowNull: false },
  active: { type: T.BOOLEAN, defaultValue: true },
  usuario: T.STRING(150),
}, { tableName: 'tournament_bracket_templates', underscored: true });

module.exports = { modelos: { TournamentBracketTemplate } };
