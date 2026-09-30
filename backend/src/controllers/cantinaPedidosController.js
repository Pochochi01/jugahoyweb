'use strict';
/**
 * controllers/cantinaPedidosController.js — Cantina: proveedores, clientes y pedidos
 *
 * Compras (pedido a proveedor)
 *   pendiente ──confirmar(ítems tildados)──► confirmado_parcial ──confirmar(resto)──► confirmado_total
 *       └──cancelar──► cancelado
 *   Cada ítem tildado pasa a 'recibido' y SUMA stock (motivo 'compra'); los no
 *   tildados quedan 'pendiente' (= no recibidos) y pueden confirmarse más adelante.
 *
 * Ventas por pedido (cliente)
 *   pendiente ──entregar──► entregado (RESTA stock de todos los ítems, motivo 'venta')
 *       └──cancelar──► cancelado
 *
 * Todo cambio de stock pasa por cantinaStockService.aplicarMovimiento (auditado,
 * con el pedido de origen). Los productos se bloquean FOR UPDATE: dos entregas
 * simultáneas no pueden vender el mismo stock.
 *
 * El envío por WhatsApp lo hace el usuario desde su teléfono (wa.me + portapapeles):
 * el backend no envía mensajes.
 */
const { Op } = require('sequelize');
const {
  sequelize, CantinaProducto, CantinaProveedor, CantinaCliente,
  CantinaPedidoProveedor, CantinaPedidoCliente, CantinaItemPedido,
} = require('../models');
const { aplicarMovimiento, num } = require('../services/cantinaStockService');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const send = (res, err) => res.status(err.status || 500).json({ message: err.message });
const cid = (req) => Number(req.params.complexId);
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const likeAny = (q, campos) => ({ [Op.or]: campos.map(c => ({ [c]: { [Op.like]: `%${q}%` } })) });

// ── Validación de contactos ───────────────────────────────────
function datosContacto(body, { conDni = false } = {}) {
  const d = {};
  if (body.nombre !== undefined) {
    d.nombre = String(body.nombre || '').trim();
    if (d.nombre.length < 2) throw httpError(400, 'Nombre requerido.');
  }
  if (body.whatsapp !== undefined) {
    d.whatsapp = String(body.whatsapp || '').replace(/\D/g, '') || null;
    // wa.me necesita el número internacional completo (ej. 5493811234567)
    if (d.whatsapp && !/^\d{10,15}$/.test(d.whatsapp)) throw httpError(400, 'WhatsApp inválido: usá el número con código de país (ej. 5493811234567).');
  }
  if (body.email !== undefined) {
    d.email = String(body.email || '').trim() || null;
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) throw httpError(400, 'Email inválido.');
  }
  if (body.estado !== undefined) {
    if (!['activo', 'inactivo'].includes(body.estado)) throw httpError(400, 'Estado inválido.');
    d.estado = body.estado;
  }
  if (!conDni && body.contacto !== undefined) d.contacto = String(body.contacto || '').trim() || null;
  if (conDni && body.dni !== undefined) {
    d.dni = String(body.dni || '').replace(/\D/g, '') || null;
    if (d.dni && !/^\d{7,9}$/.test(d.dni)) throw httpError(400, 'DNI inválido.');
  }
  return d;
}

// ══════════════════════════════════════════════════════════════
//  PROVEEDORES
// ══════════════════════════════════════════════════════════════
async function listProveedores(req, res) {
  try {
    const where = { complex_id: cid(req) };
    if (req.query.estado) where.estado = req.query.estado;
    const q = String(req.query.q || '').trim();
    if (q) Object.assign(where, likeAny(q, ['nombre', 'contacto', 'whatsapp']));
    res.json(await CantinaProveedor.findAll({ where, order: [['nombre', 'ASC']] }));
  } catch (err) { send(res, err); }
}

async function createProveedor(req, res) {
  try {
    const d = datosContacto({ nombre: '', ...req.body });
    res.status(201).json(await CantinaProveedor.create({ ...d, complex_id: cid(req) }));
  } catch (err) { send(res, err); }
}

