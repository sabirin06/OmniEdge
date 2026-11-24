import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach CSRF token from cookie
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase() ?? '';
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
    if (cookie) {
      config.headers['X-CSRFToken'] = cookie.split('=')[1];
    }
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && err.config?.url !== '/auth/login/') {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
