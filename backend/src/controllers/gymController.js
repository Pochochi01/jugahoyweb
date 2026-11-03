'use strict';
/**
 * controllers/gymController.js — Panel del módulo Gym (/api/gym/:complexId/...).
 * Controladores finos: validan/derivan a services/gym/* y auditan cada escritura.
 */
const { Op } = require('sequelize');
const { Complex, Collaborator, User, GymAuditoria, GymRol } = require('../models');
const socios = require('../services/gym/sociosService');
const cobranzas = require('../services/gym/cobranzasService');
const clases = require('../services/gym/clasesService');
const seg = require('../services/gym/seguimientoService');
const cat = require('../services/gym/catalogosService');
const rep = require('../services/gym/reportesService');
const perm = require('../services/gym/permisosGym');
const { h, auditar, campos, httpError } = require('../services/gym/comun');

const cid = (req) => Number(req.params.complexId);
const uid = (req) => req.user?.id ?? null;
const pid = (req, k = 'id') => Number(req.params[k]);

/** Genera list/create/update/delete auditados para un catálogo de crudDe. */
function crud(entidad, servicio) {
  return {
    listar: h(async (req, res) => res.json(await servicio.listar(cid(req), req.query)), `gym:${entidad}`),
    crear: h(async (req, res) => {
      const fila = await servicio.crear(cid(req), req.body);
      await auditar(req, 'crear', entidad, fila.id, req.body);
      res.status(201).json(fila);
    }, `gym:${entidad}`),
    actualizar: h(async (req, res) => {
      const fila = await servicio.actualizar(cid(req), pid(req), req.body);
      await auditar(req, 'editar', entidad, pid(req), req.body);
      res.json(fila);
    }, `gym:${entidad}`),
    eliminar: h(async (req, res) => {
      const r = await servicio.eliminar(cid(req), pid(req));
      await auditar(req, r?.desactivado ? 'desactivar' : 'eliminar', entidad, pid(req));
      res.json(r || { eliminado: true });
    }, `gym:${entidad}`),
  };
}

// ── Contexto / configuración / roles ──
const contexto = h(async (req, res) => {
  const permisos = await perm.permisosDe(req);
  const [cfg, sucursales] = await Promise.all([socios.config(cid(req)), cat.sucursales.listar(cid(req))]);
  res.json({ permisos, total: permisos === null, recursos: perm.RECURSOS, acciones: perm.ACCIONES, config: cfg, sucursales });
});
const guardarConfig = h(async (req, res) => {
  const d = campos(req.body, { dias_gracia: { tipo: 'int' }, exigir_apto_medico: { tipo: 'bool' }, recibo_prefijo: { max: 10 }, nutricion_habilitada: { tipo: 'bool' } }, { parcial: true });
  const cfg = await socios.config(cid(req));
  await cfg.update(d);
  await auditar(req, 'editar', 'configuracion', null, d);
  res.json(cfg);
});
const roles = h(async (req, res) => {
  const lista = await perm.rolesDe(cid(req));
  const cols = await Collaborator.findAll({ where: { complex_id: cid(req) }, include: [{ model: User, as: 'user', attributes: ['nombre', 'apellido', 'email'] }] });
  res.json({ roles: lista, recursos: perm.RECURSOS, acciones: perm.ACCIONES,
    colaboradores: cols.map(c => ({ id: c.id, nombre: `${c.user?.nombre || ''} ${c.user?.apellido || ''}`.trim(), email: c.user?.email, gym_rol: c.permisos?.gym_rol || null })) });
});
const guardarRol = h(async (req, res) => {
  const d = campos(req.body, { clave: { req: true, max: 30, label: 'Clave' }, nombre: { req: true, max: 60, label: 'Nombre' } });
  if (!/^[a-z0-9_]+$/.test(d.clave)) throw httpError(400, 'La clave solo admite minúsculas, números y guión bajo.');
  await perm.rolesDe(cid(req));
  const [rol] = await GymRol.findOrCreate({ where: { complex_id: cid(req), clave: d.clave }, defaults: { complex_id: cid(req), ...d, permisos: {} } });
  await rol.update({ nombre: d.nombre, permisos: perm.normalizar(req.body.permisos) });
  await auditar(req, 'editar', 'rol', rol.id, { clave: rol.clave, permisos: rol.permisos });
  res.json(rol);
});
/** Asigna (o quita) un rol de gym a un colaborador: collaborators.permisos.gym_rol. */
const asignarRol = h(async (req, res) => {
  const col = await Collaborator.findOne({ where: { id: pid(req, 'colaboradorId'), complex_id: cid(req) } });
  if (!col) throw httpError(404, 'Colaborador no encontrado.');
  const clave = req.body?.gym_rol || null;
  if (clave && !(await perm.rolesDe(cid(req))).some(r => r.clave === clave)) throw httpError(400, 'Rol inexistente.');
  await col.update({ permisos: { ...(col.permisos || {}), gym_rol: clave } });
  await auditar(req, 'editar', 'colaborador_rol', col.id, { gym_rol: clave });
  res.json({ id: col.id, gym_rol: clave });
});

