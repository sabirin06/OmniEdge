import api from './client';
import type { Incident, TimelineEntry, Evidence, Task, PaginatedResponse } from '../types';

export interface IncidentPayload {
  title: string;
  description: string;
  severity: string;
  status?: string;
  owner?: number | null;
  tenant: number;
  alerts?: number[];
  playbook?: number | null;
}

export const incidentsApi = {
  list:    (params?: Record<string, unknown>) => api.get<PaginatedResponse<Incident>>('/incidents/', { params }),
  get:     (id: number) => api.get<Incident>(`/incidents/${id}/`),
  create:  (data: IncidentPayload) => api.post<Incident>('/incidents/', data),
  update:  (id: number, data: Partial<IncidentPayload>) => api.patch<Incident>(`/incidents/${id}/`, data),
  delete:  (id: number) => api.delete(`/incidents/${id}/`),

  // Timeline
  getTimeline: (id: number) => api.get<TimelineEntry[]>(`/incidents/${id}/timeline/`),
  addNote:     (id: number, content: string) => api.post<TimelineEntry>(`/incidents/${id}/timeline/`, { content, entry_type: 'note' }),

  // Evidence
  getEvidence:    (id: number) => api.get<Evidence[]>(`/incidents/${id}/evidence/`),
  uploadEvidence: (id: number, formData: FormData) =>
    api.post<Evidence>(`/incidents/${id}/evidence/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteEvidence: (incidentId: number, evidenceId: number) =>
    api.delete(`/incidents/${incidentId}/evidence/${evidenceId}/`),

  // Tasks
  getTasks:    (id: number) => api.get<Task[]>(`/incidents/${id}/tasks/`),
  createTask:  (id: number, data: { title: string; description: string; assigned_to?: number | null; due_date?: string | null }) =>
    api.post<Task>(`/incidents/${id}/tasks/`, data),
  updateTask:  (incidentId: number, taskId: number, data: Partial<Task>) =>
    api.patch<Task>(`/incidents/${incidentId}/tasks/${taskId}/`, data),
};
