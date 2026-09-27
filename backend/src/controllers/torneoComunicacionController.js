'use strict';
/**
 * controllers/torneoComunicacionController.js
 * Mensajes del organizador a los jugadores por WhatsApp (canal elegido por el
 * superadmin: Meta o Baileys). Los avisos automáticos salen de torneoService.
 */
const { TorneoPareja, TorneoJugador } = require('../models');
const svc = require('../services/torneos/torneoService');
const notifier = require('../services/torneos/torneoNotifier');
const integrations = require('../services/integrations.service');
const baileys = require('../services/baileysService');

const send = (res, err) => res.status(err.status || 500).json({ message: err.message });

/** Estado del canal (sin credenciales). */
async function canal(req, res) {
  try {
    const proveedor = await notifier.proveedor(req.clubId);
    let conectado;
    if (proveedor === 'baileys') conectado = (await baileys.estado(req.clubId)).estado === 'conectado';
    else conectado = (await integrations.getMetaCredentials(req.clubId)).configured;
    res.json({ proveedor, conectado });
  } catch (err) { send(res, err); }
}

/**
 * POST /comunicacion/mensaje
 * body: { mensaje, destinatarios: 'todos' | 'pagados' | 'pendientes' | number[] (pareja ids) }
 */
async function difundir(req, res) {
  try {
    const mensaje = String(req.body?.mensaje || '').trim();
    if (mensaje.length < 3) return res.status(400).json({ message: 'Escribí un mensaje.' });
    if (mensaje.length > 1000) return res.status(400).json({ message: 'Máximo 1000 caracteres.' });

    const dest = req.body?.destinatarios ?? 'todos';
    const where = { torneo_id: req.torneo.id };
    if (Array.isArray(dest)) where.id = dest.map(Number);
    else if (dest === 'pagados') where.estado_pago = 'pagado';
    else if (dest === 'pendientes') where.estado_pago = 'pendiente';
    else where.estado_pago = ['pendiente', 'pagado'];

    const parejas = await TorneoPareja.findAll({ where, include: [{ model: TorneoJugador, as: 'jugadores' }] });
    const texto = `🎾 *${req.torneo.nombre}*\n\n${mensaje}`;
    const resultados = (await Promise.all(parejas.map(p => notifier.aPareja(req.clubId, p, texto)))).flat();
    res.json({
      parejas: parejas.length,
      enviados: resultados.filter(r => r.ok).length,
      fallidos: resultados.filter(r => !r.ok).length,
      errores: [...new Set(resultados.filter(r => !r.ok).map(r => r.error))].slice(0, 5),
    });
  } catch (err) { send(res, err); }
}

/** POST /comunicacion/proximos-partidos — reenvía a cada pareja su próximo partido. */
async function proximosPartidos(req, res) {
  try {
    const ids = Array.isArray(req.body?.pareja_ids) ? req.body.pareja_ids.map(Number) : undefined;
    res.json(await svc.notificarProximos(req.torneo, { parejaIds: ids }));
  } catch (err) { send(res, err); }
}

module.exports = { canal, difundir, proximosPartidos };
