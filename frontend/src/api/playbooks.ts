import api from './client';
import type { Playbook, PaginatedResponse } from '../types';

export interface PlaybookPayload {
  name: string;
  description: string;
  severity_trigger?: string | null;
  event_type_trigger?: string;
  is_active?: boolean;
  tenant: number;
  steps: { order: number; title: string; description: string; is_automated: boolean; action_type: string }[];
}

export interface StepPayload { position: number; title: string; instructions: string; required: boolean; }
export interface TemplatePayload { name: string; category: string; description: string; enabled: boolean; }

export const playbooksApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Playbook>>('/playbooks/', { params }),
  get:    (id: number) => api.get<Playbook>(`/playbooks/${id}/`),
  create: (data: PlaybookPayload | TemplatePayload) => api.post<Playbook>('/playbooks/', data),
  update: (id: number, data: Partial<PlaybookPayload | TemplatePayload>) => api.patch<Playbook>(`/playbooks/${id}/`, data),
  createStep: (id: number, data: StepPayload) => api.post(`/playbooks/${id}/steps/`, data),
  updateStep: (id: number, stepId: number, data: StepPayload) => api.patch(`/playbooks/${id}/steps/${stepId}/`, data),
  delete: (id: number) => api.delete(`/playbooks/${id}/`),
};
