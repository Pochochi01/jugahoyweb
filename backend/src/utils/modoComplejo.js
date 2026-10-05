'use strict';
/**
 * utils/modoComplejo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modo de operación de un complejo, derivado de si tiene canchas cargadas:
 *
 *   'deportivo' → tiene al menos una cancha (activa o no): todos los módulos;
 *                 el comercio se llama "Cantina".
 *   'almacen'   → sin canchas: solo el comercio, que se llama "Almacén"
 *                 (+ configuración / colaboradores / caja).
 *
 * No hay columna en la BD: la fuente de verdad es la existencia de filas en
 * `fields`. Al cargar la primera cancha el complejo pasa solo a 'deportivo'.
 */
const { Field } = require('../models');

const NOMBRE_COMERCIO = { deportivo: 'Cantina', almacen: 'Almacén' };

/** Arma el objeto de modo a partir de la cantidad de canchas. */
function modoDesdeCantidad(cantidad) {
  const modo = cantidad > 0 ? 'deportivo' : 'almacen';
  return { tiene_canchas: cantidad > 0, canchas: cantidad, modo, nombre_comercio: NOMBRE_COMERCIO[modo] };
}

/** @returns {Promise<{tiene_canchas:boolean, canchas:number, modo:'deportivo'|'almacen', nombre_comercio:string}>} */
async function modoComplejo(complexId) {
  const cantidad = await Field.count({ where: { complex_id: Number(complexId) } });
  return modoDesdeCantidad(cantidad);
}

/** Nombre visible del comercio ("Cantina" / "Almacén") para textos del backend. */
async function nombreComercio(complexId) {
  return (await modoComplejo(complexId)).nombre_comercio;
}

/**
 * Módulos deportivos habilitados según las canchas del complejo.
 *   escuela / profesores → al menos una cancha habilitada de cualquier deporte
 *   torneos              → EXCLUSIVO de pádel: el complejo tiene canchas de pádel
 * @param {Array<{deporte, activa}>} fields
 */
function modulosDesdeCanchas(fields = []) {
  // activa puede llegar como boolean (instancias) o 0/1 (consultas raw de MySQL); null = activa
  const habilitada = (f) => f.activa == null || Boolean(Number(f.activa));
  const alguna = fields.some(habilitada);
  const padel = fields.some(f => f.deporte === 'padel');
  return { escuela: alguna, profesores: alguna, torneos: padel };
}

async function modulosComplejo(complexId) {
  const fields = await Field.findAll({ where: { complex_id: Number(complexId) }, attributes: ['deporte', 'activa'], raw: true });
  return modulosDesdeCanchas(fields);
}

module.exports = { modoComplejo, modoDesdeCantidad, nombreComercio, NOMBRE_COMERCIO, modulosDesdeCanchas, modulosComplejo };
