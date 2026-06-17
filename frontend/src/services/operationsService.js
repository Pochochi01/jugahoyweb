import api from './api';

export const operationsService = {
  getByComplex: (complexId, params) => api.get(`/operations/${complexId}`, { params }),
};
