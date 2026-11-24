import api from './client';
import type { Rule, PaginatedResponse } from '../types';

export interface RulePayload {
  name: string;
  description: string;
  event_type: string;
  severity: string;
  is_active?: boolean;
  conditions: any;
}

export const rulesApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Rule>>('/rules/', { params }),
  get:    (id: number) => api.get<Rule>(`/rules/${id}/`),
  create: (data: RulePayload) => api.post<Rule>('/rules/', data),
  update: (id: number, data: Partial<RulePayload>) => api.patch<Rule>(`/rules/${id}/`, data),
  delete: (id: number) => api.delete(`/rules/${id}/`),
  toggle: (id: number, is_active: boolean) => api.patch<Rule>(`/rules/${id}/`, { is_active }),
  enable: (id: number) => api.post<Rule>(`/rules/${id}/enable/`),
  disable: (id: number) => api.post<Rule>(`/rules/${id}/disable/`),
};
