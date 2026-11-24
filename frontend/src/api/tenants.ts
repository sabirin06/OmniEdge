import api from './client';
import type { Tenant, PaginatedResponse } from '../types';

export interface TenantPayload {
  name: string;
  slug: string;
  is_active: boolean;
}

export const tenantsApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Tenant>>('/tenants/', { params }),
  get:    (id: number) => api.get<Tenant>(`/tenants/${id}/`),
  create: (data: TenantPayload) => api.post<Tenant>('/tenants/', data),
  update: (id: number, data: Partial<TenantPayload>) => api.patch<Tenant>(`/tenants/${id}/`, data),
  setStatus: (id: number, action: "suspend" | "activate") => api.post<Tenant>(`/tenants/${id}/${action}/`),
  delete: (id: number) => api.delete(`/tenants/${id}/`),
};
