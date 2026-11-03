'use strict';
/**
 * services/gym/scheduler.js — Tareas periódicas del módulo Gym (cada 15 min):
 *  - membresías vencidas → 'vencida'; socios con deuda fuera de los días de gracia → 'moroso'
 *  - clases terminadas → 'finalizada' (reservas sin marcar → ausente; lista de espera → cancelada)
 * Solo para complejos activos con el módulo habilitado.
 */
const { Complex } = require('../../models');
const cobranzas = require('./cobranzasService');
const clases = require('./clasesService');

let timer = null, corriendo = false;

async function tick() {
  if (corriendo) return;
  corriendo = true;
  try {
    const complejos = await Complex.findAll({ where: { modulo_gym: true, activo: true }, attributes: ['id'] });
    for (const { id } of complejos) {
      try {
        await cobranzas.procesarVencimientos(id);
        const n = await clases.finalizarPasadas(id);
        if (n) console.log(`[gym][scheduler] complejo ${id}: ${n} clase(s) finalizada(s)`);
      } catch (err) { console.error(`[gym][scheduler] complejo ${id}:`, err.message); }
    }
  } catch (err) { console.error('[gym][scheduler]', err.message); }
  finally { corriendo = false; }
}

function iniciar(minutos = 15) {
  if (timer) return;
  timer = setInterval(tick, minutos * 60 * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 30 * 1000);
  console.log(`✓ Gym: vencimientos y clases (revisión cada ${minutos} min).`);
}

module.exports = { iniciar, tick };