async function updateProveedor(req, res) {
  try {
    const p = await CantinaProveedor.findOne({ where: { id: req.params.id, complex_id: cid(req) } });
    if (!p) throw httpError(404, 'Proveedor no encontrado');
    await p.update(datosContacto(req.body));
    res.json(p);
  } catch (err) { send(res, err); }
}

/** Con pedidos → se desactiva (se conserva el historial); sin pedidos → se elimina. */
async function deleteProveedor(req, res) {
  try {
    const p = await CantinaProveedor.findOne({ where: { id: req.params.id, complex_id: cid(req) } });
    if (!p) throw httpError(404, 'Proveedor no encontrado');
    if (await CantinaPedidoProveedor.count({ where: { proveedor_id: p.id } })) {
      await p.update({ estado: 'inactivo' });
      return res.json({ ok: true, desactivado: true, message: 'Tiene pedidos: se desactivó en lugar de eliminarse.' });
    }
    await p.destroy();
    res.json({ ok: true });
  } catch (err) { send(res, err); }
}

// ══════════════════════════════════════════════════════════════
//  CLIENTES
// ══════════════════════════════════════════════════════════════
/** GET ?q= → busca por nombre, DNI o WhatsApp (mismo criterio que el resto del sistema). */
async function listClientes(req, res) {
  try {
    const where = { complex_id: cid(req) };
    if (req.query.estado) where.estado = req.query.estado;
    const q = String(req.query.q || '').trim();
    if (q) {
      const digitos = q.replace(/\D/g, '');
      where[Op.or] = [
        { nombre: { [Op.like]: `%${q}%` } },
        ...(digitos ? [{ dni: { [Op.like]: `%${digitos}%` } }, { whatsapp: { [Op.like]: `%${digitos}%` } }] : []),
      ];
    }
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    res.json(await CantinaCliente.findAll({ where, order: [['nombre', 'ASC']], limit }));
  } catch (err) { send(res, err); }
}

async function createCliente(req, res) {
  try {
    const d = datosContacto({ nombre: '', ...req.body }, { conDni: true });
    res.status(201).json(await CantinaCliente.create({ ...d, complex_id: cid(req) }));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ya existe un cliente con ese DNI.' });
    send(res, err);
  }
}

async function updateCliente(req, res) {
  try {
    const c = await CantinaCliente.findOne({ where: { id: req.params.id, complex_id: cid(req) } });
    if (!c) throw httpError(404, 'Cliente no encontrado');
    await c.update(datosContacto(req.body, { conDni: true }));
    res.json(c);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Ya existe un cliente con ese DNI.' });
    send(res, err);
  }
}

async function deleteCliente(req, res) {
  try {
    const c = await CantinaCliente.findOne({ where: { id: req.params.id, complex_id: cid(req) } });
    if (!c) throw httpError(404, 'Cliente no encontrado');
    if (await CantinaPedidoCliente.count({ where: { cliente_id: c.id } })) {
      await c.update({ estado: 'inactivo' });
      return res.json({ ok: true, desactivado: true, message: 'Tiene pedidos: se desactivó en lugar de eliminarse.' });
    }
    await c.destroy();
    res.json({ ok: true });
  } catch (err) { send(res, err); }
}

// ══════════════════════════════════════════════════════════════
//  PEDIDOS — helpers comunes
// ══════════════════════════════════════════════════════════════
const TIPOS = {
  proveedor: { Pedido: CantinaPedidoProveedor, Contacto: CantinaProveedor, fk: 'proveedor_id', itemFk: 'pedido_proveedor_id', as: 'proveedor', precio: 'precio_costo' },
  cliente:   { Pedido: CantinaPedidoCliente,   Contacto: CantinaCliente,   fk: 'cliente_id',   itemFk: 'pedido_cliente_id',   as: 'cliente',   precio: 'precio_venta' },
};

const includePedido = (tipo) => [
  { model: TIPOS[tipo].Contacto, as: TIPOS[tipo].as },
  { model: CantinaItemPedido, as: 'items', include: [{ model: CantinaProducto, as: 'producto', attributes: ['id', 'nombre', 'unidad_medida', 'stock'] }] },
];

