/**
 * utils/modoComplejo.js — modo de operación del complejo (espejo del backend).
 *
 *   deportivo → tiene canchas: todos los módulos; el comercio se llama "Cantina".
 *   almacen   → sin canchas: solo el comercio, llamado "Almacén"
 *               (+ Configuración y Colaboradores para administrarlo).
 *
 * Se deriva de las canchas cargadas (`complex.fields`), así el menú cambia en
 * cuanto se agrega la primera cancha, sin recargar.
 */
export function esAlmacen(complex) {
  if (!complex) return false;
  if (Array.isArray(complex.fields)) return complex.fields.length === 0;
  return complex.modo === 'almacen';
}

/** Nombre visible del módulo comercial para el complejo. */
export const nombreComercio = (complex) => (esAlmacen(complex) ? 'Almacén' : 'Cantina');
