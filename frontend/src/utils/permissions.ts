import type { UserRole } from '../types';

const tenantStaff: UserRole[] = ['customer_admin', 'soc_analyst', 'soc_lead'];

const pageRoles: Record<string, readonly UserRole[]> = {
  platform: ['platform_admin'],
  alerts: tenantStaff,
  incidents: tenantStaff,
  events: tenantStaff,
  assets: tenantStaff,
  reports: tenantStaff,
  simulator: tenantStaff,
  rules: ['soc_lead'],
  playbooks: ['soc_lead'],
  'log-sources': ['customer_admin', 'soc_lead'],
  audit: ['platform_admin', 'customer_admin', 'soc_lead'],
  users: ['platform_admin', 'customer_admin'],
  tenants: ['platform_admin'],
  roles: ['platform_admin'],
};

export function canAccessPage(role: UserRole | undefined, pathname: string): boolean {
  if (!role) return false;
  const section = pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
  return pageRoles[section]?.includes(role) ?? true;
}
