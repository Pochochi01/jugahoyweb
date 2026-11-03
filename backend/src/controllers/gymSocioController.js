'use strict';
/**
 * controllers/gymSocioController.js — App del socio (/api/gym/socio/:token/...).
 * Acceso con el link/QR personal (qr_token), sin login, como el portal de escuelas.
 * Solo expone datos del propio socio: cuotas, pagos, reservas, rutinas, evaluaciones,
 * asistencia y su QR; permite reservar y cancelar clases.
 */
const { Op } = require('sequelize');
const QRCode = require('qrcode');
const { GymSocio, GymReserva, GymClase, GymActividad, GymProfesor, GymAsistencia, Complex } = require('../models');
const socios = require('../services/gym/sociosService');
const clases = require('../services/gym/clasesService');
const seg = require('../services/gym/seguimientoService');
const { h, auditar, httpError, todayAR, sumarDias } = require('../services/gym/comun');

/** Middleware: resuelve el socio por token (y que el módulo siga habilitado). */
async function socioPorToken(req, res, next) {
  try {
    const token = String(req.params.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ message: 'Link inválido.' });
    const s = await GymSocio.findOne({ where: { qr_token: token } });
    if (!s) return res.status(404).json({ message: 'Link inválido o vencido.' });
    const c = await Complex.findByPk(s.complex_id, { attributes: ['id', 'nombre', 'modulo_gym'] });
    if (!c?.modulo_gym) return res.status(403).json({ message: 'El gimnasio no tiene la app habilitada.' });
    req.socio = s; req.complejo = c;
    next();
  } catch (err) { next(err); }
}

const resumen = h(async (req, res) => {
  const s = req.socio;
  const f = await socios.ficha(s.complex_id, s.id);
  const ev = await socios.evaluarAcceso(s.complex_id, s);
  res.json({
    complejo: { id: req.complejo.id, nombre: req.complejo.nombre },
    socio: { nombre: s.nombre, apellido: s.apellido, dni: s.dni, codigo: s.codigo, estado: s.estado, foto_url: s.foto_url },
    habilitado: ev.permitido, motivos: ev.motivos,
    vigente: f.vigente, cuenta: f.cuenta, apto_vigente: f.apto_vigente, apto: f.aptos[0] || null,
    membresias: f.membresias, pagos: f.pagos.filter(p => !p.anulado),
    qr: await QRCode.toDataURL(`GYM:${s.qr_token}`, { margin: 1, width: 320 }),
  });
});

const reservas = h(async (req, res) => {
  res.json(await GymReserva.findAll({
    where: { socio_id: req.socio.id, estado: { [Op.ne]: 'cancelada' } },
    include: [{ model: GymClase, as: 'clase', where: { fecha: { [Op.gte]: sumarDias(todayAR(), -30) } }, include: [{ model: GymActividad, as: 'actividad', attributes: ['nombre', 'color'] }, { model: GymProfesor, as: 'profesor', attributes: ['nombre', 'apellido'] }] }],
    order: [[{ model: GymClase, as: 'clase' }, 'fecha', 'DESC'], [{ model: GymClase, as: 'clase' }, 'hora_inicio', 'DESC']],
  }));
});

/** Disponibilidad: clases de los próximos 14 días con cupos y la reserva propia. */
const disponibilidad = h(async (req, res) => {
  const desde = todayAR();
  const lista = await clases.listar(req.socio.complex_id, { desde, hasta: sumarDias(desde, 14), estado: 'disponible,completa' });
  const mias = await GymReserva.findAll({ where: { socio_id: req.socio.id, clase_id: lista.map(c => c.id) }, attributes: ['id', 'clase_id', 'estado'], raw: true });
  const porClase = Object.fromEntries(mias.map(r => [r.clase_id, r]));
  res.json(lista.map(c => ({ ...c, libres: Math.max(c.cupo - c.reservadas, 0), mi_reserva: porClase[c.id] || null })));
});

const reservar = h(async (req, res) => {
  const r = await clases.reservar(req.socio.complex_id, Number(req.params.claseId), req.socio.id, { origen: 'socio', validarPlan: true });
  await auditar(req, 'crear', 'reserva', r.reserva.id, { origen: 'socio', clase_id: Number(req.params.claseId), espera: r.en_espera }, { complexId: req.socio.complex_id });
  res.status(201).json(r);
});

const cancelar = h(async (req, res) => {
  const r = await clases.cancelarReserva(req.socio.complex_id, Number(req.params.reservaId), { socioId: req.socio.id });
  await auditar(req, 'cancelar', 'reserva', Number(req.params.reservaId), { origen: 'socio' }, { complexId: req.socio.complex_id });
  res.json(r);
});

const rutinas = h(async (req, res) => {
  const lista = await seg.listarRutinas(req.socio.complex_id, { socio_id: req.socio.id });
  const activas = lista.filter(r => r.activa);
  res.json(await Promise.all(activas.map(r => seg.detalleRutina(req.socio.complex_id, r.id))));
});

const comentarRutina = h(async (req, res) => {
  const r = await seg.detalleRutina(req.socio.complex_id, Number(req.params.rutinaId));
  if (r.socio_id !== req.socio.id) throw httpError(404, 'Rutina no encontrada.');
  res.status(201).json(await seg.comentar(req.socio.complex_id, r.id, req.body?.texto, `${req.socio.nombre} ${req.socio.apellido} (socio)`));
});

const evaluaciones = h(async (req, res) => res.json(await seg.evaluaciones(req.socio.complex_id, req.socio.id)));

const asistencia = h(async (req, res) => {
  res.json(await GymAsistencia.findAll({
    where: { socio_id: req.socio.id, fecha: { [Op.gte]: sumarDias(todayAR(), -90) } },
    include: [{ model: GymActividad, as: 'actividad', attributes: ['nombre'] }], order: [['fecha', 'DESC'], ['hora', 'DESC']], limit: 200,
  }));
});

module.exports = { socioPorToken, resumen, reservas, disponibilidad, reservar, cancelar, rutinas, comentarRutina, evaluaciones, asistencia };
