import api from './api';
import axios from 'axios';

export const imagesService = {
  getAll: () => api.get('/images'),
  upload: (formData) => {
    const token = localStorage.getItem('token');
    return axios.post('/api/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
    }).then(r => r.data);
  },
  update: (id, data) => api.put(`/images/${id}`, data),
  remove: (id) => api.delete(`/images/${id}`),
};
