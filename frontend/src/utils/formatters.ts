import type { Severity, AlertStatus, IncidentStatus, UserRole } from '../types';

// ---- Date / Time ----
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---- Severity ----
export const severityColors: Record<Severity, string> = {
  critical: 'var(--color-critical)',
  high:     'var(--color-high)',
  medium:   'var(--color-medium)',
  low:      'var(--color-low)',
  info:     'var(--color-info)',
};

export const severityLabels: Record<Severity, string> = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
  info:     'Info',
};

// ---- Alert Status ----
export const alertStatusLabels: Record<AlertStatus, string> = {
  new:        'New',
  in_review:  'In Review',
  resolved:   'Resolved',
  dismissed:  'Dismissed',
  escalated:  'Escalated',
};

// ---- Incident Status ----
export const incidentStatusLabels: Record<IncidentStatus, string> = {
  open:          'Open',
  investigating: 'Investigating',
  resolved:      'Resolved',
  closed:        'Closed',
};

// ---- Role Labels ----
export const roleLabels: Record<string, string> = {
  platform_admin:  'Platform Admin',
  customer_admin:  'Customer Admin',
  soc_lead:        'SOC Lead',
  soc_analyst:     'SOC Analyst',
  lead:            'SOC Lead',
  analyst:         'SOC Analyst',
};

// ---- File Size ----
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Capitalize ----
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// ---- Chart colors ----
export const SEVERITY_CHART_COLORS: Record<string, string> = {
  critical: '#FF7B72',
  high:     '#F97316',
  medium:   '#E3B341',
  low:      '#3FB950',
  info:     '#58A6FF',
};

export const STATUS_CHART_COLORS: Record<string, string> = {
  open:          '#58A6FF',
  investigating: '#E3B341',
  resolved:      '#3FB950',
  closed:        '#8B949E',
};
