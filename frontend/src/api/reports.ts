import api from './client';
import type { Report, AuditLog, PaginatedResponse } from '../types';

export type ReportSeries = 'events' | 'alerts' | 'incidents';
export interface ReportFilters {
  period_start: string;
  period_end: string;
  report_type: 'overview' | ReportSeries;
  severity: string;
  status: string;
  tenant?: number;
}
export interface ReportAnalytics {
  tenant: { id: number; name: string };
  filters: ReportFilters;
  series: ReportSeries[];
  totals: Partial<Record<ReportSeries, number>>;
  daily: ({ date: string } & Partial<Record<ReportSeries, number>>)[];
  breakdown: { type: ReportSeries; dimension: 'severity' | 'status'; value: string; count: number }[];
}

export interface ReportRecord {
  record_type: ReportSeries;
  record_id: number;
  record_date: string;
  record_title: string;
  record_severity: string;
  record_status: string;
  record_context: string;
}

export type ReportRecordFilters = ReportFilters & { search: string; ordering: string };

export interface ReportPayload extends Partial<ReportFilters> {
  title: string;
  period_start: string;
  period_end: string;
}

export const reportsApi = {
  records: (params: ReportRecordFilters, page: number) =>
    api.get<{ count: number; results: ReportRecord[] }>('/reports/records/', { params: { ...params, page } }),
  exportRecords: (params: ReportRecordFilters, format: 'pdf' | 'csv') =>
    api.get<Blob>('/reports/records/export/', { params: { ...params, export: format }, responseType: 'blob' }),
  analytics: (params: ReportFilters) => api.get<ReportAnalytics>('/reports/analytics/', { params }),
  export: (params: ReportFilters, format: 'pdf' | 'csv') => api.get<Blob>('/reports/export/', {
    params: { ...params, export: format }, responseType: 'blob',
  }),
  list:     (params?: Record<string, unknown>) => api.get<PaginatedResponse<Report>>('/reports/', { params }),
  get:      (id: number) => api.get<Report>(`/reports/${id}/`),
  generate: (data: ReportPayload) => api.post<Report>('/reports/', data),
  delete:   (id: number) => api.delete(`/reports/${id}/`),
};

export const auditApi = {
  list: (params?: Record<string, unknown>) => api.get<PaginatedResponse<AuditLog>>('/audit-logs/', { params }),
};
