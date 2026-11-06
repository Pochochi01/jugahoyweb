'use strict';
/**
 * services/brackets/bracketTypes.js — Tipos del motor de llaves (JSDoc; el backend es JavaScript).
 *
 * @typedef {'16avos'|'octavos'|'cuartos'|'semifinal'|'final'} Ronda
 *
 * Lado de un partido en una plantilla:
 *   '1A'           1° de la Zona A (posición + letra de zona) — puede entrar en CUALQUIER ronda
 *   'W:cuartos-2'  ganador de ese partido
 *   null           BYE (solo en la primera ronda: el otro lado pasa directo)
 * @typedef {string|null} Lado
 *
 * @typedef {Object} PartidoPlantilla
 * @property {string} key                 "<ronda>-<orden>" (ej. "cuartos-1"); también la clave de programación
 * @property {Lado} local
 * @property {Lado} visitante
 * @property {{ key: string, slot: 1|2 }|null} siguiente   adónde avanza el ganador (null = final)
 *
 * @typedef {Object} ReglaLlave
 * @property {string} [nombre]
 * @property {number} zonas
 * @property {number} clasifican          clasificados por zona
 * @property {number} [min]               parejas mínimas (informativo en reglas internas; filtra en plantillas de BD)
 * @property {number} [max]
 * @property {Object<string,string>} [etiquetas]   nombre visible por ronda (ej. { octavos: 'Repechaje' })
 * @property {Object<Ronda, PartidoPlantilla[]>} rondas
 * @property {'interna'|'global'|'club'} [origen]
 * @property {number} [templateId]
 *
 * @typedef {Object} PlazaLlave
 * @property {number} zona_idx
 * @property {number} posicion
 * @property {string} key                 "<posicion>-<zona_idx>"
 * @property {string} etiqueta            "1° Zona A"
 *
 * @typedef {Object} PartidoCuadro         salida del generador (lo guarda torneoService.generarLlave)
 * @property {string} key
 * @property {number} orden
 * @property {number|string|null} pareja1_id   id real, clave de plaza (referencia) o null
 * @property {number|string|null} pareja2_id
 * @property {boolean} es_bye
 * @property {string|null} siguiente_key
 * @property {1|2|null} siguiente_slot
 * @property {string[]} despuesDe          partidos que deben jugarse antes (programación)
 * @property {{ local: Lado, visitante: Lado }} [origen]
 *
 * @typedef {Object} Cuadro
 * @property {number} tam
 * @property {{ ronda: Ronda, partidos: PartidoCuadro[] }[]} rondas
 * @property {PlazaLlave[]} plazas
 * @property {string} [regla]              nombre de la regla aplicada (sin regla = armado genérico)
 */
module.exports = {};
