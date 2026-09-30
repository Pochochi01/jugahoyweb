import api from './api';

export const cantinaService = {
  // Productos
  listProductos:  (cid, params) => api.get(`/cantina/${cid}/productos`, { params }),
  createProducto: (cid, data)   => api.post(`/cantina/${cid}/productos`, data),
  updateProducto: (cid, id, d)  => api.put(`/cantina/${cid}/productos/${id}`, d),
  deleteProducto: (cid, id)     => api.delete(`/cantina/${cid}/productos/${id}`),

  // Stock
  crearMovimiento: (cid, data)  => api.post(`/cantina/${cid}/movimientos`, data),
  listMovimientos: (cid, params) => api.get(`/cantina/${cid}/movimientos`, { params }),
  alertas:        (cid)         => api.get(`/cantina/${cid}/alertas`),

  // Ventas
  crearVenta:     (cid, data)   => api.post(`/cantina/${cid}/ventas`, data),
  listVentas:     (cid, params) => api.get(`/cantina/${cid}/ventas`, { params }),
  getVenta:       (cid, id)     => api.get(`/cantina/${cid}/ventas/${id}`),
  devolverVenta:  (cid, id)     => api.post(`/cantina/${cid}/ventas/${id}/devolucion`),

  // Reportes / caja / dashboard
  reporteVentas:    (cid, params) => api.get(`/cantina/${cid}/reportes/ventas`, { params }),
  reporteProductos: (cid, params) => api.get(`/cantina/${cid}/reportes/productos`, { params }),
  caja:             (cid, params) => api.get(`/cantina/${cid}/caja`, { params }),
  dashboard:        (cid)         => api.get(`/cantina/${cid}/dashboard`),

  // Proveedores / clientes
  listProveedores:  (cid, params) => api.get(`/cantina/${cid}/proveedores`, { params }),
  createProveedor:  (cid, d)      => api.post(`/cantina/${cid}/proveedores`, d),
  updateProveedor:  (cid, id, d)  => api.put(`/cantina/${cid}/proveedores/${id}`, d),
  deleteProveedor:  (cid, id)     => api.delete(`/cantina/${cid}/proveedores/${id}`),
  // Catálogo de precios por proveedor (producto ↔ proveedor)
  catalogoProveedor:    (cid, provId)         => api.get(`/cantina/${cid}/proveedores/${provId}/productos`),
  guardarPrecio:        (cid, provId, prodId, d) => api.put(`/cantina/${cid}/proveedores/${provId}/productos/${prodId}`, d),
  quitarDelCatalogo:    (cid, provId, prodId) => api.delete(`/cantina/${cid}/proveedores/${provId}/productos/${prodId}`),
  proveedoresDeProducto:(cid, prodId)         => api.get(`/cantina/${cid}/productos/${prodId}/proveedores`),
  validarPrecios:       (cid, d)              => api.post(`/cantina/${cid}/pedidos-proveedor/validar-precios`, d),

  listClientes:     (cid, params) => api.get(`/cantina/${cid}/clientes`, { params }),
  createCliente:    (cid, d)      => api.post(`/cantina/${cid}/clientes`, d),
  updateCliente:    (cid, id, d)  => api.put(`/cantina/${cid}/clientes/${id}`, d),
  deleteCliente:    (cid, id)     => api.delete(`/cantina/${cid}/clientes/${id}`),

  // Pedidos: tipo = 'proveedor' (compras) | 'cliente' (ventas)
  listPedidos:      (cid, tipo, params) => api.get(`/cantina/${cid}/pedidos-${tipo}`, { params }),
  createPedido:     (cid, tipo, d)      => api.post(`/cantina/${cid}/pedidos-${tipo}`, d),
  updatePedido:     (cid, tipo, id, d)  => api.put(`/cantina/${cid}/pedidos-${tipo}/${id}`, d),
  cancelarPedido:   (cid, tipo, id)     => api.post(`/cantina/${cid}/pedidos-${tipo}/${id}/cancelar`),
  confirmarPedido:  (cid, id, items)    => api.post(`/cantina/${cid}/pedidos-proveedor/${id}/confirmar`, { items }),
  entregarPedido:   (cid, id)           => api.post(`/cantina/${cid}/pedidos-cliente/${id}/entregar`),
};
