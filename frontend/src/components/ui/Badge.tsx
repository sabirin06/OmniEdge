import React from 'react';
import type { Severity, AlertStatus, IncidentStatus } from '../../types';

interface SeverityBadgeProps { severity: Severity; }
interface StatusBadgeProps   { status: AlertStatus | IncidentStatus | string; }

const DOT_COLORS: Record<string, string> = {
  critical: 'var(--color-critical)',
  high:     'var(--color-high)',
  medium:   'var(--color-medium)',
  low:      'var(--color-low)',
  info:     'var(--color-info)',
  new:          'var(--color-new)',
  in_review:    'var(--color-in-review)',
  resolved:     'var(--color-resolved)',
  dismissed:    'var(--color-dismissed)',
  escalated:    'var(--color-escalated)',
  open:         'var(--color-new)',
  investigating:'var(--color-in-review)',
  closed:       'var(--color-resolved)',
};

const LABELS: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info',
  new: 'New', in_review: 'In Review', resolved: 'Resolved', dismissed: 'Dismissed',
  escalated: 'Escalated', open: 'Open', investigating: 'Investigating', closed: 'Closed',
  pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span className={`badge badge-${severity}`}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS[severity], display: 'inline-block', flexShrink: 0 }} />
      {LABELS[severity] ?? severity}
    </span>
  );
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = status.replace('-', '_');
  return (
    <span className={`badge badge-${key}`}>
      {LABELS[key] ?? status}
    </span>
  );
}
