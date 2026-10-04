'use strict';
/**
 * services/whatsappEntidad — WhatsApp propio de torneos, escuelas y profesores (Baileys).
 *
 *   sesiones.js   conexión por QR, reconexión automática, unicidad del número
 *   almacenes.js  persistencia de la sesión: BD cifrada (def.) o archivos sessions/<tipo><id>
 *   red.js        diagnóstico de salida a web.whatsapp.com (DNS / firewall / proxy)
 *   entidades.js  entidad del tenant + lista blanca de destinatarios
 *   envios.js     cola de envío con pausa, límites y auditoría
 *
 * iniciar() se llama al arrancar el servidor: configura el mensaje de
 * confirmación al teléfono y reabre las sesiones que estaban conectadas.
 */
const sesiones = require('./sesiones');
const entidades = require('./entidades');
const envios = require('./envios');
const red = require('./red');
const almacenes = require('./almacenes');
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

let apagando = false;
/** pm2 restart/stop manda SIGINT: guardar sesiones y cerrar sockets sin cerrar sesión en WhatsApp. */
async function alApagar(senal) {
  if (apagando) return;
  apagando = true;
  const n = await Promise.race([sesiones.cerrarTodo(), new Promise(r => setTimeout(() => r(-1), 1200))]);
  console.log(`[wa-entidad] ${senal}: ${n >= 0 ? `${n} sesión(es) guardadas y cerradas` : 'cierre por tiempo'}`);
  process.exit(0);
}

async function iniciar({ senales = true } = {}) {
  if (senales) { process.once('SIGINT', () => alApagar('SIGINT')); process.once('SIGTERM', () => alApagar('SIGTERM')); }
  sesiones.iniciarVigilancia();
  const n = await sesiones.restaurarTodas();
  if (n) {
    console.log(`[wa-entidad] restaurando ${n} teléfono(s) de torneos/escuelas/profesores (almacén: ${almacenes.actual().tipo})`);
    // Con sesiones que reabrir, avisar en el log si el servidor no llega a WhatsApp Web
    red.diagnosticar().then(d => { if (!d.ok) console.warn(`[wa-entidad] ⚠ red: ${d.sugerencia}`, JSON.stringify(d.pasos.filter(p => !p.ok))); }).catch(() => {});
  }
}

module.exports = { sesiones, entidades, envios, red, almacenes, liberarTelefonoDe, iniciar };