// ── Socios ──
const listarSocios = h(async (req, res) => res.json(await socios.listar(cid(req), req.query)));
const fichaSocio = h(async (req, res) => res.json(await socios.ficha(cid(req), pid(req))));
const crearSocio = h(async (req, res) => {
  const s = await socios.crear(cid(req), req.body, uid(req));
  await auditar(req, 'crear', 'socio', s.id, { dni: s.dni });
  res.status(201).json(s);
});
const actualizarSocio = h(async (req, res) => {
  const s = await socios.actualizar(cid(req), pid(req), req.body, uid(req));
  await auditar(req, 'editar', 'socio', s.id, req.body);
  res.json(s);
});
const estadoSocio = h(async (req, res) => {
  const s = await socios.cambiarEstado(cid(req), pid(req), req.body || {}, uid(req));
  await auditar(req, 'estado', 'socio', s.id, req.body);
  res.json(s);
});
const qrSocio = h(async (req, res) => res.json(await socios.qr(cid(req), pid(req))));
const aptoSocio = h(async (req, res) => {
  const a = await socios.registrarApto(cid(req), pid(req), req.body, uid(req));
  await auditar(req, 'crear', 'apto_medico', a.id, { socio_id: pid(req) });
  res.status(201).json(a);
});

// ── Acceso ──
const acceso = h(async (req, res) => {
  const r = await socios.registrarAcceso(cid(req), req.body || {}, uid(req));
  await auditar(req, r.permitido ? 'acceso_permitido' : 'acceso_denegado', 'acceso', r.socio?.id || null, { metodo: req.body?.metodo, motivos: r.motivos });
  res.json(r);
});
const accesos = h(async (req, res) => res.json(await socios.listarAccesos(cid(req), req.query)));

// ── Cobranzas ──
const asignarPlan = h(async (req, res) => {
  const m = await cobranzas.asignarPlan(cid(req), pid(req), req.body, uid(req));
  await auditar(req, m.renovacion_de_id ? 'renovar' : 'crear', 'membresia', m.id, req.body);
  res.status(201).json(m);
});
const cancelarMembresia = h(async (req, res) => {
  const m = await cobranzas.cancelarMembresia(cid(req), pid(req), uid(req));
  await auditar(req, 'cancelar', 'membresia', m.id);
  res.json(m);
});
const pagar = h(async (req, res) => {
  const r = await cobranzas.registrarPago(cid(req), pid(req), req.body, uid(req));
  await auditar(req, 'cobrar', 'pago', r.pago.id, { socio_id: pid(req), monto: r.pago.monto, metodo: r.pago.metodo, recibo: r.pago.numero_recibo });
  res.status(201).json(r);
});
const anularPago = h(async (req, res) => {
  const p = await cobranzas.anularPago(cid(req), pid(req), req.body?.motivo, uid(req));
  await auditar(req, 'anular', 'pago', p.id, { motivo: req.body?.motivo, recibo: p.numero_recibo });
  res.json(p);
});
const pagos = h(async (req, res) => res.json(await cobranzas.listarPagos(cid(req), req.query)));
const recibo = h(async (req, res) => {
  const [p, complejo] = await Promise.all([cobranzas.recibo(cid(req), pid(req)), Complex.findByPk(cid(req), { attributes: ['nombre', 'direccion'] })]);
  res.json({ pago: p, complejo });
});
const morosos = h(async (req, res) => res.json(await cobranzas.morosos(cid(req))));
const alertas = h(async (req, res) => {
  const [cobro, equipos] = await Promise.all([cobranzas.alertas(cid(req)), cat.equipos.alertas(cid(req))]);
  res.json({ ...cobro, equipos });
});