/** Pedido serializado con total calculado. */
function serial(p, tipo) {
  const j = p.toJSON();
  j.tipo = tipo;
  j.items = (j.items || []).sort((a, b) => a.id - b.id);
  j.total = j.items.reduce((acc, i) => acc + num(i.cantidad) * num(i.precio_unitario), 0);
  return j;
}

async function cargarPedido(tipo, req, transaction) {
  const p = await TIPOS[tipo].Pedido.findOne({
    where: { id: req.params.id, complex_id: cid(req) },
    include: includePedido(tipo),
    transaction,
  });
  if (!p) throw httpError(404, 'Pedido no encontrado');
  return p;
}

/**
 * Normaliza los ítems: productos del complejo, cantidades > 0, sin repetidos
 * (se suman). El precio queda "congelado" al generar el pedido (costo o venta).
 */
async function validarItems(tipo, complexId, items) {
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'Agregá al menos un producto.');
  const porProducto = new Map();
  for (const it of items) {
    const id = Number(it.producto_id);
    const cant = num(it.cantidad);
    if (!id || !(cant > 0)) throw httpError(400, 'Cada ítem necesita producto y cantidad mayor a 0.');
    const prev = porProducto.get(id) || { cantidad: 0, precio: it.precio_unitario };
    porProducto.set(id, { cantidad: prev.cantidad + cant, precio: it.precio_unitario ?? prev.precio });
  }
  const productos = await CantinaProducto.findAll({ where: { id: [...porProducto.keys()], complex_id: complexId } });
  if (productos.length !== porProducto.size) throw httpError(400, 'Algún producto no existe en este complejo.');
  return productos.map(p => {
    const { cantidad, precio } = porProducto.get(p.id);
    const unit = precio != null && precio !== '' ? num(precio) : num(p[TIPOS[tipo].precio]);
    if (unit < 0) throw httpError(400, 'Precio inválido.');
    return { producto_id: p.id, cantidad, precio_unitario: unit };
  });
}

// ── CRUD genérico de pedidos (proveedor / cliente) ────────────
const listPedidos = (tipo) => async (req, res) => {
  try {
    const { Pedido, Contacto, fk, as } = TIPOS[tipo];
    const where = { complex_id: cid(req) };
    if (req.query.estado) where.estado = req.query.estado;
    if (req.query[fk]) where[fk] = Number(req.query[fk]);
    if (req.query.desde) where.fecha = { ...(where.fecha || {}), [Op.gte]: req.query.desde };
    if (req.query.hasta) where.fecha = { ...(where.fecha || {}), [Op.lte]: req.query.hasta };
    const q = String(req.query.q || '').trim();
    const incl = includePedido(tipo);
    if (q) {
      if (/^\d+$/.test(q)) {
        // Números → n° de pedido, DNI (clientes) o WhatsApp del contacto
        where[Op.or] = [
          { id: Number(q) },
          { [`$${as}.whatsapp$`]: { [Op.like]: `%${q}%` } },
          ...(tipo === 'cliente' ? [{ [`$${as}.dni$`]: { [Op.like]: `%${q}%` } }] : []),
        ];
      } else {
        // Texto → nombre (y persona de contacto, en proveedores)
        incl[0] = { model: Contacto, as, required: true, where: likeAny(q, tipo === 'cliente' ? ['nombre'] : ['nombre', 'contacto']) };
      }
    }
    // subQuery:false → el WHERE sobre $contacto.campo$ convive con el include de ítems
    // (con limit + hasMany, Sequelize arma una subconsulta donde el contacto no existe).
    // Sin limit SQL, para no cortar filas de ítems: se acota en memoria.
    const rows = (await Pedido.findAll({ where, include: incl, order: [['fecha', 'DESC'], ['id', 'DESC']], subQuery: false })).slice(0, 200);
    res.json(rows.map(p => serial(p, tipo)));
  } catch (err) { send(res, err); }
};

const getPedido = (tipo) => async (req, res) => {
  try { res.json(serial(await cargarPedido(tipo, req), tipo)); } catch (err) { send(res, err); }
};

