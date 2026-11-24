import api from './client';
import type { AuthUser } from '../types';

export interface LoginPayload { email: string; password: string; }
export interface LoginResponse { user: AuthUser; token?: string; }

export const authApi = {
  getCsrf: () => api.get('/auth/csrf/'),
  login:   (data: LoginPayload) => api.post<LoginResponse>('/auth/login/', data),
  logout:  () => api.post('/auth/logout/'),
  me:      () => api.get<AuthUser>('/auth/me/'),
};