// ── Clases y reservas ──
const listarClases = h(async (req, res) => res.json(await clases.listar(cid(req), req.query)));
const crearClase = h(async (req, res) => {
  const r = await clases.crear(cid(req), req.body);
  await auditar(req, 'crear', 'clase', r.creadas[0].id, { ...req.body, creadas: r.creadas.length });
  res.status(201).json(r);
});
const actualizarClase = h(async (req, res) => {
  const c = await clases.actualizar(cid(req), pid(req), req.body);
  await auditar(req, 'editar', 'clase', c.id, req.body);
  res.json(c);
});
const cancelarClase = h(async (req, res) => {
  const c = await clases.cancelar(cid(req), pid(req));
  await auditar(req, 'cancelar', 'clase', c.id);
  res.json(c);
});
const reservasClase = h(async (req, res) => res.json(await clases.reservasDeClase(cid(req), pid(req))));
const reservar = h(async (req, res) => {
  const r = await clases.reservar(cid(req), pid(req), Number(req.body?.socio_id), { origen: 'panel', validarPlan: req.body?.validar_plan === true });
  await auditar(req, 'crear', 'reserva', r.reserva.id, { clase_id: pid(req), socio_id: req.body?.socio_id, espera: r.en_espera });
  res.status(201).json(r);
});
const cancelarReserva = h(async (req, res) => {
  const r = await clases.cancelarReserva(cid(req), pid(req));
  await auditar(req, 'cancelar', 'reserva', pid(req), { promovido: r.promovido });
  res.json(r);
});
const asistenciaClase = h(async (req, res) => {
  const r = await clases.tomarAsistencia(cid(req), pid(req), req.body || {});
  await auditar(req, 'asistencia', 'clase', pid(req), req.body);
  res.json(r);
});
const asistencia = h(async (req, res) => res.json(await clases.asistencia(cid(req), req.query)));

// ── Profesores ──
const statsProfesores = h(async (req, res) => res.json(await cat.estadisticasProfesores(cid(req), req.query)));

// ── Rutinas / evaluaciones / nutrición ──
const autor = (req) => `${req.user?.nombre || ''} ${req.user?.apellido || ''}`.trim() || req.user?.email || 'Staff';
const listarRutinas = h(async (req, res) => res.json(await seg.listarRutinas(cid(req), req.query)));
const rutina = h(async (req, res) => res.json(await seg.detalleRutina(cid(req), pid(req), req.query.version)));
const crearRutina = h(async (req, res) => {
  const r = await seg.crearRutina(cid(req), req.body, uid(req));
  await auditar(req, 'crear', 'rutina', r.id, { socio_id: r.socio_id, nombre: r.nombre });
  res.status(201).json(r);
});
const versionRutina = h(async (req, res) => {
  const r = await seg.nuevaVersion(cid(req), pid(req), req.body, uid(req));
  await auditar(req, 'editar', 'rutina', r.id, { version: r.version_actual });
  res.json(r);
});
const asignarPlantilla = h(async (req, res) => {
  const r = await seg.asignarPlantilla(cid(req), pid(req), Number(req.body?.socio_id), uid(req));
  await auditar(req, 'crear', 'rutina', r.id, { plantilla: pid(req), socio_id: req.body?.socio_id });
  res.status(201).json(r);
});
const comentarRutina = h(async (req, res) => res.status(201).json(await seg.comentar(cid(req), pid(req), req.body?.texto, autor(req))));
const eliminarRutina = h(async (req, res) => { await seg.eliminarRutina(cid(req), pid(req)); await auditar(req, 'eliminar', 'rutina', pid(req)); res.json({ eliminado: true }); });
const evaluaciones = h(async (req, res) => res.json(await seg.evaluaciones(cid(req), pid(req))));
const crearEvaluacion = h(async (req, res) => {
  const e = await seg.crearEvaluacion(cid(req), pid(req), req.body, uid(req));
  await auditar(req, 'crear', 'evaluacion', e.id, { socio_id: pid(req) });
  res.status(201).json(e);
});
const actualizarEvaluacion = h(async (req, res) => { const e = await seg.actualizarEvaluacion(cid(req), pid(req), req.body); await auditar(req, 'editar', 'evaluacion', e.id); res.json(e); });
const eliminarEvaluacion = h(async (req, res) => { await seg.eliminarEvaluacion(cid(req), pid(req)); await auditar(req, 'eliminar', 'evaluacion', pid(req)); res.json({ eliminado: true }); });
const nutricion = h(async (req, res) => res.json(await seg.planesNutricion(cid(req), pid(req))));
const crearNutricion = h(async (req, res) => {
  const p = await seg.crearPlanNutricion(cid(req), pid(req), req.body);
  await auditar(req, 'crear', 'nutricion', p.id, { socio_id: pid(req) });
  res.status(201).json(p);
});
const seguimientoNutricion = h(async (req, res) => res.status(201).json(await seg.agregarSeguimiento(cid(req), pid(req), req.body)));

