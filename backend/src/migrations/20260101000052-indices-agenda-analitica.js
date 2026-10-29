'use strict';
/**
 * Inteligencia de Agenda: índice compuesto para las consultas agregadas por
 * cancha + rango de fechas + estado (GROUP BY día/hora/estado). Incluye las
 * columnas usadas en el SELECT para que MySQL resuelva desde el índice.
 */
const NOMBRE = 'idx_bookings_analitica';

module.exports = {
  async up(queryInterface) {
    const idx = await queryInterface.showIndex('bookings');
    if (idx.some(i => i.name === NOMBRE)) return;
    await queryInterface.addIndex('bookings', ['field_id', 'fecha', 'estado', 'hora_inicio', 'duracion'], { name: NOMBRE });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('bookings', NOMBRE);
  },
};
