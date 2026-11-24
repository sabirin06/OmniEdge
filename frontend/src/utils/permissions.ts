import type { UserRole } from '../types';

type Permission =
  | 'view:dashboard'
  | 'view:alerts'
  | 'view:incidents'
  | 'view:events'
  | 'view:rules'
  | 'view:tenants'
  | 'view:users'
  | 'view:assets'
  | 'view:log-sources'
  | 'view:simulator'
  | 'view:playbooks'
  | 'view:reports'
  | 'view:audit'
  | 'action:triage'
  | 'action:escalate'
  | 'action:create-incident'
  | 'action:manage-rules'
  | 'action:manage-playbooks'
  | 'action:manage-users';

const LEAD_PERMISSIONS: Permission[] = [
  'view:dashboard', 'view:alerts', 'view:incidents', 'view:events',
  'view:rules', 'view:assets', 'view:log-sources', 'view:playbooks',
  'view:reports', 'view:audit',
  'action:triage', 'action:escalate', 'action:create-incident',
  'action:manage-rules', 'action:manage-playbooks',
];

const ANALYST_PERMISSIONS: Permission[] = [
  'view:dashboard', 'view:alerts', 'view:incidents', 'view:events',
  'view:assets', 'view:reports',
  'action:triage', 'action:escalate', 'action:create-incident',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  platform_admin: [
    'view:dashboard', 'view:tenants', 'view:users', 'action:manage-users',
  ],
  customer_admin: [
    'view:dashboard', 'view:alerts', 'view:incidents', 'view:events',
    'view:users', 'view:assets', 'view:log-sources', 'view:simulator',
    'view:reports', 'view:audit', 'action:manage-users',
    'action:triage', 'action:escalate', 'action:create-incident',
  ],
  soc_lead: LEAD_PERMISSIONS,
  lead: LEAD_PERMISSIONS,
  soc_analyst: ANALYST_PERMISSIONS,
  analyst: ANALYST_PERMISSIONS,
};

export function can(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasRole(role: UserRole | undefined, ...roles: UserRole[]): boolean {
  if (!role) return false;
  return roles.includes(role);
}
