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

module.exports = { modoComplejo, modoDesdeCantidad, nombreComercio, NOMBRE_COMERCIO };
