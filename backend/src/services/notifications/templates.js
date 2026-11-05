'use strict';
/**
 * services/notifications/templates.js — Catálogo de notificaciones de torneos.
 * Cada tipo define título, mensaje, la preferencia que lo controla y la acción (URL).
 * Funciones puras: sin acceso a base de datos (fáciles de testear y de extender).
 */
const PREFERENCIA = {
  recordatorio_partido: 'recordatorio_partidos',
  recordatorio_pago: 'recordatorio_pagos',
  resultado_ganador: 'resultado_partidos',
  resultado_perdedor: 'resultado_partidos',
  clasificado_zona: 'clasificaciones',
  avanza_llave: 'clasificaciones',
  eliminado_semifinal: 'finales',
  finalista: 'finales',
  campeon: 'finales',
  subcampeon: 'finales',
  torneo_finalizado: 'finales',
  manual: null,   // reenvíos / avisos del club: no se filtran por preferencia
};

const urlTorneo = (c) => (c.torneo?.id ? `/jugador/torneo/${c.torneo.id}` : '/jugador/dashboard');

const PLANTILLAS = {
  manual: (c) => ({ titulo: c.titulo || 'JugaHoy', mensaje: c.mensaje || '', url: c.url || urlTorneo(c) }),
  recordatorio_partido: (c) => ({
    titulo: '🏆 Tu partido comienza en 3 horas',
    mensaje: `Hola ${c.nombre}.\nTe recordamos que hoy tienes programado un partido en el torneo ${c.torneo.nombre}.\n🕒 Hora: ${c.hora}\n📍 Sede: ${c.sede}\nTe esperamos.\nNos vemos en cancha.`,
    url: `${urlTorneo(c)}?tab=resultados`,
  }),
  recordatorio_pago: (c) => ({
    titulo: '💳 Inscripción pendiente',
    mensaje: `Hola ${c.nombre}.\nAún no registramos el pago de tu inscripción para el torneo ${c.torneo.nombre}.\nCompleta tu pago para asegurar tu participación.`,
    url: `/torneos/${c.torneo.id}?pagar=${c.pareja_id}`,
    actions: [{ action: 'abrir', title: 'Pagar ahora' }],
  }),
  resultado_ganador: (c) => ({
    titulo: '🎉 ¡Felicitaciones!',
    mensaje: `Ganaste tu partido del torneo ${c.torneo.nombre}.\nSeguí así y mucha suerte en la próxima ronda.\n¡Vamos por más!`,
    url: `${urlTorneo(c)}?tab=resultados`,
  }),
  resultado_perdedor: (c) => ({
    titulo: '💪 Gran esfuerzo',
    mensaje: 'Gracias por participar.\nSabemos el esfuerzo que requiere cada partido.\nSeguí entrenando y preparándote para el próximo desafío.\nLo mejor está por venir.',
    url: `${urlTorneo(c)}?tab=resultados`,
  }),
  clasificado_zona: (c) => ({
    titulo: '✅ ¡Clasificaste!',
    mensaje: `Felicitaciones.\nHas logrado avanzar desde la fase de grupos en el torneo ${c.torneo.nombre}.\nAhora comienza una nueva etapa.\n¡Muchos éxitos en lo que viene!`,
    url: `${urlTorneo(c)}?tab=llaves`,
  }),
  avanza_llave: (c) => ({
    titulo: '🔥 Sigues avanzando',
    mensaje: 'Acabas de superar una nueva instancia del torneo.\nTu próximo desafío ya está en camino.\nSeguí dejando todo dentro de la cancha.',
    url: `${urlTorneo(c)}?tab=llaves`,
  }),
  eliminado_semifinal: (c) => ({
    titulo: '👏 Excelente torneo',
    mensaje: 'Has quedado a un paso de la gran final.\nFelicitaciones por el enorme torneo realizado.\nLlegar hasta semifinales es un logro importante.\nTe esperamos en la próxima edición.',
    url: `${urlTorneo(c)}?tab=llaves`,
  }),
  finalista: (c) => ({
    titulo: '🏆 ¡Estás en la final!',
    mensaje: 'Felicitaciones.\nHas conseguido un lugar en la gran final del torneo.\nAhora queda el último partido.\nMucha suerte.',
    url: `${urlTorneo(c)}?tab=llaves`,
  }),
  campeon: (c) => ({
    titulo: '🥇 ¡Campeón!',
    mensaje: `Felicitaciones.\nTe has consagrado campeón del torneo ${c.torneo.nombre}.\nGracias por formar parte de esta competición.\nDisfruta este gran logro.`,
    url: `${urlTorneo(c)}?tab=llaves`,
  }),
  subcampeon: (c) => ({
    titulo: '🥈 Gran torneo',
    mensaje: 'Felicitaciones por alcanzar la final.\nHas realizado un recorrido extraordinario.\nGracias por competir y representar los valores deportivos de JugaHoy.',
    url: `${urlTorneo(c)}?tab=llaves`,
  }),
  torneo_finalizado: (c) => ({
    titulo: '🏅 Gracias por participar',
    mensaje: `El torneo ${c.torneo.nombre} ha finalizado.\nGracias por ser parte de esta edición.\nMuy pronto habrá nuevos desafíos.`,
    url: `${urlTorneo(c)}?tab=posiciones`,
  }),
};

/** @returns {{ titulo, mensaje, url, actions? }} */
function render(tipo, ctx) {
  const fn = PLANTILLAS[tipo];
  if (!fn) throw new Error(`Tipo de notificación desconocido: ${tipo}`);
  return fn({ ...ctx, nombre: primerNombre(ctx.nombre) });
}
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || 'jugador';

module.exports = { render, PREFERENCIA, TIPOS: Object.keys(PLANTILLAS) };
