import api from './client';
import type { Alert, PaginatedResponse } from '../types';

export interface TriagePayload  { severity: string; triage_notes?: string; notes?: string; }
export interface DismissPayload { dismiss_reason?: string; reason?: string; }
export interface BulkStatusPayload { ids: number[]; status: string; }

export const alertsApi = {
  list:    (params?: Record<string, unknown>) => api.get<PaginatedResponse<Alert>>('/alerts/', { params }),
  get:     (id: number) => api.get<Alert>(`/alerts/${id}/`),
  triage:  (id: number, data: TriagePayload) => api.post<Alert>(`/alerts/${id}/triage/`, { severity: data.severity, notes: data.notes ?? data.triage_notes }),
  claim:   (id: number) => api.post<Alert>(`/alerts/${id}/claim/`),
  dismiss: (id: number, data: DismissPayload) => api.post<Alert>(`/alerts/${id}/dismiss/`, { reason: data.reason ?? data.dismiss_reason }),
  escalate:(id: number, data: { title?: string; description?: string; severity?: string } | number) => api.post<{ id: number }>(`/alerts/${id}/escalate/`, typeof data === "number" ? {} : data),
  bulkStatus: (data: BulkStatusPayload) => api.post('/alerts/bulk-status/', data),
};