// ── Equipos ──
const eventosEquipo = h(async (req, res) => res.json(await cat.equipos.eventos(cid(req), pid(req))));
const eventoEquipo = h(async (req, res) => {
  const ev = await cat.equipos.registrarEvento(cid(req), pid(req), req.body);
  await auditar(req, 'crear', 'equipo_evento', ev.id, { equipo_id: pid(req), tipo: ev.tipo });
  res.status(201).json(ev);
});

// ── Dashboard / reportes / auditoría ──
const dashboard = h(async (req, res) => res.json(await rep.dashboard(cid(req), req.query)));
const reporte = h(async (req, res) => {
  const tipo = req.params.tipo;
  const r = await rep.reporte(cid(req), tipo, req.query);
  const formato = req.query.formato || 'json';
  if (formato !== 'json') await auditar(req, 'exportar', 'reporte', null, { tipo, formato, desde: r.desde, hasta: r.hasta });
  if (formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gym-${tipo}-${r.desde}_${r.hasta}.csv"`);
    return res.send(rep.aCsv(tipo, r));
  }
  if (formato === 'html') {
    const c = await Complex.findByPk(cid(req), { attributes: ['nombre'] });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(rep.aHtml(tipo, r, c?.nombre || ''));
  }
  res.json(r);
});
const auditoria = h(async (req, res) => {
  const where = { complex_id: cid(req) };
  if (req.query.entidad) where.entidad = req.query.entidad;
  if (req.query.usuario_id) where.usuario_id = Number(req.query.usuario_id);
  if (req.query.desde || req.query.hasta) where.created_at = { [Op.between]: [`${req.query.desde || '2000-01-01'} 00:00:00`, `${req.query.hasta || '2999-12-31'} 23:59:59`] };
  res.json(await GymAuditoria.findAll({ where, order: [['id', 'DESC']], limit: Math.min(Number(req.query.limite) || 200, 1000) }));
});

module.exports = {
  crud, contexto, guardarConfig, roles, guardarRol, asignarRol,
  listarSocios, fichaSocio, crearSocio, actualizarSocio, estadoSocio, qrSocio, aptoSocio, acceso, accesos,
  asignarPlan, cancelarMembresia, pagar, anularPago, pagos, recibo, morosos, alertas,
  listarClases, crearClase, actualizarClase, cancelarClase, reservasClase, reservar, cancelarReserva, asistenciaClase, asistencia,
  statsProfesores, listarRutinas, rutina, crearRutina, versionRutina, asignarPlantilla, comentarRutina, eliminarRutina,
  evaluaciones, crearEvaluacion, actualizarEvaluacion, eliminarEvaluacion, nutricion, crearNutricion, seguimientoNutricion,
  eventosEquipo, eventoEquipo, dashboard, reporte, auditoria,
};
