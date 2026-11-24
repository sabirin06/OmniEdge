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

export const playbooksApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Playbook>>('/playbooks/', { params }),
  get:    (id: number) => api.get<Playbook>(`/playbooks/${id}/`),
  create: (data: PlaybookPayload) => api.post<Playbook>('/playbooks/', data),
  update: (id: number, data: Partial<PlaybookPayload>) => api.patch<Playbook>(`/playbooks/${id}/`, data),
  delete: (id: number) => api.delete(`/playbooks/${id}/`),
};
