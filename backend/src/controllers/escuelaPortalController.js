'use strict';
/**
 * controllers/escuelaPortalController.js — Escuela: portal del ALUMNO / PADRE
 *
 * Sin usuario ni contraseña: se entra con el link personal del alumno
 * (/escuela/alumno/<token>, 48 caracteres aleatorios) que llega en los mensajes
 * de WhatsApp. Muestra horarios, cuotas y avisos. No expone DNI ni datos de
 * otros alumnos. El link se puede regenerar desde el panel si se filtra.
 */
const { Op } = require('sequelize');
const { EscuelaAlumno, EscuelaCategoria, EscuelaAviso } = require('../models');
const svc = require('../services/escuela/escuelaService');

async function portal(req, res) {
  try {
    const token = String(req.params.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ message: 'Link inválido.' });
    const a = await EscuelaAlumno.findOne({ where: { token_portal: token, estado: 'activo' }, include: [{ model: EscuelaCategoria, as: 'categoria' }] });
    if (!a) return res.status(404).json({ message: 'Link inválido o alumno dado de baja.' });

    const ctx = await svc.contextoAlumno(a);
    // Avisos: de hoy en adelante (y la última semana) para su categoría o toda la escuela
    const desde = new Date(`${svc.hoy()}T12:00:00`); desde.setDate(desde.getDate() - 7);
    const avisos = await EscuelaAviso.findAll({
      where: { complex_id: a.complex_id, fecha: { [Op.gte]: desde.toISOString().slice(0, 10) }, [Op.or]: [{ categoria_id: a.categoria_id }, { categoria_id: null, escuela_id: a.categoria?.escuela_id ?? null }] },
      order: [['fecha', 'DESC']], limit: 20,
    });
    delete ctx.alumno.responsable_whatsapp;
    res.json({
      ...ctx,
      pagos: ctx.pagos.map(p => ({ periodo: p.periodo, monto: p.monto, estado: p.estado, fecha_pago: p.fecha_pago, comprobante: p.comprobante })),
      pago: ctx.pago && { periodo: ctx.pago.periodo, monto: ctx.pago.monto, estado: ctx.pago.estado, fecha_pago: ctx.pago.fecha_pago, comprobante: ctx.pago.comprobante },
      avisos: avisos.map(v => ({ fecha: v.fecha, estado: v.estado, mensaje: v.mensaje, general: v.categoria_id == null })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { portal };
