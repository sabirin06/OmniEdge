import api from './client';
import type { User, PaginatedResponse } from '../types';

export interface UserPayload {
  email: string;
  full_name: string;
  role?: string;
  managed_role?: number | null;
  tenant?: number | null;
  password?: string;
  is_active?: boolean;
}

export const usersApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<User>>('/users/', { params }),
  get:    (id: number) => api.get<User>(`/users/${id}/`),
  create: (data: UserPayload) => api.post<User>('/users/', data),
  update: (id: number, data: Partial<UserPayload>) => api.patch<User>(`/users/${id}/`, data),
  delete: (id: number) => api.delete(`/users/${id}/`),
};