/** POST { proveedor_id | cliente_id, fecha?, notas?, items: [{ producto_id, cantidad, precio_unitario? }] } */
const createPedido = (tipo) => async (req, res) => {
  try {
    const { Pedido, Contacto, fk, itemFk } = TIPOS[tipo];
    const complexId = cid(req);
    const contacto = await Contacto.findOne({ where: { id: req.body?.[fk], complex_id: complexId } });
    if (!contacto) throw httpError(400, `Elegí un ${tipo} válido.`);
    if (contacto.estado !== 'activo') throw httpError(409, `El ${tipo} está inactivo.`);
    const items = await validarItems(tipo, complexId, req.body.items);

    const id = await sequelize.transaction(async (t) => {
      const p = await Pedido.create({
        complex_id: complexId, [fk]: contacto.id, fecha: req.body.fecha || hoy(),
        notas: req.body.notas?.trim() || null, usuario_id: req.user?.id || null,
      }, { transaction: t });
      await CantinaItemPedido.bulkCreate(items.map(i => ({ ...i, [itemFk]: p.id })), { transaction: t });
      return p.id;
    });
    req.params.id = id;
    res.status(201).json(serial(await cargarPedido(tipo, req), tipo));
  } catch (err) { send(res, err); }
};

/** PUT: edita ítems / notas / fecha mientras está pendiente. */
const updatePedido = (tipo) => async (req, res) => {
  try {
    const { itemFk } = TIPOS[tipo];
    const p = await cargarPedido(tipo, req);
    if (p.estado !== 'pendiente') throw httpError(409, 'Solo se puede editar un pedido pendiente.');
    const items = req.body.items ? await validarItems(tipo, cid(req), req.body.items) : null;
    await sequelize.transaction(async (t) => {
      await p.update({
        ...(req.body.notas !== undefined ? { notas: req.body.notas?.trim() || null } : {}),
        ...(req.body.fecha ? { fecha: req.body.fecha } : {}),
      }, { transaction: t });
      if (items) {
        await CantinaItemPedido.destroy({ where: { [itemFk]: p.id }, transaction: t });
        await CantinaItemPedido.bulkCreate(items.map(i => ({ ...i, [itemFk]: p.id })), { transaction: t });
      }
    });
    res.json(serial(await cargarPedido(tipo, req), tipo));
  } catch (err) { send(res, err); }
};

const cancelarPedido = (tipo) => async (req, res) => {
  try {
    const p = await cargarPedido(tipo, req);
    // Una compra con mercadería ya recibida no se cancela: su stock ya entró
    if (p.estado !== 'pendiente') throw httpError(409, `No se puede cancelar un pedido ${p.estado.replace('_', ' ')}.`);
    await p.update({ estado: 'cancelado' });
    res.json(serial(await cargarPedido(tipo, req), tipo));
  } catch (err) { send(res, err); }
};

// ══════════════════════════════════════════════════════════════
//  CONFIRMACIÓN DE COMPRA (total o parcial) → SUMA stock
// ══════════════════════════════════════════════════════════════
/**
 * POST /pedidos-proveedor/:id/confirmar
 * body: { items: [{ item_id, cantidad_recibida? }] }  → los ítems TILDADOS
 * cantidad_recibida por defecto = cantidad pedida (puede llegar menos o más).
 */
