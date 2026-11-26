import api from './client';
import type { PaginatedResponse } from '../types';

export type PlatformSection = 'overview' | 'reports' | 'health' | 'users' | 'active-users' | 'inactive-users' | 'tenants' | 'events' | 'alerts' | 'incidents' | 'log-sources' | 'failed-logins' | 'authentication' | 'audit' | 'ticket';
export interface PlatformHealth { api: string; database: string; database_probe_ms: number; last_event: string | null }
export interface PlatformOverview { counts: Record<string, number>; health: PlatformHealth; as_of: string; activity: { action: string; timestamp: string }[] }
export interface PlatformSettings { support_minutes: number; notification_email: string; maintenance_notice: string; email_transport?: string; smtp_host_configured?: boolean }
export interface DetectionTemplate { event_type: string; conditions: Record<string, unknown>; severity: string; enabled: boolean }
export interface PlatformWork { configuration?: DetectionTemplate; id: number; title: string; details: string; status: string; updated_at: string }
export interface PlatformPreview {
  tenant: string; reason: string; expires_at: string;
  target: { name: string; role: import('../types').UserRole; active: boolean } | null;
  counts: Record<string, number>;
  sections: string[];
  records: { columns: string[]; count: number; results: Record<string, unknown>[] } | null;
}

export const platformApi = {
  overview: () => api.get<PlatformOverview>('/platform/'),
  report: () => api.get<PlatformOverview>('/platform/reports/'),
  health: () => api.get<PlatformHealth>('/platform/health/'),
  records: (section: string, page: number) => api.get<{ count: number; columns: string[]; results: Record<string, unknown>[] }>(`/platform/${section}/`, { params: { page } }),
  settings: () => api.get<PlatformSettings>('/platform/settings/'),
  saveSettings: ({ support_minutes, notification_email, maintenance_notice }: PlatformSettings) =>
    api.put('/platform/settings/', { support_minutes, notification_email, maintenance_notice }),
  work: (kind: string, page: number) => api.get<PaginatedResponse<PlatformWork>>(`/platform/work/${kind}/`, { params: { page } }),
  saveWork: (kind: string, id: number | undefined, data: Pick<PlatformWork, 'title' | 'details' | 'status' | 'configuration'>) =>
    id ? api.patch(`/platform/work/${kind}/${id}/`, { ...data, confirm: true }) : api.post(`/platform/work/${kind}/`, { ...data, confirm: true }),
  access: (kind: 'users' | 'tenants', id: number, state: string) => api.post(`/platform/access/${kind}/${id}/`, { state, confirm: true }),
  support: (data: { tenant: number; target?: number; reason: string }) =>
    api.post<{ id: number; expires_at: string }>('/platform/support/', data),
  userCounts: () => api.get<Record<'all' | 'active' | 'inactive' | 'disabled', number>>('/platform/user-counts/'),
  userActivity: (id: number, page: number) => api.get<PaginatedResponse<{
    id: number; action: string; timestamp: string; actor__email: string | null;
  }>>(`/platform/users/${id}/activity/`, { params: { page } }),
  preview: (section = '') => api.get<PlatformPreview>('/platform/support/', { params: { section } }),
  endSupport: () => api.delete('/platform/support/'),
  notice: () => api.get<{ maintenance: string; support_active: boolean }>('/platform/notice/'),
};
