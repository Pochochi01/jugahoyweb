const router = require('express').Router();
const ctrl = require('../controllers/cantinaController');
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

module.exports = router;