async function confirmarPedidoProveedor(req, res) {
  try {
    const recibidos = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!recibidos.length) throw httpError(400, 'Tildá al menos un ítem recibido.');

    await sequelize.transaction(async (t) => {
      const p = await CantinaPedidoProveedor.findOne({
        where: { id: req.params.id, complex_id: cid(req) }, lock: t.LOCK.UPDATE, transaction: t,
      });
      if (!p) throw httpError(404, 'Pedido no encontrado');
      if (!['pendiente', 'confirmado_parcial'].includes(p.estado)) throw httpError(409, `El pedido está ${p.estado.replace('_', ' ')}.`);

      const items = await CantinaItemPedido.findAll({ where: { pedido_proveedor_id: p.id }, transaction: t });
      for (const r of recibidos) {
        const item = items.find(i => i.id === Number(r.item_id));
        if (!item) throw httpError(400, 'Hay un ítem que no pertenece al pedido.');
        if (item.estado !== 'pendiente') throw httpError(409, 'Un ítem ya estaba recibido.');
        const cant = r.cantidad_recibida != null && r.cantidad_recibida !== '' ? num(r.cantidad_recibida) : num(item.cantidad);
        if (!(cant > 0)) throw httpError(400, 'La cantidad recibida debe ser mayor a 0.');

        const producto = await CantinaProducto.findByPk(item.producto_id, { lock: t.LOCK.UPDATE, transaction: t });
        await aplicarMovimiento({
          producto, tipo: 'entrada', motivo: 'compra', cantidad: cant,
          usuario_id: req.user?.id, pedido_proveedor_id: p.id, notas: `Pedido a proveedor #${p.id}`,
        }, t);
        await item.update({ estado: 'recibido', cantidad_recibida: cant }, { transaction: t });
      }
      const quedan = items.filter(i => i.estado === 'pendiente').length;   // (item.update muta la instancia)
      await p.update({ estado: quedan ? 'confirmado_parcial' : 'confirmado_total', confirmado_at: new Date() }, { transaction: t });
    });
    res.json(serial(await cargarPedido('proveedor', req), 'proveedor'));
  } catch (err) { send(res, err); }
}

// ══════════════════════════════════════════════════════════════
//  ENTREGA DE PEDIDO DE CLIENTE → RESTA stock
// ══════════════════════════════════════════════════════════════
async function entregarPedidoCliente(req, res) {
  try {
    await sequelize.transaction(async (t) => {
      const p = await CantinaPedidoCliente.findOne({
        where: { id: req.params.id, complex_id: cid(req) }, lock: t.LOCK.UPDATE, transaction: t,
      });
      if (!p) throw httpError(404, 'Pedido no encontrado');
      if (p.estado !== 'pendiente') throw httpError(409, `El pedido está ${p.estado}.`);
      const items = await CantinaItemPedido.findAll({ where: { pedido_cliente_id: p.id }, transaction: t });

      // 1) Bloquear y verificar TODO el stock antes de tocar nada (todo o nada)
      const productos = new Map();
      for (const it of items) {
        const prod = await CantinaProducto.findByPk(it.producto_id, { lock: t.LOCK.UPDATE, transaction: t });
        productos.set(it.id, prod);
      }
      const faltantes = items.filter(it => num(it.cantidad) > num(productos.get(it.id).stock))
        .map(it => `${productos.get(it.id).nombre} (pedido ${num(it.cantidad)}, hay ${num(productos.get(it.id).stock)})`);
      if (faltantes.length) throw httpError(409, `Stock insuficiente: ${faltantes.join(', ')}.`);

      // 2) Descontar
      for (const it of items) {
        await aplicarMovimiento({
          producto: productos.get(it.id), tipo: 'salida', motivo: 'venta', cantidad: num(it.cantidad),
          usuario_id: req.user?.id, pedido_cliente_id: p.id, notas: `Pedido de cliente #${p.id}`,
        }, t);
        await it.update({ estado: 'entregado' }, { transaction: t });
      }
      await p.update({ estado: 'entregado', entregado_at: new Date() }, { transaction: t });
    });
    res.json(serial(await cargarPedido('cliente', req), 'cliente'));
  } catch (err) { send(res, err); }
}

module.exports = {
  listProveedores, createProveedor, updateProveedor, deleteProveedor,
  listClientes, createCliente, updateCliente, deleteCliente,
  listPedidosProveedor: listPedidos('proveedor'), getPedidoProveedor: getPedido('proveedor'),
  createPedidoProveedor: createPedido('proveedor'), updatePedidoProveedor: updatePedido('proveedor'),
  cancelarPedidoProveedor: cancelarPedido('proveedor'), confirmarPedidoProveedor,
  listPedidosCliente: listPedidos('cliente'), getPedidoCliente: getPedido('cliente'),
  createPedidoCliente: createPedido('cliente'), updatePedidoCliente: updatePedido('cliente'),
  cancelarPedidoCliente: cancelarPedido('cliente'), entregarPedidoCliente,
};
