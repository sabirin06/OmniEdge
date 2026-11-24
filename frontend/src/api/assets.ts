import api from './client';
import type { Asset, PaginatedResponse } from '../types';

export interface AssetPayload {
  name: string;
  asset_type: string;
  ip_address: string;
  hostname: string;
  os: string;
  owner: string;
  criticality: string;
  tenant: number;
  is_active?: boolean;
}

export const assetsApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Asset>>('/assets/', { params }),
  get:    (id: number) => api.get<Asset>(`/assets/${id}/`),
  create: (data: AssetPayload) => api.post<Asset>('/assets/', data),
  update: (id: number, data: Partial<AssetPayload>) => api.patch<Asset>(`/assets/${id}/`, data),
  delete: (id: number) => api.delete(`/assets/${id}/`),
};
