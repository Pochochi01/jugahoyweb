import api from './api';

/**
 * Favoritos del jugador (persistidos en la BD).
 * getAll → array de complejos favoritos (con canchas)
 */
export const favoritesService = {
  getAll: ()          => api.get('/public/favorites'),
  add:    (complexId) => api.post('/public/favorites', { complex_id: complexId }),
  remove: (complexId) => api.delete(`/public/favorites/${complexId}`),
};
