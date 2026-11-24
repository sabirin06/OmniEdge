import api from './client';
import type { Report, AuditLog, PaginatedResponse } from '../types';

export interface ReportPayload {
  title: string;
  report_type: string;
  date_from: string;
  date_to: string;
  tenant: number;
}

export const reportsApi = {
  list:     (params?: Record<string, unknown>) => api.get<PaginatedResponse<Report>>('/reports/', { params }),
  get:      (id: number) => api.get<Report>(`/reports/${id}/`),
  generate: (data: ReportPayload) => api.post<Report>('/reports/', data),
  create:   (data: any) => api.post<Report>('/reports/', data),
  delete:   (id: number) => api.delete(`/reports/${id}/`),
};

export const auditApi = {
  list: (params?: Record<string, unknown>) => api.get<PaginatedResponse<AuditLog>>('/audit/', { params }),
};
