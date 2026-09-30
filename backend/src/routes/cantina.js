const router = require('express').Router();
const ctrl = require('../controllers/cantinaController');
const pedidos = require('../controllers/cantinaPedidosController');
const { authenticate } = require('../middlewares/auth');
const { requireComplexAccess, requirePermission, requireAnyPermission } = require('../middlewares/roles');

router.use(authenticate);

// Permisos del módulo Cantina:
//   - cantina_gestion → CRUD de productos y stock, reportes (encargado / admin)
//   - cantina_ventas  → registrar ventas (vendedor / encargado / admin)
const acceso    = requireComplexAccess;
const gestion   = requirePermission('cantina_gestion');
const ventas    = requirePermission('cantina_ventas');
const cualquier = requireAnyPermission('cantina_gestion', 'cantina_ventas');

// ── Productos ──
router.get   ('/:complexId/productos',      acceso, cualquier, ctrl.listProductos);
router.get   ('/:complexId/productos/:id',  acceso, cualquier, ctrl.getProducto);
router.post  ('/:complexId/productos',      acceso, gestion,   ctrl.createProducto);
router.put   ('/:complexId/productos/:id',  acceso, gestion,   ctrl.updateProducto);
router.delete('/:complexId/productos/:id',  acceso, gestion,   ctrl.deleteProducto);

// ── Stock ──
router.post('/:complexId/movimientos', acceso, gestion, ctrl.crearMovimiento);
router.get ('/:complexId/movimientos', acceso, gestion, ctrl.listMovimientos);
router.get ('/:complexId/alertas',     acceso, gestion, ctrl.getAlertas);

// ── Ventas ──
router.post('/:complexId/ventas',                 acceso, ventas,    ctrl.crearVenta);
router.get ('/:complexId/ventas',                 acceso, cualquier, ctrl.listVentas);
router.get ('/:complexId/ventas/:id',             acceso, cualquier, ctrl.getVenta);
router.post('/:complexId/ventas/:id/devolucion',  acceso, gestion,   ctrl.devolverVenta);

// ── Reportes / caja / dashboard ──
router.get('/:complexId/reportes/ventas',    acceso, gestion,   ctrl.reporteVentas);
router.get('/:complexId/reportes/productos', acceso, gestion,   ctrl.reporteProductos);
router.get('/:complexId/caja',               acceso, gestion,   ctrl.getResumenCaja);
router.get('/:complexId/dashboard',          acceso, cualquier, ctrl.getDashboard);

// ── Pedidos a proveedores (compras → suman stock): gestión ──
router.get   ('/:complexId/proveedores',      acceso, gestion, pedidos.listProveedores);
router.post  ('/:complexId/proveedores',      acceso, gestion, pedidos.createProveedor);
router.put   ('/:complexId/proveedores/:id',  acceso, gestion, pedidos.updateProveedor);
router.delete('/:complexId/proveedores/:id',  acceso, gestion, pedidos.deleteProveedor);

router.get ('/:complexId/pedidos-proveedor',               acceso, gestion, pedidos.listPedidosProveedor);
router.post('/:complexId/pedidos-proveedor',               acceso, gestion, pedidos.createPedidoProveedor);
router.get ('/:complexId/pedidos-proveedor/:id',           acceso, gestion, pedidos.getPedidoProveedor);
router.put ('/:complexId/pedidos-proveedor/:id',           acceso, gestion, pedidos.updatePedidoProveedor);
router.post('/:complexId/pedidos-proveedor/:id/confirmar', acceso, gestion, pedidos.confirmarPedidoProveedor);
router.post('/:complexId/pedidos-proveedor/:id/cancelar',  acceso, gestion, pedidos.cancelarPedidoProveedor);

// ── Pedidos de clientes (ventas → restan stock al entregar): gestión o ventas ──
router.get   ('/:complexId/clientes',      acceso, cualquier, pedidos.listClientes);
router.post  ('/:complexId/clientes',      acceso, cualquier, pedidos.createCliente);
router.put   ('/:complexId/clientes/:id',  acceso, cualquier, pedidos.updateCliente);
router.delete('/:complexId/clientes/:id',  acceso, gestion,   pedidos.deleteCliente);

router.get ('/:complexId/pedidos-cliente',              acceso, cualquier, pedidos.listPedidosCliente);
router.post('/:complexId/pedidos-cliente',              acceso, cualquier, pedidos.createPedidoCliente);
router.get ('/:complexId/pedidos-cliente/:id',          acceso, cualquier, pedidos.getPedidoCliente);
router.put ('/:complexId/pedidos-cliente/:id',          acceso, cualquier, pedidos.updatePedidoCliente);
router.post('/:complexId/pedidos-cliente/:id/entregar', acceso, cualquier, pedidos.entregarPedidoCliente);
router.post('/:complexId/pedidos-cliente/:id/cancelar', acceso, cualquier, pedidos.cancelarPedidoCliente);

module.exports = router;
