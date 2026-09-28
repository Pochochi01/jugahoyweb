'use strict';
/**
 * Migration 038 — Los partidos de torneo bloquean la cancha en la agenda.
 *
 *  - time_slots.torneo_partido_id: fila 'ocupado' escrita por un partido programado
 *    (ON DELETE CASCADE → al rearmar/borrar partidos se liberan solos).
 *  - Backfill: escribe los turnos de los partidos ya programados y sin jugar.
 *    Si un turno ya estaba ocupado por otra cosa, no se pisa (se informa en consola).
 *
 * Segura / idempotente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('time_slots');
    if (!cols.torneo_partido_id) {
      await queryInterface.addColumn('time_slots', 'torneo_partido_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'torneo_partidos', key: 'id' }, onDelete: 'CASCADE',
      });
    }

    const [partidos] = await queryInterface.sequelize.query(`
      SELECT p.id, p.field_id, p.fecha, p.hora, t.duracion_partido
        FROM torneo_partidos p JOIN torneos t ON t.id = p.torneo_id
       WHERE p.field_id IS NOT NULL AND p.fecha IS NOT NULL AND p.estado = 'programado'
         AND t.estado NOT IN ('cancelado', 'finalizado')`);
    let conflictos = 0;
    for (const p of partidos) {
      const [h, m] = p.hora.split(':').map(Number);
      const ini = h * 60 + m, fin = ini + p.duracion_partido;
      for (let t = Math.floor(ini / 60) * 60; t < fin && t < 1440; t += 60) {
        const hora = `${String(t / 60).padStart(2, '0')}:00`;
        const [[fila]] = await queryInterface.sequelize.query(
          'SELECT id, estado, torneo_partido_id FROM time_slots WHERE field_id = ? AND fecha = ? AND hora = ?',
          { replacements: [p.field_id, p.fecha, hora] });
        if (!fila) {
          await queryInterface.sequelize.query(
            "INSERT INTO time_slots (field_id, fecha, hora, estado, torneo_partido_id, created_at, updated_at) VALUES (?, ?, ?, 'ocupado', ?, NOW(), NOW())",
            { replacements: [p.field_id, p.fecha, hora, p.id] });
        } else if (fila.estado === 'libre') {
          await queryInterface.sequelize.query(
            "UPDATE time_slots SET estado = 'ocupado', booking_id = NULL, torneo_partido_id = ? WHERE id = ?",
            { replacements: [p.id, fila.id] });
        } else if (fila.torneo_partido_id !== p.id) {
          conflictos++;
        }
      }
    }
    if (conflictos) console.warn(`[migration 038] ${conflictos} turnos de partidos ya estaban ocupados por reservas: revisá la programación.`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DELETE FROM time_slots WHERE torneo_partido_id IS NOT NULL').catch(() => {});
    await queryInterface.removeColumn('time_slots', 'torneo_partido_id').catch(() => {});
  },
};
