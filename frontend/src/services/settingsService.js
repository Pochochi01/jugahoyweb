import api from './api';

export const settingsService = {
  get:          (complexId)             => api.get(`/settings/${complexId}`),
  update:       (complexId, data)       => api.put(`/settings/${complexId}`, data),
  getFields:    (complexId)             => api.get(`/settings/${complexId}/fields`),
  createField:  (complexId, data)       => api.post(`/settings/${complexId}/fields`, data),
  updateField:  (complexId, id, data)   => api.put(`/settings/${complexId}/fields/${id}`, data),
  toggleField:  (complexId, id)         => api.patch(`/settings/${complexId}/fields/${id}/toggle`),
  deleteField:  (complexId, id)         => api.delete(`/settings/${complexId}/fields/${id}`),

  // ── Integraciones por club (multi-tenant) ──
  // getIntegrations devuelve los tokens ENMASCARADOS (nunca completos).
  getIntegrations:    (complexId)       => api.get(`/settings/${complexId}/integrations`),
  updateIntegrations: (complexId, data) => api.put(`/settings/${complexId}/integrations`, data),
  renewMetaToken:     (complexId)       => api.post(`/settings/${complexId}/integrations/renew-meta`),

  // ── Plantillas de Meta (ventana de 24 h) — solo general_admin ──
  getWaTemplates:     (complexId)       => api.get(`/settings/${complexId}/wa-templates`),
  updateWaTemplates:  (complexId, templates) => api.put(`/settings/${complexId}/wa-templates`, { templates }),
};
