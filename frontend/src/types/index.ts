// ===================== CORE TYPES =====================

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'new' | 'in_review' | 'resolved' | 'dismissed' | 'escalated';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export type UserRole = 'platform_admin' | 'customer_admin' | 'soc_lead' | 'soc_analyst' | 'lead' | 'analyst';

// ===================== TENANT =====================
export interface Tenant {
  code: string;
  industry: string;
  contact_email: string;
  status: "active" | "suspended";
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ===================== USER =====================
export interface ManagedRole {
  id: number;
  name: string;
  base_role: UserRole;
}

export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  tenant: number | null;
  tenant_name?: string;
  tenant_detail?: { id: number; name: string } | null;
  managed_role?: number | null;
  managed_role_detail?: ManagedRole | null;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}

// ===================== ASSET =====================
export type AssetType = 'server' | 'workstation' | 'network_device' | 'cloud_instance' | 'other';

export interface Asset {
  status: "active" | "inactive" | "decommissioned";
  id: number;
  name: string;
  asset_type: AssetType;
  ip_address: string;
  hostname: string;
  os: string;
  owner: string;
  criticality: Severity;
  tenant: number;
  tenant_name?: string;
  is_active: boolean;
  created_at: string;
}

// ===================== LOG SOURCE =====================
export type LogSourceType = 'syslog' | 'windows_event' | 'api' | 'file' | 'cloud' | 'other';

export interface LogSource {
  asset: number | null;
  asset_detail: { id: number; name: string } | null;
  enabled: boolean;
  secret_key_display: string;
  last_seen: string | null;
  id: number;
  name: string;
  source_type: LogSourceType;
  host: string;
  port: number | null;
  is_active: boolean;
  tenant: number;
  tenant_name?: string;
  last_received: string | null;
  created_at: string;
}

// ===================== EVENT =====================
export interface SecurityEvent {
  occurred_at: string;
  received_at: string;
  id: number;
  event_type: string;
  severity: Severity;
  source_ip: string;
  destination_ip: string;
  source_asset: number | null;
  source_asset_name?: string;
  log_source: number | null;
  log_source_name?: string;
  message: string;
  raw_data: Record<string, unknown>;
  timestamp: string;
  tenant: number;
  alert_id: number | null;
}

// ===================== RULE =====================
export interface RuleCondition {
  id?: number;
  field: string;
  operator: 'eq' | 'ne' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'regex';
  value: string;
}

export interface Rule {
  enabled: boolean;
  id: number;
  name: string;
  description: string;
  event_type: string;
  severity: Severity;
  is_active: boolean;
  conditions: RuleCondition[];
  tenant: number;
  tenant_name?: string;
  created_by: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

// ===================== ALERT =====================
export interface Alert {
  rule_snapshot?: { name?: string; rule_name?: string };
  assignee?: number | null;
  assignee_detail?: { full_name: string } | null;
  id: number;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  rule: number | null;
  rule_name?: string;
  source_event: number | null;
  source_event_data?: SecurityEvent;
  assigned_to: number | null;
  assigned_to_name?: string;
  tenant: number;
  tenant_name?: string;
  triage_notes: string;
  dismiss_reason: string;
  incident: number | null;
  created_at: string;
  updated_at: string;
}

// ===================== INCIDENT =====================
export interface Incident {
  id: number;
  reference: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  owner: number | null;
  owner_name?: string;
  tenant: number;
  tenant_name?: string;
  alerts: number[];
  alert_count?: number;
  playbook: number | null;
  playbook_name?: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TimelineEntry {
  id: number;
  incident: number;
  author: number;
  author_name: string;
  entry_type: 'note' | 'status_change' | 'alert_linked' | 'evidence_added' | 'task_updated' | 'system';
  content: string;
  timestamp: string;
}

export interface Evidence {
  id: number;
  incident: number;
  uploaded_by: number;
  uploaded_by_name: string;
  filename: string;
  file_size: number;
  file_type: string;
  description: string;
  file_url: string;
  uploaded_at: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: number;
  incident: number;
  title: string;
  description: string;
  status: TaskStatus;
  assigned_to: number | null;
  assigned_to_name?: string;
  due_date: string | null;
  completion_notes: string;
  created_at: string;
  updated_at: string;
}

// ===================== PLAYBOOK =====================
export interface PlaybookStep {
  id: number;
  order: number;
  title: string;
  description: string;
  is_automated: boolean;
  action_type: string;
}

export interface Playbook {
  id: number;
  name: string;
  description: string;
  severity_trigger: Severity | null;
  event_type_trigger: string;
  steps: PlaybookStep[];
  tenant: number;
  tenant_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ===================== REPORT =====================
export interface Report {
  id: number;
  title: string;
  report_type: 'daily' | 'weekly' | 'monthly' | 'custom';
  date_from: string;
  date_to: string;
  generated_by: number;
  generated_by_name: string;
  tenant: number;
  summary: Record<string, unknown>;
  created_at: string;
}

// ===================== AUDIT =====================
export interface AuditLog {
  id: number;
  user: number | null;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  timestamp: string;
  tenant: number | null;
}

// ===================== DASHBOARD =====================
export interface DashboardStats {
  total_alerts_new: number;
  active_incidents: number;
  events_24h: number;
  open_tasks: number;
  alerts_by_severity: { severity: string; count: number }[];
  incidents_by_status: { status: string; count: number }[];
  recent_alerts: Alert[];
}

// ===================== PAGINATION =====================
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ===================== AUTH =====================
export interface AuthUser {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  managed_role_detail?: ManagedRole | null;
  tenant: number | null;
  tenant_name?: string;
}
