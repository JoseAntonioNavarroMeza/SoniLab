import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sonilab_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401 && !error.config.url.includes('/auth/login')) {
      console.warn('Sesión expirada o token inválido:', error.response.data);
      localStorage.removeItem('sonilab_token');
      localStorage.removeItem('sonilab_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;