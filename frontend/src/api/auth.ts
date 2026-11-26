import api from './client';
import type { AuthUser } from '../types';

export type ProfileSettings = Pick<AuthUser, "full_name" | "theme" | "dashboard_refresh_seconds">;

export interface LoginPayload { email: string; password: string; otp?: string; }
export interface LoginResponse { user: AuthUser; token?: string; }

async function accountPost<T>(path: string, data: Record<string, string>) {
  const csrf = await authApi.getCsrf();
  return api.post<T>(path, data, { headers: { 'X-CSRFToken': csrf.data.csrfToken } });
}

export const authApi = {
  requestCode: (flow: 'password' | 'verify', email: string) =>
    accountPost<{ message: string }>(`/auth/${flow}/request/`, { email }),
  confirmCode: (flow: 'password' | 'verify', data: Record<string, string>) =>
    accountPost<{ message: string }>(`/auth/${flow}/confirm/`, data),
  security: () => api.get<{ mfa_enabled: boolean }>('/auth/security/'),
  updateSecurity: (data: { action: 'start' | 'enable' | 'disable'; password: string; code?: string }) =>
    api.post<{ setup_key?: string; mfa_enabled?: boolean; recovery_codes?: string[] }>('/auth/security/', data),
  revokeSessions: () => api.delete('/auth/security/'),
  getCsrf: () => api.get<{ csrfToken: string }>('/auth/csrf/'),
  login:   (data: LoginPayload, csrfToken: string) => api.post<LoginResponse>('/auth/login/', data, {
    headers: { 'X-CSRFToken': csrfToken },
  }),
  logout:  () => api.post('/auth/logout/'),
  me:      () => api.get<AuthUser>('/auth/me/'),
  updateProfile: (data: ProfileSettings) => api.patch<AuthUser>('/auth/me/', data),
};
