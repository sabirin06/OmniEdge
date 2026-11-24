import api from './client';
import type { SecurityEvent, PaginatedResponse } from '../types';

export interface SimulatorPayload {
  batch_size: number;
  event_type?: string;
  severity?: string;
  source_id?: number;
}

export const eventsApi = {
  list:     (params?: Record<string, unknown>) => api.get<PaginatedResponse<SecurityEvent>>('/events/', { params }),
  get:      (id: number) => api.get<SecurityEvent>(`/events/${id}/`),
  simulate: (data: SimulatorPayload) => api.post<{ created: number; event_ids: number[]; alerts_created: number; detail: string }>('/simulator/generate/', data),
};
