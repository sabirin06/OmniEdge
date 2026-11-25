import api from './client';
import type { Report, AuditLog, PaginatedResponse } from '../types';

export interface ReportPayload {
  title: string;
  period_start: string;
  period_end: string;
}

export const reportsApi = {
  list:     (params?: Record<string, unknown>) => api.get<PaginatedResponse<Report>>('/reports/', { params }),
  get:      (id: number) => api.get<Report>(`/reports/${id}/`),
  generate: (data: ReportPayload) => api.post<Report>('/reports/', data),
  delete:   (id: number) => api.delete(`/reports/${id}/`),
};

export const auditApi = {
  list: (params?: Record<string, unknown>) => api.get<PaginatedResponse<AuditLog>>('/audit-logs/', { params }),
};
