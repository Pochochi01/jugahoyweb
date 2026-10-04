'use strict';
/**
 * services/whatsappEntidad — WhatsApp propio de torneos, escuelas y profesores (Baileys).
 *
 *   sesiones.js   conexión por QR, sesión cifrada en BD, unicidad del número
 *   entidades.js  entidad del tenant + lista blanca de destinatarios
 *   envios.js     cola de envío con pausa, límites y auditoría
 *
 * iniciar() se llama al arrancar el servidor: configura el mensaje de
 * confirmación al teléfono y reabre las sesiones que estaban conectadas.
 */
const sesiones = require('./sesiones');
const entidades = require('./entidades');
const envios = require('./envios');
const { EntityPhone } = require('../../models');

const QUIENES = { torneo: 'los inscriptos del torneo', escuela: 'los alumnos y sus familias', profesor: 'tus alumnos' };

sesiones.setTextoVinculado(async (fila) => {
  const e = fila && await entidades.cargarEntidad(fila.tenant_id, fila.entity_type, fila.entity_id);
  if (!e) return null;
  return `✅ *Teléfono vinculado*\n\nEste número quedó conectado a *${e.nombre}* (${e.club}) en JugaHoy.\n` +
    `Los mensajes para ${QUIENES[e.tipo]} van a salir desde acá.\n\n` +
    '_Para desvincularlo: en el panel tocá "Desvincular", o en WhatsApp → Dispositivos vinculados._';
});

/** Desvincula el teléfono de una entidad borrada (llamado desde hooks de los modelos). */
async function liberarTelefonoDe(tipo, id) {
  const fila = await EntityPhone.findOne({ where: { entity_type: tipo, entity_id: id } });
  if (!fila) return;
  await sesiones.desconectar(fila).catch(() => {});
  await fila.destroy();
}

async function iniciar() {
  const n = await sesiones.restaurarTodas();
  if (n) console.log(`[wa-entidad] restaurando ${n} teléfono(s) de torneos/escuelas/profesores`);
}

module.exports = { sesiones, entidades, envios, liberarTelefonoDe, iniciar };
