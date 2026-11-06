'use strict';
/** Utilidades compartidas por los tests del motor de llaves. */
const { LETRAS } = require('../bracketValidator');

/** Texto de cada partido por ronda: "1° Zona A vs 2° Zona B" / "Ganador cuartos-2" / "BYE". */
function textos(cuadro) {
  const et = (id) => cuadro.plazas.find(p => p.key === id)?.etiqueta;
  const out = {};
  for (const r of cuadro.rondas) {
    out[r.ronda] = r.partidos.map(p => {
      const lado = (slot) => {
        const id = p[`pareja${slot}_id`];
        if (id != null) return et(id);   // plaza directa o clasificado que pasó por BYE
        const ref = p.origen?.[slot === 1 ? 'local' : 'visitante'];
        return ref?.startsWith('W:') ? `Ganador ${ref.slice(2)}` : 'BYE';
      };
      return `${lado(1)} vs ${lado(2)}`;
    });
  }
  return out;
}

/** Asignación real: pareja de la zona z en la posición p → id z*10+p (zona recuperable con id/10). */
const asignarReal = (pl) => (pl.zona_idx + 1) * 10 + pl.posicion;
const zonaDe = (id) => Math.floor(id / 10);
const plaza = (pos, zona) => `${pos}° Zona ${zona}`;

/** Regla mínima válida (2 zonas) para construir casos inválidos. */
const reglaBase = () => ({
  zonas: 2, clasifican: 2,
  rondas: {
    semifinal: [
      { key: 'semifinal-1', local: '1A', visitante: '2B', siguiente: { key: 'final-1', slot: 1 } },
      { key: 'semifinal-2', local: '1B', visitante: '2A', siguiente: { key: 'final-1', slot: 2 } },
    ],
    final: [{ key: 'final-1', local: 'W:semifinal-1', visitante: 'W:semifinal-2', siguiente: null }],
  },
});

module.exports = { textos, asignarReal, zonaDe, plaza, reglaBase, LETRAS };
