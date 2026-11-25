import api from './client';
import type { AuthUser } from '../types';

export type ProfileSettings = Pick<AuthUser, "full_name" | "theme" | "dashboard_refresh_seconds">;

export interface LoginPayload { email: string; password: string; }
export interface LoginResponse { user: AuthUser; token?: string; }

export const authApi = {
  getCsrf: () => api.get<{ csrfToken: string }>('/auth/csrf/'),
  login:   (data: LoginPayload, csrfToken: string) => api.post<LoginResponse>('/auth/login/', data, {
    headers: { 'X-CSRFToken': csrfToken },
  }),
  logout:  () => api.post('/auth/logout/'),
  me:      () => api.get<AuthUser>('/auth/me/'),
  updateProfile: (data: ProfileSettings) => api.patch<AuthUser>('/auth/me/', data),
};
