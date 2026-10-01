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

/**
 * Módulos deportivos habilitados por las canchas (mismo criterio que el backend):
 *   escuela    → al menos una cancha de FÚTBOL habilitada
 *   profesores → canchas de pádel, o de fútbol habilitadas
 *   torneos    → canchas de pádel
 */
export function modulosComplejo(complex) {
  const fields = complex?.fields || [];
  const futbol = fields.some(f => f.deporte === 'futbol' && f.activa !== false);
  const padel = fields.some(f => f.deporte === 'padel');
  return { escuela: futbol, profesores: padel || futbol, torneos: padel };
}
