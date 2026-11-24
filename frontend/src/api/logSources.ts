import api from './client';
import type { LogSource, PaginatedResponse } from '../types';

export interface LogSourcePayload {
  name: string;
  source_type: string;
  asset: number;
  enabled?: boolean;
}

export const logSourcesApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<LogSource>>('/log-sources/', { params }),
  get:    (id: number) => api.get<LogSource>(`/log-sources/${id}/`),
  create: (data: LogSourcePayload) => api.post<LogSource & { plain_secret_key: string }>('/log-sources/', data),
  update: (id: number, data: Partial<LogSourcePayload>) => api.patch<LogSource>(`/log-sources/${id}/`, data),
  delete: (id: number) => api.delete(`/log-sources/${id}/`),
  rotateKey: (id: number) => api.post<{ plain_secret_key: string }>(`/log-sources/${id}/rotate-key/`),
};
