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
};
