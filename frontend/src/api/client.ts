import axios from 'axios';
import { currentSupportWorkspace } from './supportWorkspace';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach CSRF token from cookie
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase() ?? '';
  const workspace = currentSupportWorkspace();
  if (workspace && config.url !== '/platform/support/') {
    if (method !== 'get' && method !== 'head') throw new Error('Support workspaces are read-only.');
    config.headers.set('X-OmniEdge-Support', String(workspace.id));
  }
  if (['post', 'put', 'patch', 'delete'].includes(method) && !config.headers.has('X-CSRFToken')) {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
    if (cookie) {
      config.headers.set('X-CSRFToken', cookie.trim().slice('csrftoken='.length));
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
